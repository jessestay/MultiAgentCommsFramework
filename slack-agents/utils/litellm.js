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
// Phase C circuit breaker (#789, Oct 16, 2026): cross-call per-route empty
// streaks. The gateway passes empty 200s through as success (A5.3), so this
// app layer is the only place a streak can be detected and routed around.
const breaker = require('./circuitBreaker');
// Phase D prompt caching (#789, Oct 16, 2026): cache_control breakpoints on
// the stable prefix + one stable session_id per delegation (OpenRouter
// sticky routing), and cached-token parsing in usage. All construction and
// parsing lives in utils/promptCache.js; this client only wires it in when
// a caller supplies a sessionId — without one the wire format is exactly
// what it was before Phase D.
const promptCache = require('./promptCache');

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
    localTimeoutMs: Number.isInteger(s.local_timeout_ms) ? s.local_timeout_ms : null,
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

// Normalize a provider usage block to the turn shape the checkpoint
// token counters accumulate (Phase A, US-A1). Phase D: parsing is
// promptCache.parseUsage, which also understands cached tokens in every
// provider shape (OpenAI prompt_tokens_details.cached_tokens, DeepSeek
// prompt_cache_hit_tokens, Anthropic cache_read/cache_creation). The
// cached fields are added LAZILY — only when the provider actually
// reported cache data — so consumers see the exact pre-Phase-D shape
// { promptTokens, completionTokens } whenever no caching happened.
// Returns undefined when the provider reported no usage.
function normalizeUsage(raw) {
  const u = promptCache.parseUsage(raw);
  if (!u) return undefined;
  const out = { promptTokens: u.promptTokens, completionTokens: u.completionTokens };
  if (raw && typeof raw === 'object') {
    const reportedCache =
      raw.cachedTokens !== undefined || raw.cacheCreationTokens !== undefined ||
      raw.prompt_cache_hit_tokens !== undefined ||
      (raw.prompt_tokens_details && raw.prompt_tokens_details.cached_tokens !== undefined) ||
      raw.cache_read_input_tokens !== undefined || raw.cache_creation_input_tokens !== undefined;
    if (reportedCache) {
      out.cachedTokens = u.cachedTokens;
      if (u.cacheCreationTokens) out.cacheCreationTokens = u.cacheCreationTokens;
    }
  }
  return out;
}

// Phase D wiring (US-D1): when a caller supplies a sessionId, build the
// cache-annotated body parts and the session_id for sticky routing.
// Returns null when caching does not apply (no sessionId, or the
// MACF_PROMPT_CACHE=off ops kill switch) — the caller then sends the body
// exactly as built, byte-identical to before Phase D. Mode resolution:
// explicit cacheMode > MACF_CACHE_MODE env > 'full'.
function buildCacheWiring({ sessionId, cacheMode, messages, tools }) {
  if (!sessionId) return null;
  if (process.env.MACF_PROMPT_CACHE === 'off') return null;
  const mode = cacheMode || process.env.MACF_CACHE_MODE || 'full';
  if (mode === 'off') return null;
  const applied = promptCache.applyPromptCache({ messages, tools, sessionId, mode });
  if (!applied.sessionId) return null;
  return { ...applied, mode };
}

// One attempt against one model id. Returns { text, toolCalls, usage? } —
// text/toolCalls may be empty (caller decides retry vs fallback).
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
  const usage = normalizeUsage(resp.data && resp.data.usage);
  // Phase D measurement: surface which model actually answered (the
  // gateway runs its own fallback chain inside one alias, so the leg name
  // alone cannot attribute cache behavior to a provider).
  const answeredBy = resp.data && typeof resp.data.model === 'string' ? resp.data.model : undefined;
  return { text, toolCalls, ...(usage ? { usage } : {}), ...(answeredBy ? { model: answeredBy } : {}) };
}

