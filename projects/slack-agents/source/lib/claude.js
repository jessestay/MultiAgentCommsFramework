// lib/claude.js — Anthropic API utilities
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;

/**
 * Call Claude with a system prompt and user message
 */
async function callClaude(systemPrompt, userMessage, options = {}) {
  const {
    maxTokens = MAX_TOKENS,
    temperature = 0.7,
    conversationHistory = [],
  } = options;

  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  });

  return response.content[0]?.text || '';
}

/**
 * Call Claude with tools (for research/web search tasks)
 */
async function callClaudeWithTools(systemPrompt, userMessage, tools = []) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    tools,
    messages: [{ role: 'user', content: userMessage }],
  });

  return response;
}

/**
 * Stream a Claude response (for long-form content)
 */
async function streamClaude(systemPrompt, userMessage) {
  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  let fullText = '';
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
      fullText += chunk.delta.text;
    }
  }
  return fullText;
}

module.exports = { callClaude, callClaudeWithTools, streamClaude };

