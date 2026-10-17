/**
 * mcpTools.js — #807 Phase 2 (US-P2.5): wire hands/grants.json into the
 * generateWithTools loop.
 *
 * The root-cause audit found MCP grants were health-checked daily but
 * NEVER reachable from a delegation: agents' tool registry was a static
 * six-tool map, and the two Tavily prefetches were the only MCP-shaped
 * code path. This module turns an agent's granted MCP servers into
 * registry-shaped tool entries (namespaced mcp_<server>_<tool>) that the
 * loops merge into their tool definitions and runTool dispatches through
 * agentTools.executeMcpTool (which re-checks the grant and issues the
 * standard receipt).
 *
 * Discovery is cached per process; a failing server degrades gracefully
 * (its tools simply don't appear) and backs off for 60s so a dead server
 * never stalls every delegation.
 */

const fs = require('fs');
const path = require('path');

const GRANTS_PATH = path.join(__dirname, '..', '..', 'hands', 'grants.json');
const FAILURE_BACKOFF_MS = 60000;

const discoveryCache = new Map(); // server -> { tools: [...], at }
const failureCache = new Map(); // server -> failedAt

function loadGrants() {
  try {
    return JSON.parse(fs.readFileSync(GRANTS_PATH, 'utf8'));
  } catch {
    return { roles: {}, servers: {}, defaults: {} };
  }
}

function grantedServers(agentId) {
  if (!agentId) return [];
  const grants = loadGrants();
  const role = grants.roles && grants.roles[agentId];
  return (role && Array.isArray(role.servers)) ? role.servers : [];
}

function mcpBudgetFor(agentId) {
  const grants = loadGrants();
  const role = (grants.roles && grants.roles[agentId]) || {};
  const budgets = role.budgets || {};
  const defaults = grants.defaults || {};
  return budgets.max_tool_calls || defaults.max_tool_calls || 8;
}

function sanitize(name) {
  return String(name).replace(/[^a-zA-Z0-9_-]/g, '_');
}

const DISCOVERY_TIMEOUT_MS = 8000;

async function discoverServerTools(server) {
  const cached = discoveryCache.get(server);
  if (cached) return cached.tools;
  const failedAt = failureCache.get(server);
  if (failedAt && Date.now() - failedAt < FAILURE_BACKOFF_MS) return [];
  try {
    const mcpClient = require('../engine/mcpClient');
    // Time-boxed: a wedged MCP server must never stall a delegation
    // (or a test suite) — discovery is an enhancement, not a dependency.
    const tools = await Promise.race([
      mcpClient.listTools(server),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`discovery timeout ${DISCOVERY_TIMEOUT_MS}ms`)), DISCOVERY_TIMEOUT_MS)),
    ]);
    const list = Array.isArray(tools) ? tools : [];
    discoveryCache.set(server, { tools: list, at: Date.now() });
    failureCache.delete(server);
    return list;
  } catch (e) {
    failureCache.set(server, Date.now());
    console.log(`[mcpTools] discovery failed for ${server}: ${e.message.slice(0, 120)} (tools unavailable this run)`);
    return [];
  }
}

/**
 * Build registry-shaped tool entries for every MCP tool granted to the
 * agent. Returns {} when the agent has no grants or all servers fail.
 */
async function buildMcpToolDefs(agentId) {
  const servers = grantedServers(agentId);
  if (!servers.length) return {};
  const defs = {};
  // Servers discovered in parallel — total discovery time is bounded by
  // the slowest server's timeout, not the sum.
  const perServer = await Promise.all(servers.map(async (server) => [server, await discoverServerTools(server)]));
  for (const [server, tools] of perServer) {
    for (const tool of tools) {
      const name = `mcp_${sanitize(server)}_${sanitize(tool.name)}`;
      defs[name] = {
        description: `[MCP:${server}] ${tool.description || tool.name}`,
        argsSchema: tool.inputSchema || { type: 'object', properties: {}, required: [] },
        strict: false, // server schemas are arbitrary JSON Schema — no OpenAI strict forcing
        mcp: { server, tool: tool.name },
      };
    }
  }
  return defs;
}

module.exports = { buildMcpToolDefs, grantedServers, mcpBudgetFor, loadGrants, _discoveryCache: discoveryCache };
