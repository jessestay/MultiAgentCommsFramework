// utils/litellm.js — LiteLLM gateway client (OpenAI-compatible).
//
// The VM engine's LLM path when it holds no direct provider key (the usual
// case: Anthropic/Claude access is subscription-gated). Calls go to the
// desktop LiteLLM gateway (LITELLM_BASE_URL, a tailnet address) through the
// Tailscale tunnel proxy, authenticated with LITELLM_MASTER_KEY. Both live in
// .env (600, gitignored) — never logged, never printed.
//
// Budget-first routing is CEO policy (Sep 29, 2026): the gateway itself
// chains local → desktop subscriptions → OpenRouter → direct APIs, so this
// client only picks the tier and the gateway does the rest:
//   quick → macf-cheap  (local model, ~free)
//   smart → macf-smart-free (OpenRouter free; macf-smart/Ollama is CPU-only
//           and too slow while the desktop GPU has <1GB free — Oct 1, 2026.
//           Revert to macf-smart when GPU VRAM allows offload again.)
//   best  → macf-best   (OpenRouter paid — only when quality demands it)
'use strict';

const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const TIER_MODEL = { quick: 'macf-cheap', smart: 'macf-smart-free', best: 'macf-best' };

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

// Single chat turn with optional OpenAI-style tools. Returns
// { text, toolCalls: [{ id, toolName, args }] }. This is what the MCP
// ReAct loop uses: the loop appends tool results and calls again.
async function chatTurn({ systemPrompt, userMessage, messages, model = 'smart', maxTokens = 1200, tools, toolChoice = 'auto', signal }) {
  if (!isConfigured()) {
    throw new Error('litellm not configured');
  }
  const base = String(getBaseUrl()).replace(/\/+$/, '');
  const proxy = tunnelProxyUrl();
  const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
  const modelName = TIER_MODEL[model] || model; // tier shorthand or full id
  const body = {
    model: modelName,
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
  const resp = await axios.post(`${base}/v1/chat/completions`, body, {
    headers: { Authorization: `Bearer ${process.env.LITELLM_MASTER_KEY}` },
    httpsAgent: agent,
    httpAgent: agent,
    proxy: false, // proxy managed explicitly via the agent above
    timeout: 180000, // cold local-model load can take ~150s on first call
    // 2026-09-30: Hatchet cancellation aborts the in-flight call so a killed
    // tick doesn't leave a 180s zombie that starves the engine.
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
  if (!text && toolCalls.length === 0) {
    throw new Error(`litellm: empty response from ${modelName}`);
  }
  return { text, toolCalls };
}

module.exports = { chat, chatTurn, isConfigured, TIER_MODEL, tunnelProxyUrl };
