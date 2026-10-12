// utils/litellm.js — LiteLLM gateway client (OpenAI-compatible).
//
// The VM engine's LLM path when it holds no direct provider key (the usual
// case: Anthropic/Claude access is subscription-gated). Calls go to the
// desktop LiteLLM gateway (LITELLM_BASE_URL, a tailnet address) through the
// Tailscale tunnel proxy, authenticated with LITELLM_MASTER_KEY. Both live in
// .env (600, gitignored) — never logged, never printed.
//
// Budget-first routing is CEO policy (Sep 29, 2026). Tier → model chains live
// in config/models.yaml (single source of truth); this client walks the chain
// top-down and the desktop gateway applies its own fallback chain per alias.
// Current tiers (Oct 11, 2026 — OpenRouter funded, paid path verified live):
//   quick → macf-cheap (local Ollama, $0) -> OpenRouter free (local is
//           currently non-functional — Oct 6 VRAM issue persists; gateway
//           fast-fails local after 30s and falls through to free)
//   smart → macf-smart-paid (DeepSeek V4 Flash, ~$1/mo) -> Haiku 5.5 ->
//           OpenRouter free
//   best  → macf-best (OpenRouter paid — only when quality demands it)
'use strict';

const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { getFallbackChain, loadConfig } = require('./modelRouter');

// Tier routing settings come from config/models.yaml. The engine walks each
// tier's chain top-down: on empty response it retries the same model
// (empty_response_retries), on transport/model error it falls through to the
// next model in the chain. This is what makes the models.yaml promise real:
// "The engine tries them top-down, falling back to the next if one fails or
// returns empty." (Fixed Oct 11, 2026 — previously only the FIRST model of a
// tier was ever tried; the rest of the chain was decorative.)
function routerSettings() {
  const cfg = loadConfig();
  const s = (cfg && cfg.settings) || {};
  return {
    emptyRetries: Number.isInteger(s.empty_response_retries) ? s.empty_response_retries : 2,
    attemptTimeoutMs: Number.isInteger(s.model_timeout_ms) ? s.model_timeout_ms : 60000,
    logRouting: s.log_routing !== false,
  };
}

// Tier shorthand ('smart') -> full priority chain from models.yaml.
// A full model id that isn't a tier -> single-model chain (unchanged behavior).
function resolveChain(model) {
  const chain = getFallbackChain(model);
  if (chain && chain.length) return chain;
  return [model];
}

// Tier → model mapping now comes from config/models.yaml.
// Edit that file to switch models — no code changes needed.

