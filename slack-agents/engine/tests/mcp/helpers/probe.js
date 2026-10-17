'use strict';
// Shared probe: spawns one MCP server EXACTLY as grants.json configures it
// (same command/args/env-substitution/cwd) through the real MCP SDK
// StdioClientTransport, runs initialize + tools/list, and reports the result.
//
// A test passes ONLY when the full client -> server path works end to end.
// Secrets are read from process.env (same resolution as production) and are
// never printed.

const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const SLACK_AGENTS = path.resolve(__dirname, '..', '..', '..', '..');
const HANDS_ROOT = path.resolve(SLACK_AGENTS, '..', 'hands');
const GRANTS_FILE = path.join(HANDS_ROOT, 'grants.json');

function loadGrants() {
  return require(GRANTS_FILE);
}

function specFor(serverName) {
  const g = loadGrants();
  const spec = g.servers[serverName];
  if (!spec) throw new Error(`server "${serverName}" is not defined in grants.json`);
  return spec;
}

function rolesGranting(serverName) {
  const g = loadGrants();
  return Object.entries(g.roles)
    .filter(([, r]) => (r.servers || []).includes(serverName))
    .map(([role]) => role);
}

function resolveEnv(spec) {
  const env = { ...process.env };
  for (const [k, v] of Object.entries(spec.env || {})) {
    const resolved = String(v).replace(/\$\{([A-Z0-9_]+)\}/g, (_, varName) => {
      const val = process.env[varName];
      if (!val) throw new Error(`server needs env ${varName} — refusing to start with an empty credential`);
      return val;
    });
    env[k] = resolved;
  }
  return env;
}

// Spawns the server and lists its tools. Resolves to a result object — never
// throws — so jest assertions can report WHY the path is broken.
async function probeServer(serverName, { timeoutMs = 60000 } = {}) {
  const started = Date.now();
  const result = { server: serverName, ok: false, tools: [], error: null, ms: 0 };
  let transport = null;
  try {
    const spec = specFor(serverName);
    const env = resolveEnv(spec);
    const cwd = spec.cwd === 'hands' ? HANDS_ROOT : (spec.cwd || HANDS_ROOT);
    transport = new StdioClientTransport({
      command: spec.command || 'node',
      args: spec.args || [],
      env,
      cwd,
      stderr: 'pipe',
    });
    let stderrTail = '';
    if (transport.stderr) {
      transport.stderr.on('data', (d) => { stderrTail = String(d).slice(-500); });
    }
    const client = new Client({ name: 'macf-mcp-probe', version: '0.1.0' }, { capabilities: {} });
    await Promise.race([
      client.connect(transport),
      new Promise((_, rej) => setTimeout(
        () => rej(new Error(`initialize timed out after ${timeoutMs}ms`)), timeoutMs)),
    ]);
    const { tools } = await Promise.race([
      client.listTools(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('tools/list timed out after 30000ms')), 30000)),
    ]);
    result.ok = true;
    result.tools = tools.map((t) => t.name);
    await client.close().catch(() => {});
    if (!result.tools.length) {
      result.ok = false;
      result.error = 'server connected but exposed zero tools';
    }
  } catch (e) {
    result.error = String((e && e.message) || e).slice(0, 400);
  } finally {
    result.ms = Date.now() - started;
    try { transport && transport.close && transport.close(); } catch (e) { /* ignore */ }
  }
  return result;
}

module.exports = { loadGrants, specFor, rolesGranting, probeServer, HANDS_ROOT, GRANTS_FILE };
