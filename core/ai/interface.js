// core/ai/interface.js — AI Backend abstraction
//
// Every AI backend (Anthropic Claude, Perplexity, OpenAI, etc.) must implement
// this interface. Swap backends by changing the factory at the bottom, or by
// setting AI_BACKEND=anthropic|perplexity|openai in your .env.
//
// This means the entire agent layer is model-agnostic: you could run the same
// team on Perplexity for research tasks and Claude for generation tasks by
// writing a routing backend that delegates based on agent role or task type.

/**
 * @typedef {Object} ChatOptions
 * @property {string}   systemPrompt  - Agent's persona and instructions
 * @property {string}   userMessage   - The prompt/context to respond to
 * @property {string}   [model]       - Override the default model
 * @property {number}   [maxTokens]   - Token limit for the response
 * @property {string}   [agentId]     - Agent making the call (for routing backends)
 * @property {string}   [taskType]    - 'chat'|'research'|'report'|'proactive' (for routing)
 */

/**
 * @typedef {Object} AIBackend
 * @property {function(ChatOptions): Promise<string>}  chat
 * @property {function(Object): Promise<string>}       generateReport
 * @property {function(Object): Promise<string>}       generateProactivePost
 */

/**
 * Factory: returns the configured AI backend.
 * Add new backends by implementing the same interface and adding a case here.
 */
function createAIBackend(backendName) {
  const name = backendName || process.env.AI_BACKEND || 'anthropic';
  switch (name) {
    case 'anthropic':
      return require('./anthropic');
    case 'perplexity':
      return require('./perplexity');
    default:
      console.warn(`[ai] Unknown backend "${name}", falling back to anthropic`);
      return require('./anthropic');
  }
}

module.exports = { createAIBackend };
