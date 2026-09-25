// utils/anthropic.js — AI backend router
//
// Every agent imports this file for chat / generateReport / generateProactivePost.
// The actual implementation is selected by the AI_BACKEND env var:
//   AI_BACKEND=litellm       → utils/litellm.js (local LiteLLM → Ollama, localhost only)
//   unset / 'anthropic'      → utils/anthropic-direct.js (Anthropic SDK, default)
//   any other value          → warns, uses utils/anthropic-direct.js
//
// There is deliberately NO automatic fallback between backends: if the local
// backend fails, the call fails. A silent switch to a paid API would spend
// money without the owner's approval.

const backend = (process.env.AI_BACKEND || '').trim().toLowerCase();

if (backend && backend !== 'litellm' && backend !== 'anthropic') {
  console.warn(`[ai] Unknown AI_BACKEND "${process.env.AI_BACKEND}" — using anthropic-direct`);
}

module.exports = backend === 'litellm'
  ? require('./litellm')
  : require('./anthropic-direct');