// Single chat turn with optional OpenAI-style tools. Returns
// { text, toolCalls: [{ id, toolName, args }], usage? } — usage is the
// provider's token accounting for the turn when it reported any
// (Phase A, US-A1). This is what the MCP ReAct loop uses: the loop
// appends tool results and calls again.
//
// Walks the tier's fallback chain top-down (see routerSettings above).
async function chatTurn({ systemPrompt, userMessage, messages, model = 'smart', maxTokens = 1200, tools, toolChoice = 'auto', signal, responseFormat, sessionId, cacheMode }) {
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
    return chatTurnDirect({ systemPrompt, userMessage, messages, maxTokens, tools, sessionId, cacheMode });
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
  // Phase D (US-D1): cache construction on the stable prefix + session_id
  // for sticky routing, only when the caller supplied a session. The
  // caller's own message array is never mutated (applyPromptCache copies).
  const cacheWiring = buildCacheWiring({ sessionId, cacheMode, messages: body.messages, tools: body.tools });
  if (cacheWiring) {
    body.messages = cacheWiring.messages;
    if (body.tools) body.tools = cacheWiring.tools;
    body.session_id = cacheWiring.sessionId;
  }
  const errors = [];
  let emptyCount = 0;
  // RESILIENCE (Oct 15, 2026 — Jesse's order after the evening dead-letter
  // streak): empty responses arrive in PER-LEG streaks. The old walk hammered
  // one model emptyRetries times in a row, so a streak on the top leg burned
  // the whole call budget in seconds while the other leg sat idle. Now the
  // attempts ROTATE across the chain with escalating spacing, so each attempt
  // gets a different leg and a streak has time to break mid-call. A model
  // that errors (transport/4xx/5xx) is marked down for the rest of this call
  // and skipped in later rotations.
  const downModels = new Set();
  const delayBaseMs = Number(process.env.MACF_EMPTY_RETRY_DELAY_MS || 1000);
  let attemptNo = 0;
  let attemptedAny = false;
  const breakerSkipped = new Set();
  for (let round = 0; round <= emptyRetries; round++) {
    for (const modelName of chain) {
      if (downModels.has(modelName)) continue;
      // CIRCUIT BREAKER: a route in an empty streak is skipped instantly
      // instead of burning an attempt (and up to attemptTimeoutMs) on it.
      if (breaker.shouldSkip(modelName)) {
        breakerSkipped.add(modelName);
        if (logRouting) console.log(`[litellm] circuit OPEN for ${modelName} — skipping (fail-fast)`);
        continue;
      }
      attemptNo++;
      attemptedAny = true;
      if (signal && signal.aborted) throw new Error('litellm: aborted');
      if (attemptNo > 1 && delayBaseMs > 0) {
        const delay = Math.min(delayBaseMs * Math.pow(2, attemptNo - 2), delayBaseMs * 8);
        await new Promise(r => setTimeout(r, delay));
      }
      try {
        if (logRouting) console.log(`[litellm] trying ${modelName} (attempt ${attemptNo}, rotation ${round + 1}/${emptyRetries + 1})`);
        // #807 Phase 1: local routes (desktop Ollama) get a longer attempt
        // budget — a cold model load + CPU prompt evaluation legitimately
        // exceeds the 60s cloud budget; dying at 60s made the local
        // lifeboat unusable for delegation payloads. models.yaml
        // settings.local_timeout_ms (default: same as attemptTimeoutMs).
        const isLocalRoute = modelName === 'macf-local' || modelName === 'macf-cheap';
        const timeoutMs = isLocalRoute ? (Number(routerSettings().localTimeoutMs) || attemptTimeoutMs) : attemptTimeoutMs;
        const { text, toolCalls, usage, model: answeredBy } = await attemptOnce({ base, agent, modelName, body, signal, timeoutMs });
        if (text || toolCalls.length > 0) {
          breaker.recordSuccess(modelName);
          if (logRouting && modelName !== chain[0]) console.log(`[litellm] fallback engaged: ${chain[0]} -> ${modelName}`);
          // Phase A (US-A1): surface the turn's token usage so callers can
          // accumulate it into the run's checkpoint token counters. Phase D:
          // the cache descriptor (session + prefix fingerprint + mode) rides
          // along so measurement can attribute hits to a layout.
          return { text, toolCalls, route: modelName, ...(usage ? { usage } : {}), ...(answeredBy ? { model: answeredBy } : {}), ...(cacheWiring ? { cache: { sessionId: cacheWiring.sessionId, prefixHash: cacheWiring.prefixHash, mode: cacheWiring.mode } } : {}) };
        }
        emptyCount++;
        breaker.recordEmpty(modelName);
        if (logRouting) console.log(`[litellm] empty response from ${modelName}, rotating...`);
      } catch (e) {
        errors.push(`${modelName}: ${e.message}`);
        if (logRouting) console.log(`[litellm] ${modelName} failed (${e.message}) — marked down for this call`);
        downModels.add(modelName);
      }
    }
  }
  // FAIL-FAST (Phase C): every route in the chain was breaker-skipped and
  // not a single gateway call was made. Surface a distinct circuit-open
  // error so callers (step retry, dead-letter) get an instant, schedulable
  // failure instead of a minutes-long stall into dead routes.
  if (!attemptedAny && breakerSkipped.size > 0) {
    const err = new Error(`litellm: circuit open for all routes in chain [${chain.join(' -> ')}] — failing fast, no gateway calls made (empty-response streak cooldown)`);
    err.circuitOpen = true;
    throw err;
  }
  const detail = errors.length ? errors.join('; ') : `${emptyCount} empty response(s), no transport errors`;
  throw new Error(`litellm: all models failed for '${model}' [${chain.join(' -> ')}]: ${detail.slice(0, 300)}`);
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

async function chatTurnDirect({ systemPrompt, userMessage, messages, maxTokens = 1200, tools, sessionId, cacheMode }) {
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
  // Phase D (US-D1): the direct OpenRouter path gets the same cache
  // construction + session_id — OpenRouter documents session_id as its
  // sticky-routing key, so the direct chain is where it is most native.
  const cacheWiring = buildCacheWiring({ sessionId, cacheMode, messages: body.messages, tools: body.tools });
  if (cacheWiring) {
    body.messages = cacheWiring.messages;
    body.session_id = cacheWiring.sessionId;
  }
  const errors = [];
  let directAttemptedAny = false;
  let directSkipped = 0;
  for (const { id: modelId, reasoning } of DIRECT_FAILOVER_CHAIN) {
    // CIRCUIT BREAKER (Phase C): the direct chain streaks the same way the
    // gateway legs do — skip tripped models instantly under direct: keys.
    const routeKey = `direct:${modelId}`;
    if (breaker.shouldSkip(routeKey)) {
      directSkipped++;
      console.log(`[litellm] circuit OPEN for ${routeKey} — skipping (fail-fast)`);
      continue;
    }
    directAttemptedAny = true;
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
        breaker.recordSuccess(routeKey);
        console.log(`[litellm] VM-direct failover succeeded via ${modelId}`);
        const usage = normalizeUsage(resp.data && resp.data.usage);
        const answeredBy = resp.data && typeof resp.data.model === 'string' ? resp.data.model : undefined;
        // toolsDropped (Oct 12, 2026 — #724 amendment): the direct path has
        // NO native tool channel. Callers must DETECT this and flag text
        // emulation explicitly instead of silently degrading.
        return { text, toolCalls: [], route: routeKey, ...(usage ? { usage } : {}), ...(answeredBy ? { model: answeredBy } : {}), ...(tools && tools.length ? { toolsDropped: true } : {}), ...(cacheWiring ? { cache: { sessionId: cacheWiring.sessionId, prefixHash: cacheWiring.prefixHash, mode: cacheWiring.mode } } : {}) };
      }
      breaker.recordEmpty(routeKey);
      errors.push(`${modelId}: empty response`);
    } catch (e) {
      errors.push(`${modelId}: ${e.message}`);
    }
  }
  if (!directAttemptedAny && directSkipped > 0) {
    const err = new Error('litellm: circuit open for all VM-direct failover routes — failing fast, no OpenRouter calls made (empty-response streak cooldown)');
    err.circuitOpen = true;
    throw err;
  }
  throw new Error(`litellm: VM-direct failover failed [${errors.join('; ').slice(0, 200)}]`);
}

module.exports = { chat, chatTurn, chatTurnDirect, isConfigured, tunnelProxyUrl, gatewayReachable, _resetGatewayCache };
