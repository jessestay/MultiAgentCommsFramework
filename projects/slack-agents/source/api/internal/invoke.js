// api/internal/invoke.js — Internal agent invocation endpoint
//
// Called by agentToAgent() in lib/slack.js to trigger a target agent's handleMessage()
// directly, bypassing the bot_message filter in api/slack/events.js that would otherwise
// swallow agent-posted Slack messages before the receiving agent can act on them.
//
// Security: requires the x-internal-secret header to match INTERNAL_SECRET env var.
// Set INTERNAL_SECRET to any random string in Vercel (e.g. openssl rand -hex 32).
//
// IMPORTANT: This endpoint waits for handleMessage() to complete before responding.
// Unlike the public Slack events endpoint (which must ACK in 3 seconds), this internal
// endpoint has no time constraint — waiting ensures the function doesn't get killed
// by Vercel before the agent finishes its Claude API call and posts to Slack.

const execPm     = require('../../agents/exec-pm');
const marketing  = require('../../agents/marketing');
const transkrybe = require('../../agents/transkrybe');
const content    = require('../../agents/content');
const jobs       = require('../../agents/jobs');
const research   = require('../../agents/research');

const AGENT_HANDLERS = { 'exec-pm': execPm, marketing, transkrybe, content, jobs, research };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify internal secret — reject anything without the right header
  const secret = req.headers['x-internal-secret'];
  const expected = process.env.INTERNAL_SECRET || '';
  if (!expected || secret !== expected) {
    console.warn('Internal invoke: unauthorized attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let body = req.body;
  // Vercel may not auto-parse JSON for internal routes — handle both cases
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  if (!body) return res.status(400).json({ error: 'Missing body' });

  const { agentKey, text, channel, thread_ts, fromAgent } = body;
  if (!agentKey || !text) return res.status(400).json({ error: 'agentKey and text required' });

  const handler = AGENT_HANDLERS[agentKey];
  if (!handler) {
    console.error(`Internal invoke: unknown agent "${agentKey}"`);
    return res.status(400).json({ error: `Unknown agent: ${agentKey}` });
  }

  // Run the handler and WAIT for it to complete before responding.
  // This ensures Vercel doesn't kill the function before the agent posts to Slack.
  // The internal invoke has no 3-second ACK requirement (unlike the public Slack events endpoint).
  try {
    console.log(`[internal/invoke] ${fromAgent || 'direct'} → ${agentKey}: ${text.slice(0, 80)}`);
    await handler.handleMessage(text, {
      channel: channel || agentKey,
      channelId: null,
      thread_ts: thread_ts || null,
      userName: fromAgent || 'agent',
      isAgentToAgent: !!fromAgent,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[internal/invoke] error in ${agentKey}:`, err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
};
