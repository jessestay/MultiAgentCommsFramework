// core/ai/anthropic.js — Anthropic Claude backend
// Implements the AIBackend interface defined in interface.js.
// This is the default backend. To swap to a different model provider,
// implement the same exports in a new file and update AI_BACKEND env var.

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const DEFAULT_MODEL    = process.env.ANTHROPIC_MODEL || 'claude-opus-4-6';
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Core chat call. All other functions build on this.
 */
async function chat({ systemPrompt, userMessage, model = DEFAULT_MODEL, maxTokens = DEFAULT_MAX_TOKENS }) {
  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    return response.content[0].text;
  } catch (err) {
    console.error('[ai/anthropic] API error:', err.message);
    throw err;
  }
}

/**
 * Conversational response. Used for @mention replies and delegation responses.
 * Instructs human voice — no bold headers, no bullet walls.
 */
async function generateReport({ systemPrompt, context, maxTokens = 2048 }) {
  return chat({
    systemPrompt,
    userMessage: `Respond based on this context. Write like a person talking to their CEO — short paragraphs, plain sentences, no bold headers everywhere, no bullet-point lists unless you're genuinely listing 5+ discrete items that need separation. No emoji in the message body. Sound like yourself, not a report generator. Be direct and specific.

Context: ${context}`,
    maxTokens,
  });
}

/**
 * Short proactive post. Used for automated channel updates.
 */
async function generateProactivePost({ systemPrompt, context, maxTokens = 512 }) {
  return chat({
    systemPrompt,
    userMessage: `Write a short, natural Slack message based on this context. Sound like a real person talking to their CEO — plain text, conversational, no bold headers, no bullet walls. Brief and direct.

Context: ${context}`,
    maxTokens,
  });
}

module.exports = { chat, generateReport, generateProactivePost };
