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
 * Generate a short proactive post (under 280 chars by default) from an agent.
 * Used for concise Slack updates.
 */
async function generateProactivePost({ systemPrompt, context, maxTokens = 512 }) {
  return chat({
    systemPrompt,
    userMessage: `Generate a concise, proactive Slack post based on this context.
Keep it under 300 characters unless detail is genuinely needed.
Write in first person as the agent. Sound human, not robotic.

Context: ${context}`,
    maxTokens,
  });
}

/**
 * Generate a longer structured report or analysis.
 */
async function generateReport({ systemPrompt, context, maxTokens = 2048 }) {
  return chat({
    systemPrompt,
    userMessage: `Generate a clear, well-structured Slack report based on this context.
Use Slack mrkdwn formatting (bold with *asterisks*, bullet points with •).
Be direct and actionable.

Context: ${context}`,
    maxTokens,
  });
}

module.exports = { chat, generateProactivePost, generateReport };
