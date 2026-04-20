// utils/anthropic.js — Thin wrapper around Anthropic SDK
// All agents use this to generate responses

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const DEFAULT_MODEL = 'claude-opus-4-6';
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Generate a response from Claude given a system prompt and user message.
 * @param {object} options
 * @param {string} options.systemPrompt
 * @param {string} options.userMessage
 * @param {string} [options.model]
 * @param {number} [options.maxTokens]
 * @returns {Promise<string>}
 */
async function chat({ systemPrompt, userMessage, model = DEFAULT_MODEL, maxTokens = DEFAULT_MAX_TOKENS }) {
  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage },
      ],
    });
    return response.content[0].text;
  } catch (err) {
    console.error('[anthropic] API error:', err.message);
    throw err;
  }
}

/**
 * Generate a short proactive post from an agent.
 * Used for concise Slack updates.
 */
async function generateProactivePost({ systemPrompt, context, maxTokens = 512 }) {
  return chat({
    systemPrompt,
    userMessage: `Write a short, natural Slack message based on this context. Sound like a real person talking to their CEO — plain text, conversational, no bold headers, no bullet walls. Brief and direct.

Context: ${context}`,
    maxTokens,
  });
}

/**
 * Generate a response or update. Human voice — no formatted reports.
 */
async function generateReport({ systemPrompt, context, maxTokens = 2048 }) {
  return chat({
    systemPrompt,
    userMessage: `Respond based on this context. Write like a person talking to their CEO — short paragraphs, plain sentences, no bold headers everywhere, no bullet-point lists unless you're genuinely listing 5+ discrete items that need separation. No emoji in the message body. Sound like yourself, not a report generator. Be direct and specific.

Context: ${context}`,
    maxTokens,
  });
}

module.exports = { chat, generateProactivePost, generateReport };
