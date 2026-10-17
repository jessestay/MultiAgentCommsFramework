'use strict';
// mcp-client/index.js — MACF Hands Gateway runtime client.
//
// Gives Slack agents "hands": spawns the MCP servers granted to the caller's
// role (grants.json), injects the role token (layer-2 server-side check), and
// runs a budgeted ReAct tool loop against the LiteLLM gateway.
//
// Enforcement (defense in depth):
//   1. Client config: this module only spawns servers listed for the role in
//      grants.json. A role can never see another role's servers.
//   2. Server-side: each server checks MACF_ROLE + MACF_ROLE_TOKEN itself and
//      refuses to start for the wrong role.
//
// Budgets (per task, from grants.json or defaults):
//   max_tool_calls, max_tool_latency_ms — on exhaustion the loop stops and
//   returns what was verified, flagging the rest UNVERIFIED. Never fabricate.
//
// Audit: every tool call is appended to hands/logs/tool-calls.log.
// Args are SHA-256 hashed (may contain PII/financial data), never raw.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const HANDS_ROOT = path.resolve(__dirname, '..', '..', 'hands');
const GRANTS_FILE = path.join(HANDS_ROOT, 'grants.json');
const ROLE_TOKENS_FILE = path.join(HANDS_ROOT, '.role-tokens');
const AUDIT_LOG = path.join(HANDS_ROOT, 'logs', 'tool-calls.log');

// ─── Grants ──────────────────────────────────────────────────────────────
let grantsCache = null;
function loadGrants() {
  if (grantsCache) return grantsCache;
  const raw = fs.readFileSync(GRANTS_FILE, 'utf8');
  const g = JSON.parse(raw);
  if (!g.roles || !g.servers) throw new Error('grants.json missing roles/servers');
  grantsCache = g;
  return g;
}

function serversForRole(role) {
  const g = loadGrants();
  const r = g.roles[role];
  if (!r) throw new Error(`[mcp-client] unknown role "${role}" — no grants`);
  const names = r.servers || [];
  for (const n of names) {
    if (!g.servers[n]) throw new Error(`[mcp-client] grants.json references unknown server "${n}"`);
  }
  return names;
}

function budgetsForRole(role) {
  const g = loadGrants();
  const d = g.defaults || {};
  const r = (g.roles[role] && g.roles[role].budgets) || {};
  return {
    maxToolCalls: r.max_tool_calls ?? d.max_tool_calls ?? 8,
    maxToolLatencyMs: r.max_tool_latency_ms ?? d.max_tool_latency_ms ?? 120000,
    maxToolOutputChars: r.max_tool_output_chars ?? d.max_tool_output_chars ?? 8000,
  };
}

// ─── Role tokens ─────────────────────────────────────────────────────────
// Source: env var MACF_<ROLE>_ROLE_TOKEN first (Railway/production — the
// 600-mode file is never committed), then the local .role-tokens file.
function roleToken(role) {
  const upper = String(role).toUpperCase();
  const fromEnv = process.env[`MACF_${upper}_ROLE_TOKEN`];
  if (fromEnv) return fromEnv.trim();
  const lines = fs.readFileSync(ROLE_TOKENS_FILE, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(new RegExp(`^${upper}=([^\\s]+)$`));
    if (m) return m[1].trim();
  }
  throw new Error(`[mcp-client] no role token for "${role}" (set MACF_${upper}_ROLE_TOKEN or add to .role-tokens)`);
}

// ─── Audit ───────────────────────────────────────────────────────────────
function audit({ role, server, tool, args, ok, summary, latencyMs }) {
  const entry = {
    ts: new Date().toISOString(),
    role, server, tool,
    args_hash: crypto.createHash('sha256').update(JSON.stringify(args || {})).digest('hex').slice(0, 16),
    ok,
    summary: String(summary || '').slice(0, 300),
    latency_ms: latencyMs ?? null,
  };
  try {
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error('[mcp-client] audit log write failed:', e.message);
  }
}

