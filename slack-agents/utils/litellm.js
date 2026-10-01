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
//   smart → macf-smart  (local model, ~free)
//   best  → macf-best   (OpenRouter paid — only when quality demands it)
'use strict';

const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const TIER_MODEL = { quick: 'macf-cheap', smart: 'macf-smart', best: 'macf-best' };

// Same derivation as ~/.ssh/desktop-ssh.sh: the tunnel proxy is the
// HTTPS_PROXY host on port 3130.
function tunnelProxyUrl() {
  let hp = process.env.HTTPS_PROXY || process.env.https_proxy || '';
  hp = hp.replace(/^.*:\/\//, '').replace(/^.*@/, '');
  const host = hp.split(':')[0];
  if (!host) return null;
  return `http://${host}:3130`;
}

function isConfigured() {
  return !!(process.env.LITELLM_MASTER_KEY && process.env.LITELLM_BASE_URL);
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
    throw new Error('litellm not configured (need LITELLM_MASTER_KEY + LITELLM_BASE_URL)');
  }
  const base = String(process.env.LITELLM_BASE_URL).replace(/\/+$/, '');
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
