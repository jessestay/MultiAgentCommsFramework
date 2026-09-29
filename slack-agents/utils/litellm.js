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

async function chat({ systemPrompt, userMessage, model = 'smart', maxTokens = 1200 }) {
  if (!isConfigured()) {
    throw new Error('litellm not configured (need LITELLM_MASTER_KEY + LITELLM_BASE_URL)');
  }
  const base = String(process.env.LITELLM_BASE_URL).replace(/\/+$/, '');
  const proxy = tunnelProxyUrl();
  const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
  const modelName = TIER_MODEL[model] || model; // tier shorthand or full id
  const resp = await axios.post(`${base}/v1/chat/completions`, {
    model: modelName,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: userMessage },
    ],
    max_tokens: maxTokens,
  }, {
    headers: { Authorization: `Bearer ${process.env.LITELLM_MASTER_KEY}` },
    httpsAgent: agent,
    httpAgent: agent,
    proxy: false, // proxy managed explicitly via the agent above
    timeout: 180000, // cold local-model load can take ~150s on first call
  });
  const choice = resp.data && resp.data.choices && resp.data.choices[0];
  const text = choice && choice.message && choice.message.content;
  if (!text || !String(text).trim()) {
    throw new Error(`litellm: empty response from ${modelName}`);
  }
  return String(text).trim();
}

module.exports = { chat, isConfigured, TIER_MODEL, tunnelProxyUrl };