// ─── Server spawning (stdio) ─────────────────────────────────────────────
// Returns { clients: Map<serverName, {client, tools, kill}>, tools: [...] }
// where tools[] are OpenAI function-calling style tool definitions with an
// added _mcp = { server, name } marker for dispatch.
async function connectRole(role) {
  const g = loadGrants();
  const names = serversForRole(role);
  const token = roleToken(role);
  const clients = new Map();
  const openAiTools = [];

  for (const name of names) {
    const spec = g.servers[name];
    const cwd = spec.cwd === 'hands' ? HANDS_ROOT : (spec.cwd || HANDS_ROOT);
    const env = { ...process.env };
    for (const [k, v] of Object.entries(spec.env || {})) {
      env[k] = String(v).replace(/\$\{([A-Z0-9_]+)\}/g, (_, varName) => {
        const val = process.env[varName];
        if (!val) throw new Error(`[mcp-client] server "${name}" needs env ${varName} — refusing to start with an empty credential`);
        return val;
      });
    }
    // Layer-2 auth context: the server checks these itself.
    env.MACF_ROLE = role.toUpperCase();
    env.MACF_ROLE_TOKEN = token;

    const transport = new StdioClientTransport({
      command: spec.command || 'node',
      args: spec.args || [],
      env,
      cwd,
      stderr: 'pipe',
    });
    const client = new Client({ name: `macf-agent-${role}`, version: '0.1.0' }, { capabilities: {} });
    // Surface server stderr (refusals, errors) to our logs — never to chat.
    if (transport.stderr) {
      transport.stderr.on('data', (d) => console.error(`[mcp:${name}]`, String(d).trim().slice(0, 300)));
    }
    await client.connect(transport);
    const { tools } = await client.listTools();
    audit({ role, server: name, tool: 'tools/list', args: {}, ok: true, summary: `${tools.length} tools`, latencyMs: 0 });
    clients.set(name, { client, transport, tools });

    for (const t of tools) {
      openAiTools.push({
        type: 'function',
        function: {
          name: `${name}__${t.name}`,
          description: `[${name}] ${t.description || t.name}`,
          parameters: t.inputSchema || { type: 'object', properties: {} },
        },
        _mcp: { server: name, tool: t.name },
      });
    }
  }
  return { clients, openAiTools };
}

async function disconnectAll(conn) {
  for (const [name, { client }] of conn.clients) {
    try { await client.close(); } catch (e) { console.error(`[mcp-client] close ${name}:`, e.message); }
  }
}

