'use strict';

/**
 * LLM path canary (Oct 12, 2026 — CEO mechanism repair, Jesse's directive).
 *
 * Root cause it closes: on Oct 12, 2026 the team's model path failed for
 * hours while every automated check reported health. The watchdog's desktop
 * probe tests tunnel/SSH/agent reachability — never the gateway route or a
 * real generation — and its escalation only echoed into its own log. The
 * self-healer's repairs for delivery failures are themselves LLM calls, so
 * it could only log NEEDS_CEO notes. The directive poller dead-lettered
 * silently. Nothing anywhere made a real test generation on a schedule.
 *
 * This canary makes ONE minimal real generation through the engine's actual
 * route stack (utils/litellm chat: desktop gateway first, failover after).
 * Only when the stack fails does it probe the legs for attribution
 * (direct route, gateway reachability). Repairs it may attempt are bounded
 * and safe: clear the gateway negative cache (_resetGatewayCache) and
 * retest once — a stale cache after a transient flap is a known failure
 * mode. Anything still down after that becomes an engine gap the same
 * cycle (engine/.engine-gaps.json via engineGap.js), not a log line.
 *
 * State: engine/.llm-canary-state.json (last result + short history).
 * Runs from the engine watchdog (15-min cadence). CLI prints one JSON line
 * and always exits 0 — a down path is a result, not a canary crash.
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const STATE_PATH = process.env.MACF_CANARY_STATE_PATH
  || path.join(__dirname, '.llm-canary-state.json');

const SLOW_MS = 45000;

function classify({ stackOk, directOk, stackMs, slowMs = SLOW_MS }) {
  if (stackOk) return typeof stackMs === 'number' && stackMs > slowMs ? 'DEGRADED' : 'HEALTHY';
  if (directOk) return 'GATEWAY_DOWN';
  return 'TOTAL_DOWN';
}

async function attempt(fn) {
  const t0 = Date.now();
  try {
    const out = await fn();
    return { ok: typeof out === 'string' ? out.trim().length > 0 : !!out, error: null, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: (e && e.message ? e.message : String(e)).slice(0, 200), ms: Date.now() - t0 };
  }
}

// Delegation-grade probe: a canary that only ever sends 8-token pings can
// pass while real delegations (large context, long output) time out — that
// false HEALTHY happened on the canary's first live day (Oct 12, 2026:
// ping passed at 17:21 while the 17:15 poll cycle timed out on both routes).
// The probe therefore carries a moderate context block and asks for a
// short paragraph, approximating a small delegation's shape.
const PROBE_CONTEXT = 'Background context for a small business advisory team. '.repeat(60);
const PROBE_ARGS = {
  systemPrompt: 'You are a health check for a business advisory team. Use the background context when answering.',
  userMessage: `Context: ${PROBE_CONTEXT}\n\nIn two or three sentences, confirm you received the context and state one risk of relying on a single communication channel for a small business.`,
  model: 'smart',
  maxTokens: 96,
};

async function runCanary(deps = {}) {
  const litellm = deps.litellm || require('../utils/litellm');
  const gapFn = deps.gapFn || require('./engineGap').logEngineGap;
  const statePath = deps.statePath || STATE_PATH;
  const now = deps.now || (() => new Date());

  const slowMs = deps.slowMs || SLOW_MS;
  const stack = await attempt(() => litellm.chat({ ...PROBE_ARGS }));

  let direct = null;
  let gateway = null;
  let toolsResult = null;
  let status;
  let repaired = null;

  if (stack.ok) {
    status = classify({ stackOk: true, stackMs: stack.ms, slowMs });
    // Tools probe: delegations are multi-round TOOL-calling workloads, and
    // a plain completion can pass while tool-shaped calls stall or fall to
    // a tier that only emulates calls as text (observed Oct 12, 2026: plain
    // probe 12s OK while tool delegations timed out in accumulation).
    // HEALTHY must mean the delegation shape works, so probe it too.
    const toolsProbe = await attempt(() =>
      litellm.chatTurn({
        systemPrompt: 'You are a test agent. If you need a value, call the get_value tool.',
        userMessage: 'Use the get_value tool to fetch the workshop date, then tell me the result.',
        model: 'smart',
        maxTokens: 200,
        tools: [{
          type: 'function',
          function: {
            name: 'get_value',
            description: 'Fetch a named value',
            parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
          },
        }],
      }).then((t) => (t && (t.text || (t.toolCalls && t.toolCalls.length))) || '')
    );
    toolsResult = { ok: toolsProbe.ok, ms: toolsProbe.ms, error: toolsProbe.error };
    if (!toolsProbe.ok || toolsProbe.ms > slowMs) {
      status = 'DEGRADED';
    }
    if (status === 'DEGRADED') {
      try {
        gapFn(
          'llm_path_slow',
          `LLM canary DEGRADED: plain generation ${stack.ms}ms; tools probe ${toolsProbe.ok ? `${toolsProbe.ms}ms` : `failed (${toolsProbe.error || 'empty'})`} (threshold ${slowMs}ms). Delegation-grade work is at risk at this latency/shape.`,
          'llm-canary'
        );
      } catch {}
    }
  } else {
    direct = await attempt(() =>
      litellm.chatTurnDirect({
        systemPrompt: 'You are a health check. Answer with one word.',
        userMessage: 'Reply with the single word: pong',
        maxTokens: 8,
      }).then((t) => (t && t.text) || '')
    );
    try {
      gateway = { reachable: !!(await litellm.gatewayReachable({})) };
    } catch (e) {
      gateway = { reachable: false, error: String(e.message || e).slice(0, 120) };
    }
    status = classify({ stackOk: false, directOk: direct.ok });

    if (status === 'TOTAL_DOWN') {
      // Bounded repair: a stale gateway negative cache can pin the stack
      // down after the gateway itself recovered. Clear and retest once.
      try { litellm._resetGatewayCache(); } catch {}
      const retest = await attempt(() => litellm.chat({ ...PROBE_ARGS }));
      if (retest.ok) {
        status = 'RECOVERED_AFTER_CACHE_RESET';
        repaired = 'gateway negative cache cleared; retest passed';
      }
    }

    if (status === 'TOTAL_DOWN' || status === 'GATEWAY_DOWN') {
      const detail =
        `LLM canary ${status}: stack generation failed (${stack.error || 'empty response'}); ` +
        `direct route ${direct && direct.ok ? 'OK' : `failed (${direct ? direct.error || 'empty' : 'untested'})`}; ` +
        `gateway reachable: ${gateway ? gateway.reachable : 'unknown'}. ` +
        'Agent directives cannot be processed while this persists.';
      try { gapFn(status === 'TOTAL_DOWN' ? 'llm_path_down' : 'llm_gateway_down', detail, 'llm-canary'); } catch {}
    }
  }

  const result = {
    at: now().toISOString(),
    status,
    routes: {
      stack: stack.ok,
      direct: direct ? direct.ok : null,
      gatewayReachable: gateway ? gateway.reachable : null,
    },
    stackError: stack.ok ? null : stack.error,
    stackMs: stack.ms,
    tools: toolsResult,
    repaired,
  };

  try {
    let prev = {};
    try { prev = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
    const history = Array.isArray(prev.history) ? prev.history : [];
    history.push({ at: result.at, status });
    fs.writeFileSync(statePath, JSON.stringify({ ...result, history: history.slice(-20) }, null, 2));
    try { fs.chmodSync(statePath, 0o644); } catch {}
  } catch {}

  return result;
}

if (require.main === module) {
  runCanary()
    .then((r) => {
      console.log(JSON.stringify(r));
      process.exit(0);
    })
    .catch((e) => {
      console.log(JSON.stringify({ status: 'CANARY_ERROR', error: String(e.message || e).slice(0, 200) }));
      process.exit(0);
    });
}

module.exports = { classify, runCanary, STATE_PATH };
