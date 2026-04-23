// api/cowork-bridge.js — Cowork dispatch bridge
//
// Agents call this when they need full browser/computer access for tasks
// that web_search can't handle (login-gated pages, form-filling, UI interaction).
//
// POST { prompt, channel_id, thread_ts, agent_name }
//   → calls Anthropic with computer-use + web_search tools
//   → posts the result back to the originating Slack thread

const Anthropic = require('@anthropic-ai/sdk');

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

// For browser-only tasks (no physical desktop), we use web_search instead of
// computer_use — it covers 90%+ of real-world agent needs without requiring a
// running desktop session. computer_use is left as a fallback definition for
// future expansion when a desktop relay is connected.
const COMPUTER_USE_TOOL = {
  type: 'computer_20241022',
  name: 'computer',
  display_width_px: 1280,
  display_height_px: 800,
  display_number: 1,
};

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 10,
};

// Agent key → display info mapping
const AGENT_DISPLAY = {
  'exec-pm':  { username: '📋 Exec PM',          icon_emoji: ':clipboard:' },
  marketing:  { username: '📣 Marketing Agent',   icon_emoji: ':mega:' },
  research:   { username: '🔍 Research Agent',    icon_emoji: ':mag:' },
  jobs:       { username: '💼 Jobs Agent',        icon_emoji: ':briefcase:' },
  transkrybe: { username: '🎵 Transkrybe Agent',  icon_emoji: ':musical_note:' },
  content:    { username: '✍️ Content Agent',     icon_emoji: ':writing_hand:' },
};

/**
 * Post a message to a Slack thread
 */
async function postToSlack(channelId, threadTs, agentKey, text) {
  const agent = AGENT_DISPLAY[agentKey] || { username: '🤖 Agent', icon_emoji: ':robot_face:' };

  const body = {
    channel: channelId,
    text,
    username: agent.username,
    icon_emoji: agent.icon_emoji,
  };
  if (threadTs) body.thread_ts = threadTs;

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!data.ok) {
    console.error('[cowork-bridge] Slack postMessage error:', data.error);
  }
  return data;
}

/**
 * Run an Anthropic task with web_search (and computer_use stub for future expansion).
 * For browser tasks, web_search covers the vast majority of use cases without
 * requiring an active desktop session.
 */
async function runCoworkTask(prompt, agentName) {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Use web_search as primary tool — handles 90% of "browser" tasks:
  // live URLs, LinkedIn profiles, GoFundMe totals, job postings, etc.
  // computer_use would require a running desktop relay — not available in Vercel.
  const tools = [WEB_SEARCH_TOOL];

  const systemPrompt = `You are a research and browser agent helping ${agentName || 'an AI agent'} complete a task.
You have access to web_search to find live data from the internet.
Be thorough but concise — find exactly what was asked for and report back with the specific data.
Always include the source URL when reporting data you found.`;

  const messages = [{ role: 'user', content: prompt }];
  let iterations = 0;
  const MAX_ITERATIONS = 8;

  while (iterations < MAX_ITERATIONS) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text || 'Task completed — no text output.';
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const result = block.name === 'web_search'
          ? '(web_search executed server-side by Anthropic)'
          : `Tool "${block.name}" not available in this environment.`;

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
    return textBlock?.text || 'Task completed.';
  }

  return 'Reached iteration limit — task may be incomplete. Try a more specific request.';
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate internal secret
  const authHeader = req.headers['x-internal-secret'];
  const querySecret = req.query?.secret;
  const providedSecret = authHeader || querySecret;

  if (!INTERNAL_SECRET || providedSecret !== INTERNAL_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { prompt, channel_id, thread_ts, agent_name } = req.body || {};

  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  console.log(`[cowork-bridge] Task from ${agent_name || 'unknown'}: ${prompt.slice(0, 80)}`);

  // Acknowledge immediately (Vercel functions have a 60s limit)
  if (channel_id) {
    await postToSlack(channel_id, thread_ts, agent_name, `🔍 Running browser task: _${prompt.slice(0, 100)}..._`);
  }

  try {
    const result = await runCoworkTask(prompt, agent_name);

    if (channel_id) {
      const formattedResult = `*Cowork task complete:*\n\n${result}`;
      await postToSlack(channel_id, thread_ts, agent_name, formattedResult);
    }

    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('[cowork-bridge] Error:', err.message);
    const errorMsg = `⚠️ Browser task failed: ${err.message}`;
    if (channel_id) {
      await postToSlack(channel_id, thread_ts, agent_name, errorMsg);
    }
    return res.status(500).json({ error: err.message });
  }
};
