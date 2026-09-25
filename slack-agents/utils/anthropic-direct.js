// utils/anthropic.js — Anthropic SDK wrapper with tiered model selection
//
// Model tiers (overridable via env vars):
//   QUICK_MODEL  — haiku  — fast replies, proactive posts, simple Q&A
//   SMART_MODEL  — sonnet — complex reasoning, delegations, legal/financial
//   BEST_MODEL   — opus   — reserved for future use; not used by default
//
// Cost comparison (per 1M tokens, input/output):
//   haiku-4-5:   $0.25 / $1.25   (~60x cheaper than opus)
//   sonnet-4-6:  $3.00 / $15.00  (~5x cheaper than opus)
//   opus-4-6:    $15.00 / $75.00 (only when explicitly requested)
//
// Default strategy: haiku for everything; sonnet for complex tasks where
// quality matters. Pass model:'smart' or model:'best' to override.

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Model tier constants — override via Railway env vars if needed
const QUICK_MODEL  = process.env.ANTHROPIC_QUICK_MODEL  || 'claude-haiku-4-5-20251001';
const SMART_MODEL  = process.env.ANTHROPIC_SMART_MODEL  || 'claude-sonnet-4-6';
const BEST_MODEL   = process.env.ANTHROPIC_BEST_MODEL   || 'claude-opus-4-6';

// Default to haiku — fast and cheap. 95% of agent responses don't need more.
const DEFAULT_MODEL = QUICK_MODEL;

// Resolve shorthand tier names to actual model IDs
function resolveModel(model) {
  if (!model || model === 'quick')  return QUICK_MODEL;
  if (model === 'smart')            return SMART_MODEL;
  if (model === 'best')             return BEST_MODEL;
  return model; // pass-through if already a full model ID
}

/**
 * Core chat function.
 * @param {object} options
 * @param {string} options.systemPrompt
 * @param {string} options.userMessage
 * @param {string} [options.model]      — 'quick' | 'smart' | 'best' | full model ID
 * @param {number} [options.maxTokens]
 * @returns {Promise<string>}
 */
async function chat({ systemPrompt, userMessage, model = DEFAULT_MODEL, maxTokens = 1024 }) {
  const resolvedModel = resolveModel(model);
  try {
    const response = await client.messages.create({
      model: resolvedModel,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage },
      ],
    });
    return response.content[0].text;
  } catch (err) {
    console.error(`[anthropic] API error (${resolvedModel}):`, err.message);
    throw err;
  }
}

/**
 * Short proactive post — haiku is perfect here.
 * Used for cron-triggered channel updates, alerts, summaries.
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
 * Full response/report — uses 'smart' (sonnet) for complex reasoning.
 * Used for handleMention, handleDelegation, analysis tasks.
 * maxTokens capped at 1200 to keep costs predictable; agents should be concise.
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