// Execute one tool call through the connected MCP client, with a per-call
// timeout so one hung server can't eat the whole latency budget.
async function callTool(conn, budgets, role, openAiTool, args) {
  const { server, tool } = openAiTool._mcp;
  const entry = conn.clients.get(server);
  if (!entry) throw new Error(`[mcp-client] server "${server}" not connected`);
  const started = Date.now();
  const TIMEOUT_MS = 60000;
  const result = await Promise.race([
    entry.client.callTool({ name: tool, arguments: args || {} }),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`tool timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)),
  ]);
  const latencyMs = Date.now() - started;
  const text = (result.content || []).map(c => c.text || JSON.stringify(c)).join('\n');
  const summary = result.isError ? `ERROR: ${text.slice(0, 200)}` : `ok, ${text.length} chars`;
  audit({ role, server, tool, args, ok: !result.isError, summary, latencyMs });
  return { text: text.slice(0, budgets.maxToolOutputChars), isError: !!result.isError, latencyMs };
}

// ─── Text-fallback tool protocol ─────────────────────────────────────────
// The budget-tier gateway models don't reliably emit native tool_calls
// (verified Oct 1, 2026: sometimes a proper array, sometimes garbled
// pseudo-XML). So the loop also accepts a JSON tool call written in the
// reply text. The prompt (below) teaches the exact shape; this parses it.
function extractTextToolCalls(text, openAiTools) {
  if (!text) return [];
  const known = new Map(openAiTools.map(t => [t.function.name, t]));
  const calls = [];
  // ```json { "name": "...", "arguments": {...} } ``` blocks, or bare objects.
  const blocks = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g) || [];
  const candidates = blocks.map(b => b.replace(/```(?:json)?\s*|\s*```/g, ''));
  // Also try the whole text if it looks like a single JSON object.
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) candidates.push(trimmed);
  for (const c of candidates) {
    try {
      const o = JSON.parse(c);
      if (o && typeof o.name === 'string' && known.has(o.name)) {
        calls.push({ id: `text-${calls.length}`, toolName: o.name, args: o.arguments || {} });
      }
    } catch (e) { /* not JSON, ignore */ }
  }
  return calls;
}

function toolProtocolPrompt(openAiTools) {
  const specs = openAiTools.map(t =>
    `- ${t.function.name}: ${t.function.description || ''}\n  args JSON schema: ${JSON.stringify(t.function.parameters)}`
  ).join('\n');
  return `
TOOL PROTOCOL (follow exactly):
You have these tools:
${specs}
To call tools, reply with ONLY a json code block, one call per block:
\`\`\`json
{"name": "TOOL_NAME", "arguments": {...}}
\`\`\`
You may emit several blocks in one reply. After the tool results come back, either call more tools or give your final answer as plain text with NO json block. Never invent tool results. If a tool errors, say so honestly.`.trim();
}
// ─── Garbage guard ─────────────────────────────────────────────────────────
// Weak local models sometimes emit malformed tool-call attempts instead of
// a final answer (verified Oct 1, 2026: pseudo-XML + mojibake). Posting that
// to Slack would be worse than no answer. Detect it and substitute a clean
// failure message built from the verified tool summaries.
function looksLikeGarbledToolCall(text, openAiTools) {
  if (!text) return false;
  const mentionsTool = openAiTools.some(t =>
    text.includes(t.function.name) || text.includes(t._mcp.tool));
  if (!mentionsTool) return false;
  // Legitimate final answers don't contain tool-call markup or raw JSON
  // shaped like a call. Either present => the model was trying to call.
  if (/<\/?tool_call>/.test(text)) return true;
  if (/\{\s*"name"\s*:\s*"/.test(text)) return true;
  return false;
}

function cleanFailureMessage(toolSummaries) {
  const evidence = toolSummaries.length ? toolSummaries.join(' | ') : 'no tool completed';
  return `I tried to verify this against the real numbers but could not complete the check (${evidence}). Nothing here is confirmed — treat every figure as UNVERIFIED. I will not guess.`;
}

// ─── Model fallback for hands turns ────────────────────────────────────────
// turnFn: ({ messages, tools, model }) => Promise<{ text, toolCalls }>
// Tries the primary (free) tier first; falls back to the fallback tier when
// the primary errors or garbles a tool call. Keeps hands on the budget-first
// policy while guaranteeing a tool-capable model when it matters.
function withModelFallback(turnFn, { primary = 'smart', fallback = 'best' } = {}) {
  return async ({ messages, tools }) => {
    try {
      const turn = await turnFn({ messages, tools, model: primary });
      const nativeCalls = (turn.toolCalls && turn.toolCalls.length) || 0;
      if (nativeCalls > 0 || !looksLikeGarbledToolCall(turn.text, tools)) {
        return turn;
      }
      console.log(`[mcp-client] ${primary} tier garbled a tool call — falling back to ${fallback} tier`);
    } catch (err) {
      console.log(`[mcp-client] ${primary} tier failed (${String(err.message).slice(0, 100)}) — falling back to ${fallback} tier`);
    }
    return turnFn({ messages, tools, model: fallback });
  };
}

async function runToolLoop({ role, systemPrompt, userMessage, llmTurn, onProgress }) {
  const budgets = budgetsForRole(role);
  const conn = await connectRole(role);
  let toolCallsUsed = 0;
  const toolSummaries = [];
  const recentFailures = []; // signatures of failed calls, for the circuit breaker
  let toolMsTotal = 0; // tool execution time only — LLM thinking time does not count against the tool-latency budget
  // Teach the text-fallback protocol alongside the native tool schemas.
  const protocol = toolProtocolPrompt(conn.openAiTools);
  try {
    const messages = [
      ...(systemPrompt ? [{ role: 'system', content: `${systemPrompt}\n\n${protocol}` }] : [{ role: 'system', content: protocol }]),
      { role: 'user', content: userMessage },
    ];
    for (;;) {
      if (toolCallsUsed >= budgets.maxToolCalls) {
        toolSummaries.push(`BUDGET: stopped after ${budgets.maxToolCalls} tool calls — remaining steps UNVERIFIED`);
        break;
      }
      if (toolMsTotal >= budgets.maxToolLatencyMs) {
        toolSummaries.push(`BUDGET: stopped after ${budgets.maxToolLatencyMs}ms tool latency — remaining steps UNVERIFIED`);
        break;
      }
      const turn = await llmTurn({ messages, tools: conn.openAiTools });
      let toolCalls = turn.toolCalls || [];
      let viaText = false;
      if (toolCalls.length === 0 && turn.text) {
        // Native tool_calls missing — try the text-fallback protocol.
        toolCalls = extractTextToolCalls(turn.text, conn.openAiTools);
        viaText = toolCalls.length > 0;
      }
      if (toolCalls.length === 0) {
        let finalText = turn.text;
        if (looksLikeGarbledToolCall(finalText, conn.openAiTools)) {
          toolSummaries.push('GARBAGE-GUARD: model emitted malformed tool call instead of an answer — substituted clean failure');
          finalText = cleanFailureMessage(toolSummaries);
        }
        return { text: finalText, toolSummaries, toolCallsUsed };
      }
      if (viaText) toolSummaries.push(`(model used text-fallback tool protocol)`);
      const toolResults = [];
      for (const tc of toolCalls) {
        const def = conn.openAiTools.find(t => t.function.name === tc.toolName);
        if (!def) {
          toolResults.push({ id: tc.id, text: `ERROR: unknown tool ${tc.toolName}`, isError: true });
          continue;
        }
        // Circuit breaker: same tool + same args failing repeatedly means
        // retrying is pointless. Refuse the 3rd identical attempt.
        const sig = `${tc.toolName}:${JSON.stringify(tc.args || {})}`;
        const identicalFails = recentFailures.filter(s => s === sig).length;
        if (identicalFails >= 2) {
          const msg = `REFUSED: ${tc.toolName} with these arguments already failed twice — retrying will not help. Report what is verified and mark the rest UNVERIFIED.`;
          toolResults.push({ id: tc.id, text: `ERROR: ${msg}`, isError: true });
          toolSummaries.push(`${tc.toolName}: circuit-breaker tripped (2 identical failures)`);
          continue;
        }
        toolCallsUsed += 1;
        if (onProgress) onProgress({ role, tool: tc.toolName, n: toolCallsUsed });
        try {
          const r = await callTool(conn, budgets, role, def, tc.args);
          toolMsTotal += r.latencyMs || 0;
          toolResults.push({ id: tc.id, text: r.text, isError: r.isError });
          toolSummaries.push(`${tc.toolName}: ${r.isError ? 'FAILED' : 'ok'} (${r.latencyMs}ms)`);
          if (r.isError) recentFailures.push(sig);
        } catch (err) {
          recentFailures.push(sig);
          audit({ role, server: def._mcp.server, tool: def._mcp.tool, args: tc.args, ok: false, summary: err.message, latencyMs: null });
          toolResults.push({ id: tc.id, text: `ERROR: ${err.message}`, isError: true });
          toolSummaries.push(`${tc.toolName}: FAILED (${err.message.slice(0, 100)})`);
        }
      }
      // Feed results back in the same shape the model produced.
      if (viaText) {
        const rendered = toolResults.map(r => `Result of ${r.id}:\n${r.text}`).join('\n\n');
        messages.push({ role: 'user', content: `Tool results:\n${rendered}\n\nContinue: call more tools with the json protocol, or give your final answer as plain text.` });
      } else {
        messages.push({ role: 'assistant', toolCalls });
        messages.push({ role: 'tool', results: toolResults });
      }
    }
    // Budget exhausted without a final answer — return verified-so-far.
    return { text: null, toolSummaries, toolCallsUsed, budgetExhausted: true };
  } finally {
    await disconnectAll(conn);
  }
}

module.exports = {
  loadGrants, serversForRole, budgetsForRole, roleToken,
  connectRole, disconnectAll, callTool, runToolLoop, audit,
  extractTextToolCalls, looksLikeGarbledToolCall, cleanFailureMessage,
  withModelFallback,
  HANDS_ROOT, GRANTS_FILE, AUDIT_LOG,
};