// Same derivation as ~/.ssh/desktop-ssh.sh: the tunnel proxy is the
// HTTPS_PROXY host on port 3130. Returns null for localhost BASE_URLs (SSH
// tunnel path) — routing 127.0.0.1 through the egress proxy blackholes it.
function tunnelProxyUrl() {
  const base = String(getBaseUrl() || '');
  if (/^(https?:\/\/)?(127\.0\.0\.1|localhost)([:\/]|$)/.test(base)) return null;
  let hp = process.env.HTTPS_PROXY || process.env.https_proxy || '';
  hp = hp.replace(/^.*:\/\//, '').replace(/^.*@/, '');
  const host = hp.split(':')[0];
  if (!host) return null;
  return `http://${host}:3130`;
}

function isConfigured() {
  // Budget-first routing (Jesse's policy): the desktop LiteLLM gateway
  // (LITELLM_BASE_URL) chains Qwen → desktop subscriptions → OpenRouter.
  // The VM-local Meta gateway (port 4001) is DISABLED as of Oct 6, 2026 —
  // it bypassed budget-first routing and used Jesse's personal Meta API
  // billing. If Meta models are needed, route through Jarvis Jr., not
  // Jesse's API key.
  return !!(process.env.LITELLM_BASE_URL && process.env.LITELLM_MASTER_KEY);
}

function getBaseUrl() {
  // No fallback to Meta gateway. If LITELLM_BASE_URL is not set, fail fast
  // so the misconfiguration is visible instead of silently burning Jesse's
  // Meta API billing.
  const url = process.env.LITELLM_BASE_URL;
  if (!url) {
    throw new Error('LITELLM_BASE_URL not set — desktop gateway required (budget-first routing)');
  }
  return url;
}

async function chat({ systemPrompt, userMessage, model = 'smart', maxTokens = 1200, signal }) {
  const turn = await chatTurn({ systemPrompt, userMessage, model, maxTokens, signal });
  return turn.text;
}

// Gateway reachability preflight (Oct 12, 2026 — CEO mechanism repair).
// Root cause of 7 consecutive directivePoll 600s timeouts (Oct 12 ~04:35-05:36
// MDT): when the desktop is down, the tunnel proxy blackholes instead of
// refusing, so EVERY chain attempt hangs until attemptTimeoutMs (60s). A
// smart-tier delegation then burns 300s+ across rounds and the poller can
// never complete — its retry/dead-letter machinery never gets a result to
// act on. Fail fast: probe the gateway with a short timeout first and throw
// immediately if unreachable, so callers get a quick failure and the
// retry/dead-letter path can advance instead of hanging.
let gatewayDownUntil = 0; // epoch ms; brief negative cache to avoid preflight storms

// Test hook: clear the preflight negative cache between tests.
function _resetGatewayCache() { gatewayDownUntil = 0; }

async function gatewayReachable({ base, agent, timeoutMs = 5000 }) {
  if (Date.now() < gatewayDownUntil) return false;
  // NOTE: the axios `timeout` option alone is NOT enough here. When the
  // desktop is down, the tunnel proxy blackholes the connection in a way
  // that never settles the axios promise (no timeout, no error — verified
  // Oct 12, 2026: raw axios GET via the proxy agent hung past its 5000ms
  // timeout and the node event loop simply emptied). Race against our own
  // timer so the preflight can never hang.
  let timer;
  try {
    await Promise.race([
      axios.get(`${base}/health`, {
        httpsAgent: agent,
        httpAgent: agent,
        proxy: false, // proxy managed explicitly via the agent above
        timeout: timeoutMs,
        // Any HTTP response (even 404) means the gateway is alive; only
        // transport failures (timeout, refused, reset) count as down.
        validateStatus: () => true,
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`gateway preflight timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    return true;
  } catch (e) {
    // Timeout / refused / reset = unreachable. Cache briefly to avoid
    // preflight storms when the desktop is down.
    gatewayDownUntil = Date.now() + 60000;
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// One attempt against one model id. Returns { text, toolCalls } — either may
// be empty (caller decides retry vs fallback).
async function attemptOnce({ base, agent, modelName, body, signal, timeoutMs }) {
  const resp = await axios.post(`${base}/v1/chat/completions`, { ...body, model: modelName }, {
    headers: { Authorization: `Bearer ${process.env.LITELLM_MASTER_KEY}` },
    httpsAgent: agent,
    httpAgent: agent,
    proxy: false, // proxy managed explicitly via the agent above
    timeout: timeoutMs,
    // 2026-09-30: Hatchet cancellation aborts the in-flight call so a killed
    // tick doesn't leave a zombie that starves the engine.
    ...(signal ? { signal } : {}),
  });
  const choice = resp.data && resp.data.choices && resp.data.choices[0];
  const msg = choice && choice.message;
  const text = msg && msg.content ? String(msg.content).trim() : '';
  const toolCalls = [];
  for (const tc of (msg && msg.tool_calls) || []) {
    let args = {};
    try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) { /* keep {} */ }
    toolCalls.push({ id: tc.id, toolName: tc.function.name, args });
  }
  return { text, toolCalls };
}

// Single chat turn with optional OpenAI-style tools. Returns
// { text, toolCalls: [{ id, toolName, args }] }. This is what the MCP
// ReAct loop uses: the loop appends tool results and calls again.
//
// Walks the tier's fallback chain top-down (see routerSettings above).
async function chatTurn({ systemPrompt, userMessage, messages, model = 'smart', maxTokens = 1200, tools, toolChoice = 'auto', signal, responseFormat }) {
  if (!isConfigured()) {
    throw new Error('litellm not configured');
  }
  const { emptyRetries, attemptTimeoutMs, logRouting } = routerSettings();
  const base = String(getBaseUrl()).replace(/\/+$/, '');
  const proxy = tunnelProxyUrl();
  // FIX (Oct 12, 2026): use the protocol-correct proxy agent. HttpsProxyAgent
  // is for HTTPS tunneling — using it for plain http:// gateway URLs caused
  // intermittent blackholes (verified: raw socket + HttpProxyAgent work,
  // HttpsProxyAgent hangs). keepAlive:false: the tunnel proxy silently kills
  // idle pooled sockets.
  const { HttpProxyAgent } = require('http-proxy-agent');
  const isHttps = /^https:/.test(base);
  const AgentClass = isHttps ? HttpsProxyAgent : HttpProxyAgent;
  const agent = proxy ? new AgentClass(proxy, { keepAlive: false, timeout: 10000 }) : undefined;
  // Fail fast when the desktop gateway is unreachable (see gatewayReachable
  // above): without this, every attempt blackholes for attemptTimeoutMs.
  // P1.4 (Oct 12, 2026): fail OVER to VM-direct OpenRouter instead of just
  // failing fast — the team's brain must not die with Jesse's desktop.
  if (!(await gatewayReachable({ base, agent }))) {
    if (logRouting) console.log('[litellm] desktop gateway unreachable — engaging VM-direct OpenRouter failover');
    return chatTurnDirect({ systemPrompt, userMessage, messages, maxTokens, tools });
  }
  const chain = resolveChain(model); // tier shorthand or full model id
  const body = {
    messages: messages || [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: userMessage },
    ],
    max_tokens: maxTokens,
  };
  if (tools && tools.length) {
    // Strip our internal _mcp marker before sending to the gateway.
    body.tools = tools.map(t => ({ type: t.type || 'function', function: t.function }));
    body.tool_choice = toolChoice;
  }
  if (responseFormat) {
    // Constrained decoding at the gateway (Oct 12, 2026 — #724 amendment):
    // an OpenAI-style response_format (json_schema strict) the provider
    // enforces at decode time where supported. Callers validate locally
    // regardless; routes that cannot honor it surface as model errors and
    // the chain falls through.
    body.response_format = responseFormat;
  }
  const errors = [];
  for (const modelName of chain) {
    for (let attempt = 0; attempt <= emptyRetries; attempt++) {
      try {
        if (logRouting) console.log(`[litellm] trying ${modelName} (attempt ${attempt + 1}/${emptyRetries + 1})`);
        const { text, toolCalls } = await attemptOnce({ base, agent, modelName, body, signal, timeoutMs: attemptTimeoutMs });
        if (text || toolCalls.length > 0) {
          if (logRouting && modelName !== chain[0]) console.log(`[litellm] fallback engaged: ${chain[0]} -> ${modelName}`);
          return { text, toolCalls };
        }
        if (logRouting) console.log(`[litellm] empty response from ${modelName}, retrying...`);
      } catch (e) {
        // Transport/model error (timeout, 4xx, 5xx): don't burn empty-retries
        // on a model that's failing — fall through to the next in the chain.
        errors.push(`${modelName}: ${e.message}`);
        if (logRouting) console.log(`[litellm] ${modelName} failed (${e.message}) — falling back`);
        break;
      }
    }
  }
  throw new Error(`litellm: all models failed for '${model}' [${chain.join(' -> ')}]: ${errors.join('; ').slice(0, 300)}`);
}

// P1.4 (Oct 12, 2026) — VM-direct OpenRouter failover.
//
// When the desktop gateway is unreachable, call OpenRouter directly from the
// VM instead of throwing. Chain: free models first ($0), paid DeepSeek V4
// Flash as backup (funded key, ~$4-6/mo at current volume). Model IDs match
// the tracked gateway config (proxies/litellm_config.yaml).
//
// Requires OPENROUTER_API_KEY in the VM env. The funded key lives on the
// desktop gateway (C:\Users\stay\claude_proxy\macf_gateway.env); copy it to
// the VM when the desktop is reachable. Without the key, the fail-fast error
// is preserved so the retry/dead-letter machinery still advances.
//
// NOTE: the direct path does not support tools — callers get text only.
// Tool-heavy loops degrade to a text answer rather than hanging forever.
// FIX (Oct 12, 2026): reasoning-capable models eat the max_tokens budget on
// reasoning and return null content (observed: finish_reason "length" with
// content:null on all three chain models — the entire failover went "empty").
// deepseek-v4-flash accepts reasoning:{enabled:false}; the two free models
// mandate reasoning (400 if disabled), so cap reasoning tokens at 256 and
// keep the content budget intact.
const DIRECT_FAILOVER_CHAIN = [
  { id: 'liquid/lfm-2.5-2.6b:free',           reasoning: { max_tokens: 256 } }, // verified working Oct 11
  { id: 'nvidia/nemotron-3.5-lightning:free', reasoning: { max_tokens: 256 } }, // verified Oct 11 (flaky)
  { id: 'deepseek/deepseek-v4-flash',         reasoning: { enabled: false } },   // paid backup (funded)
];

async function chatTurnDirect({ systemPrompt, userMessage, messages, maxTokens = 1200, tools }) {
  const key = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!key) {
    throw new Error('litellm: desktop gateway unreachable and no OPENROUTER_API_KEY on VM — cannot fail over (copy the funded key from the desktop gateway env to the VM)');
  }
  if (tools && tools.length) {
    console.log('[litellm] VM-direct failover: tools requested but unsupported on direct path — returning text only');
  }
  const axios = require('axios');
  const { HttpsProxyAgent } = require('https-proxy-agent');
  // FIX (Oct 12, 2026): axios's automatic env-proxy handling trips this
  // egress proxy ("Host in options.headers must match the request
  // authority"). Use an explicit HttpsProxyAgent like the gateway path does,
  // and disable axios's own proxy handling to avoid the conflict.
  const egressProxy = process.env.HTTPS_PROXY || process.env.https_proxy || null;
  // Same keepAlive:false rationale as the gateway path above.
  const egressAgent = egressProxy ? new HttpsProxyAgent(egressProxy, { keepAlive: false, timeout: 10000 }) : undefined;
  const body = {
    messages: messages || [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: userMessage },
    ],
    max_tokens: maxTokens,
  };
  const errors = [];
  for (const { id: modelId, reasoning } of DIRECT_FAILOVER_CHAIN) {
    try {
      // When reasoning is capped (not disabled), reserve that budget so the
      // content reply isn't starved by a small caller-supplied maxTokens.
      const effMaxTokens = (reasoning && typeof reasoning.max_tokens === 'number')
        ? Math.max(maxTokens, reasoning.max_tokens + 128)
        : maxTokens;
      const resp = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        ...body,
        model: modelId,
        reasoning,
        max_tokens: effMaxTokens,
      }, {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://staynalive.com',
          'X-Title': 'MACF VM failover',
        },
        httpsAgent: egressAgent,
        proxy: false,
        timeout: 60000,
      });
      const text = resp.data && resp.data.choices && resp.data.choices[0] &&
        resp.data.choices[0].message && resp.data.choices[0].message.content;
      if (text && text.trim()) {
        console.log(`[litellm] VM-direct failover succeeded via ${modelId}`);
        // toolsDropped (Oct 12, 2026 — #724 amendment): the direct path has
        // NO native tool channel. Callers must DETECT this and flag text
        // emulation explicitly instead of silently degrading.
        return { text, toolCalls: [], ...(tools && tools.length ? { toolsDropped: true } : {}) };
      }
      errors.push(`${modelId}: empty response`);
    } catch (e) {
      errors.push(`${modelId}: ${e.message}`);
    }
  }
  throw new Error(`litellm: VM-direct failover failed [${errors.join('; ').slice(0, 200)}]`);
}

module.exports = { chat, chatTurn, chatTurnDirect, isConfigured, tunnelProxyUrl, gatewayReachable, _resetGatewayCache };
