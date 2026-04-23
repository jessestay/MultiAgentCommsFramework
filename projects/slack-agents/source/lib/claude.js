// lib/claude.js — Anthropic API utilities
//
// Every callClaude() call now includes the built-in web_search tool automatically.
// Claude can search the web for live data (LinkedIn, GoFundMe totals, job postings,
// GitHub, npm, etc.) without any extra configuration.
//
// callClaudeWithTools() adds custom tools on top of web_search and runs a full
// agentic loop until Claude produces a final text response.

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;
const MAX_LOOP_ITERATIONS = 8;

// Built-in Anthropic web search tool — handled server-side, zero config needed.
// Included in every API call so all agents can search the web when answering questions.
const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5,
};

/**
 * Call Claude with a system prompt and user message.
 * Automatically includes web_search so agents can look up live data.
 * Runs an agentic loop to handle tool use (web_search results come back
 * as tool_use blocks that Claude must process before producing final text).
 */
async function callClaude(systemPrompt, userMessage, options = {}) {
  const {
    maxTokens = MAX_TOKENS,
    conversationHistory = [],
    tools = [],
  } = options;

  const allTools = [WEB_SEARCH_TOOL, ...tools];
  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  let iterations = 0;
  while (iterations < MAX_LOOP_ITERATIONS) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      tools: allTools,
    });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text || '';
    }

    if (response.stop_reason === 'tool_use') {
      // Append assistant's response (contains tool_use blocks)
      messages.push({ role: 'assistant', content: response.content });

      // Build tool_result blocks for each tool call.
      // web_search is handled server-side by Anthropic — we just pass back
      // a placeholder so the loop continues. The actual search results were
      // already injected by Anthropic into the next assistant turn.
      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        // web_search is server-side — Anthropic resolves it automatically.
        // We still need to acknowledge with a tool_result to advance the loop.
        const result = block.name === 'web_search'
          ? '(web_search executed server-side by Anthropic)'
          : `Tool "${block.name}" not handled in callClaude — use callClaudeWithTools for custom tools.`;

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      messages.push({ role: 'user', content: toolResults });
      iterations++;
      continue;
    }

    // Any other stop_reason — return whatever text we have
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock?.text || '';
  }

  console.warn('[claude] callClaude: iteration limit reached, returning partial response');
  return 'I hit a processing limit on that request. Please try something more specific.';
}

/**
 * Call Claude with custom tools AND web_search (always included).
 * Runs a full agentic loop — Claude can call tools, receive results,
 * and continue reasoning until it produces a final text response.
 *
 * @param {string}   systemPrompt
 * @param {string}   userMessage
 * @param {Array}    customTools     — tool definitions (schema objects)
 * @param {Function} executeTool     — async (toolName, toolInput) => string
 * @param {object}   options
 * @returns {Promise<string>}
 */
async function callClaudeWithTools(systemPrompt, userMessage, customTools = [], executeTool = null, options = {}) {
  const { maxTokens = MAX_TOKENS, conversationHistory = [] } = options;
  const allTools = [WEB_SEARCH_TOOL, ...customTools];
  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  let iterations = 0;
  while (iterations < MAX_LOOP_ITERATIONS) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      tools: allTools,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text || '';
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        let result;
        if (block.name === 'web_search') {
          // Server-side — Anthropic handles this automatically
          result = '(web_search executed server-side by Anthropic)';
        } else if (executeTool) {
          try {
            result = await executeTool(block.name, block.input);
            if (typeof result !== 'string') result = JSON.stringify(result, null, 2);
          } catch (err) {
            console.error(`[claude] Tool "${block.name}" error:`, err.message);
            result = `Tool error: ${err.message}`;
          }
        } else {
          result = `No executor configured for tool: ${block.name}`;
        }

        console.log(`[claude] Tool "${block.name}" → ${String(result).slice(0, 120)}`);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      messages.push({ role: 'user', content: toolResults });
      iterations++;
      continue;
    }

    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock?.text || '';
  }

  console.warn('[claude] callClaudeWithTools: iteration limit reached');
  return 'I hit a processing limit on that request. Please try something more specific.';
}

/**
 * Stream a Claude response (for long-form content).
 * Includes web_search tool — streaming stops at tool_use, falls back to
 * non-streaming for tool-heavy responses.
 */
async function streamClaude(systemPrompt, userMessage) {
  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    tools: [WEB_SEARCH_TOOL],
    messages: [{ role: 'user', content: userMessage }],
  });

  let fullText = '';
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
      fullText += chunk.delta.text;
    }
  }
  // If streaming was cut short by tool_use, fall back to agentic call
  const finalMsg = await stream.finalMessage();
  if (finalMsg.stop_reason === 'tool_use') {
    return callClaude(systemPrompt, userMessage, { maxTokens: 4096 });
  }
  return fullText;
}

module.exports = { callClaude, callClaudeWithTools, streamClaude, WEB_SEARCH_TOOL };
