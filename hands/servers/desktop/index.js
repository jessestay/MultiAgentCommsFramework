#!/usr/bin/env node
// servers/desktop/index.js — desktop-agent MCP server
//
// Capability-scoped MCP server: access to Jesse's desktop (DESKTOP-4U63DES)
// through the desktop agent — health checks, bounded PowerShell commands,
// and the agent log. Built Oct 12, 2026 under Jesse's order: "Extend the
// CTO's grants to the desktop channels" (Vikunja #738).
//
// Granted (hands/grants.json): ceo, cto. This is the desktop channel the
// CTO needs for work like the LiteLLM gateway inspection (#736): reading
// process state, config, and logs ON the desktop, which VM-side tools
// cannot see.
//
// Transport: shells out to the proven desktop-run client
// (~/workspace/desktop-agent/bin/desktop-run), which talks to the agent at
// 100.92.127.117:8099 via the tunnel proxy. The agent token comes from
// DESKTOP_RUN_TOKEN (grants.json expands ${DESKTOP_AGENT_TOKEN} from
// slack-agents/.env). The server errors clearly if it is unset — it never
// fabricates desktop output.
//
// Access control: grants.json role lists are layer 1 (only granted roles
// ever load this server). Server-side layer 2: when MACF_ROLE is set it
// must be CTO or CEO and MACF_ROLE_TOKEN must match hands/.role-tokens;
// when MACF_ROLE is unset (the current client does not set it), the call
// proceeds under layer 1 and is audit-logged either way.
//
// Safety: the desktop agent is SINGLE-THREADED — one long command blocks
// all others. desktop_run caps timeoutSec at 300 and callers are expected
// to keep commands small and bounded (no unbounded recursive scans).
//
// Audit: every tool call is appended as JSON to logs/desktop-audit.log.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const HANDS_ROOT = path.resolve(__dirname, '..', '..');
const ROLE_TOKENS_FILE = path.join(HANDS_ROOT, '.role-tokens');
const AUDIT_LOG = path.join(HANDS_ROOT, 'logs', 'desktop-audit.log');
const DESKTOP_RUN_CLIENT = '/home/hatch/workspace/desktop-agent/bin/desktop-run';
const ALLOWED_ROLES = ['CTO', 'CEO'];

// ─── Role gate (layer 2, enforced when the client identifies a role) ────────
function checkRole() {
  const role = process.env.MACF_ROLE;
  if (!role) return 'UNSET';
  if (!ALLOWED_ROLES.includes(role)) {
    console.error(`[desktop-agent] REFUSED: MACF_ROLE ${role} is not granted desktop access`);
    process.exit(2);
  }
  const token = process.env.MACF_ROLE_TOKEN;
  let expected = process.env[`MACF_${role}_ROLE_TOKEN`] || null;
  if (!expected) {
    try {
      const lines = fs.readFileSync(ROLE_TOKENS_FILE, 'utf8').split('\n');
      for (const line of lines) {
        const m = line.match(new RegExp(`^${role}=(.+)$`));
        if (m) expected = m[1].trim();
      }
    } catch (e) { /* missing file -> refuse below */ }
  }
  if (!expected || !token || token !== expected) {
    console.error('[desktop-agent] REFUSED: invalid role token');
    process.exit(2);
  }
  return role;
}

// ─── Audit log ───────────────────────────────────────────────────────────────
function audit(role, tool, args, ok, summary) {
  const entry = {
    ts: new Date().toISOString(),
    server: 'desktop-agent',
    role,
    tool,
    args,
    ok,
    summary: String(summary).slice(0, 500),
  };
  try {
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error('[desktop-agent] audit log write failed:', e.message);
  }
}

// ─── Desktop client ──────────────────────────────────────────────────────────
function desktopCall(argv, timeoutMs) {
  return new Promise((resolve) => {
    if (!process.env.DESKTOP_RUN_TOKEN) {
      resolve({ ok: false, error: 'DESKTOP_RUN_TOKEN not configured — desktop channel unavailable. Not fabricating output.' });
      return;
    }
    execFile('python3', [DESKTOP_RUN_CLIENT, ...argv], {
      encoding: 'utf8',
      timeout: timeoutMs,
      env: { ...process.env },
    }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, error: String(stderr || err.message).slice(0, 500), output: String(stdout || '').slice(0, 2000) });
      } else {
        resolve({ ok: true, output: String(stdout).slice(0, 8000) });
      }
    });
  });
}

async function desktopHealth() {
  return desktopCall(['health'], 30000);
}

async function desktopRun({ command, timeoutSec }) {
  const t = Math.max(5, Math.min(parseInt(timeoutSec, 10) || 120, 300));
  const r = await desktopCall([command, String(t)], (t + 30) * 1000);
  return r.ok ? { ...r, timeoutSec: t } : r;
}

async function desktopLog({ tail }) {
  const n = Math.max(1, Math.min(parseInt(tail, 10) || 50, 500));
  return desktopCall(['log', String(n)], 30000);
}

// ─── MCP server ──────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'desktop_health',
    description: 'Health of Jesse\'s desktop agent (DESKTOP-4U63DES). Returns the agent health JSON.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    run: desktopHealth,
  },
  {
    name: 'desktop_run',
    description: 'Run a PowerShell command on Jesse\'s desktop via the desktop agent. Keep commands SMALL and BOUNDED (the agent is single-threaded; no unbounded recursive scans). timeoutSec 5-300, default 120.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        timeoutSec: { type: 'number' },
      },
      required: ['command'],
    },
    run: desktopRun,
  },
  {
    name: 'desktop_log',
    description: 'Tail the desktop agent\'s own log (default 50 lines, max 500).',
    inputSchema: {
      type: 'object',
      properties: { tail: { type: 'number' } },
      required: [],
    },
    run: desktopLog,
  },
];

async function main() {
  const role = checkRole();
  const server = new Server(
    { name: 'desktop-agent', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find(t => t.name === req.params.name);
    const args = req.params.arguments || {};
    if (!tool) {
      audit(role, req.params.name, args, false, 'unknown tool');
      return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }] };
    }
    const result = await tool.run(args);
    audit(role, tool.name, args, !!result.ok, result.ok ? 'ok' : result.error);
    return {
      isError: !result.ok,
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  });

  await server.connect(new StdioServerTransport());
  console.error(`[desktop-agent] ready (role=${role})`);
}

main().catch((e) => {
  console.error('[desktop-agent] fatal:', e.message);
  process.exit(1);
});
