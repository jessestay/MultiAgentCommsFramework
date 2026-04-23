// lib/tools.js — Custom tool definitions for agent use
//
// All agents get web_search automatically via callClaude().
// This module adds higher-capability tools agents can invoke when web_search
// isn't enough (form filling, login-gated pages, complex browser interactions).

const APP_BASE_URL = process.env.APP_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

/**
 * run_cowork_task — send a browser/computer task to the Cowork bridge.
 * The bridge calls Anthropic with web_search (and computer_use when a desktop
 * relay is connected) and posts the result back to the originating Slack thread.
 *
 * Use this when web_search alone isn't enough:
 *   - Pages that require login or interactive navigation
 *   - Form filling or multi-step UI workflows
 *   - Scraping pages that block simple HTTP fetches
 *   - Any task explicitly asking for browser automation
 */
const RUN_COWORK_TASK_TOOL = {
  name: 'run_cowork_task',
  description: `Dispatch a browser or computer-use task to the Cowork automation bridge.
Use this when you need to:
- Access a URL that requires login or interactive navigation
- Fill out a form or interact with a web UI
- Scrape content from a page that blocks simple fetches
- Perform multi-step browser workflows (e.g., check GoFundMe donor list, browse LinkedIn search results)

NOTE: For most research tasks (live GoFundMe totals, job postings, LinkedIn profiles, GitHub repos, etc.),
web_search is faster and sufficient. Only use run_cowork_task when web_search returns no usable results.`,
  input_schema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Clear, specific description of what to do in the browser. Include the exact URL if known.',
      },
    },
    required: ['prompt'],
  },
};

/**
 * Create an executor function for the run_cowork_task tool.
 * The executor POSTs to /api/cowork-bridge and returns the result.
 *
 * @param {object} context
 * @param {string} context.agentKey   — e.g. 'research', 'exec-pm', 'jobs'
 * @param {string} context.channelId  — Slack channel ID for posting results
 * @param {string} context.threadTs   — Slack thread timestamp (optional)
 * @returns {Function} async (toolName, toolInput) => string
 */
function createCoworkExecutor({ agentKey, channelId, threadTs }) {
  return async function executeTool(toolName, toolInput) {
    if (toolName !== 'run_cowork_task') {
      return `Unknown tool: ${toolName}`;
    }

    const { prompt } = toolInput;
    console.log(`[tools] run_cowork_task dispatched by ${agentKey}: ${prompt.slice(0, 80)}`);

    try {
      const response = await fetch(`${APP_BASE_URL}/api/cowork-bridge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': INTERNAL_SECRET,
        },
        body: JSON.stringify({
          prompt,
          channel_id: channelId,
          thread_ts: threadTs,
          agent_name: agentKey,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return `Cowork bridge error (${response.status}): ${data.error || 'unknown error'}`;
      }

      return data.result || 'Task dispatched — result will be posted to thread.';
    } catch (err) {
      console.error('[tools] run_cowork_task error:', err.message);
      return `Failed to dispatch cowork task: ${err.message}`;
    }
  };
}

module.exports = {
  RUN_COWORK_TASK_TOOL,
  createCoworkExecutor,
};
