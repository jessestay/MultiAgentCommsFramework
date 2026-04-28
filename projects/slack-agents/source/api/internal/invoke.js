// api/internal/invoke.js — Internal agent invocation endpoint
//
// Called by agentToAgent() in lib/slack.js to trigger a target agent's handleMessage()
// directly, bypassing the bot_message filter in api/slack/events.js that would otherwise
// swallow agent-posted Slack messages before the receiving agent can act on them.
//
// Security: requires the x-internal-secret header to match INTERNAL_SECRET env var.

const execPm    = require('../../agents/exec-pm');
const marketing = require('../../agents/marketing');
const transkrybe = require('../../agents/transkrybe');
const content   = require('../../agents/content');
const jobs      = require('../../agents/jobs');
const research  = require('../../agents/research');

const AGENT_HANDLERS = { 'exec-pm': execPm, marketing, transkrybe, content, jobs, research };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = req.headers['x-internal-secret'];
  const expected = process.env.INTERNAL_SECRET || '';
  if (expected && secret !== expected) {
    console.warn('Internal invoke: unauthorized attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  if (!body) return res.status(400).json({ error: 'Missing body' });

  const { agentKey, text, channel, thread_ts, fromAgent } = body;
  if (!agentKey || !text) return res.status(400).json({ error: 'agentKey and text required' });

  const handler = AGENT_HANDLERS[agentKey];
  if (!handler) return res.status(400).json({ error: 'Unknown agent: ' + agentKey });

  res.status(200).json({ ok: true });

  try {
    await handler.handleMessage(text, {
      channel: channel || agentKey,
      channelId: null,
      thread_ts: thread_ts || null,
      userName: fromAgent || 'agent',
      isAgentToAgent: true,
    });
  } catch (err) {
    console.error('[internal/invoke] error in ' + agentKey + ':', err.message);
  }
};
