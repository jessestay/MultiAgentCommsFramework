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
async function chatTurn({ systemPrompt, userMessage, messages, model = 'smart', maxTokens = 1200, tools, toolChoice = 'auto', signal }) {
  if (!isConfigured()) {
    throw new Error('litellm not configured');
  }
  const { emptyRetries, attemptTimeoutMs, logRouting } = routerSettings();
  const base = String(getBaseUrl()).replace(/\/+$/, '');
  const proxy = tunnelProxyUrl();
  const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
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

module.exports = { chat, chatTurn, isConfigured, tunnelProxyUrl };
