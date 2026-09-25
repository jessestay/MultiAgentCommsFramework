// utils/litellm.js — Local LLM backend via LiteLLM → Ollama
//
// Talks OpenAI-compatible chat completions to a LiteLLM proxy on this machine.
// No API key, localhost only, no paid fallback: on failure it logs and throws.
//
// Model tiers (overridable via env vars; defaults are the aliases defined in
// litellm-config.yaml):
//   LITELLM_QUICK_MODEL — 'quick'
//   LITELLM_SMART_MODEL — 'smart'
//   LITELLM_BEST_MODEL  — 'best'

const LITELLM_URL = 'http://127.0.0.1:4000/v1/chat/completions';

const QUICK_MODEL  = process.env.LITELLM_QUICK_MODEL  || 'quick';
const SMART_MODEL  = process.env.LITELLM_SMART_MODEL  || 'smart';
const BEST_MODEL   = process.env.LITELLM_BEST_MODEL   || 'best';

const DEFAULT_MODEL = QUICK_MODEL;

// Resolve shorthand tier names to actual model IDs
function resolveModel(model) {
  if (!model || model === 'quick')  return QUICK_MODEL;
  if (model === 'smart')            return SMART_MODEL;
  if (model === 'best')             return BEST_MODEL;
  return model; // pass-through if already a full model ID
}

/**
 * Core chat function — same signature as anthropic-direct.chat.
 * @param {object} options
 * @param {string} options.systemPrompt
 * @param {string} options.userMessage
 * @param {string} [options.model]      — 'quick' | 'smart' | 'best' | full model ID
 * @param {number} [options.maxTokens]
 * @returns {Promise<string>}
 */
async function chat({ systemPrompt, userMessage, model = DEFAULT_MODEL, maxTokens = 1024 }) {
  const resolvedModel = resolveModel(model);
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userMessage });

  try {
    const res = await fetch(LITELLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: resolvedModel, max_tokens: maxTokens, messages }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`LiteLLM HTTP ${res.status}${detail ? `: ${detail.slice(0, 500)}` : ''}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('LiteLLM response missing choices[0].message.content');
    }
    return content;
  } catch (err) {
    const cause = err.cause?.code || err.cause?.message;
    console.error(`[litellm] API error (${resolvedModel}):`, err.message, cause ? `(${cause})` : '');
    throw err;
  }
}

/**
 * Short proactive post — quick tier.
 */
async function generateProactivePost({ systemPrompt, context, maxTokens = 400 }) {
  return chat({
    systemPrompt,
    userMessage: `Write a short, natural Slack message based on this context. Sound like a real person talking to their CEO — plain text, conversational, no bold headers, no bullet walls. Brief and direct.

Context: ${context}`,
    model: 'quick',
    maxTokens,
  });
}

/**
 * Full response/report — smart tier by default.
 */
async function generateReport({ systemPrompt, context, maxTokens = 1200, model = 'smart' }) {
  return chat({
    systemPrompt,
    userMessage: `Respond based on this context. Write like a person talking to their CEO — short paragraphs, plain sentences, no bold headers everywhere, no bullet-point lists unless you're genuinely listing 5+ discrete items that need separation. No emoji in the message body. Sound like yourself, not a report generator. Be direct and specific. Keep it under 300 words unless the task genuinely requires more detail.

Context: ${context}`,
    model,
    maxTokens,
  });
}

module.exports = { chat, generateProactivePost, generateReport, QUICK_MODEL, SMART_MODEL, BEST_MODEL };
