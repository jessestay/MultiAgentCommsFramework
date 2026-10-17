// api/slack/events.js — Main Slack Event Handler
// Processes event FIRST then responds (Vercel terminates after res.json()).
// Fetches recent channel history to give agents conversation context.

const { verifySlackSignature, routeMessage, postAsAgent } = require('../../lib/slack');
const execPm = require('../../agents/exec-pm');
const marketing = require('../../agents/marketing');
const transkrybe = require('../../agents/transkrybe');
const content = require('../../agents/content');
const jobs = require('../../agents/jobs');
const research = require('../../agents/research');

const AGENT_HANDLERS = { 'exec-pm': execPm, marketing, transkrybe, content, jobs, research };
const processedEvents = new Set();

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/**
 * Fetch recent channel history for conversation context
 */
async function getChannelHistory(channelId, limit = 20) {
  try {
    const r = await fetch(
      `https://slack.com/api/conversations.history?channel=${channelId}&limit=${limit}`,
      { headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` } }
    );
    const d = await r.json();
    if (!d.ok) {
      console.log('conversations.history error:', d.error);
      return [];
    }
    // Reverse so oldest first, format for context
    return (d.messages || []).reverse().map(msg => ({
      role: msg.bot_id ? 'assistant' : 'user',
      content: `${msg.username || msg.user || 'user'}: ${msg.text || ''}`,
      ts: msg.ts
    }));
  } catch (err) {
    console.error('Error fetching history:', err.message);
    return [];
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let rawBody;
  try { rawBody = await getRawBody(req); req.rawBody = rawBody; }
  catch (err) { return res.status(400).json({ error: 'Bad request' }); }

  let body;
  try { body = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  if (body.type === 'url_verification') {
    return res.status(200).json({ challenge: body.challenge });
  }

  if (process.env.SLACK_SIGNING_SECRET) {
    try {
      if (!verifySlackSignature(req)) {
        console.warn('Invalid Slack signature');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    } catch (err) {
      console.error('Sig verify error:', err.message);
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // Process FIRST, then respond (Vercel terminates after res.json())
  try {
    await processEvent(body);
  } catch (err) {
    console.error('Error processing event:', err.message, err.stack);
  }

  return res.status(200).json({ ok: true });
};

async function processEvent(body) {
  const event = body.event;
  if (!event) return;

  const eventId = body.event_id;
  if (eventId && processedEvents.has(eventId)) { console.log('Dedup:', eventId); return; }
  if (eventId) {
    processedEvents.add(eventId);
    if (processedEvents.size > 100) processedEvents.delete(processedEvents.values().next().value);
  }

  if (event.type === 'app_mention' || event.type === 'message') {
    await handleMessageEvent(event, body);
  }
  if (body.type === 'block_actions') await handleBlockAction(body);
}

async function handleMessageEvent(event, body) {
  if (event.bot_id || event.subtype === 'bot_message' || event.subtype) return;

  const text = event.text || '';
  const channelId = event.channel;
  const threadTs = event.thread_ts;
  const userName = event.user;

  // Get channel name
  let channelName = null;
  try {
    const r = await fetch(`https://slack.com/api/conversations.info?channel=${channelId}`, {
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }
    });
    const d = await r.json();
    channelName = d.channel?.name;
    if (!d.ok) console.error('conversations.info error:', d.error);
  } catch (err) {
    console.error('conversations.info error:', err.message);
    channelName = 'exec-pm';
  }

  // Fetch recent history for conversation context
  const history = await getChannelHistory(channelId, 20);

  let cleanText = text.replace(/<@[A-Z0-9]+>/g, '').trim();

  if (!cleanText) {
    await postAsAgent('exec-pm', channelName || channelId,
      `Hey Jesse! What can I help you with? Prefix with: \`marketing:\`, \`transkrybe:\`, \`content:\`, \`jobs:\`, \`research:\``);
    return;
  }

  const { agentKey, cleanText: routedText } = routeMessage(channelName || 'exec-pm', cleanText);
  console.log('Routing to:', agentKey, '|', routedText.slice(0, 60));

  const handler = AGENT_HANDLERS[agentKey];
  if (!handler) { console.error('No handler for:', agentKey); return; }

  await handler.handleMessage(routedText, {
    channel: channelName || channelId,
    channelId,
    thread_ts: threadTs,
    userName,
    history, // Pass conversation history
  });
}

async function handleBlockAction(body) {
  const action = body.actions?.[0];
  if (!action) return;
  const value = action.value ? JSON.parse(action.value) : {};
  const channelId = body.channel?.id;
  const userName = body.user?.name || body.user?.id;
  if (action.action_id.startsWith('approve_')) await handleApproval(true, value, channelId, userName);
  else if (action.action_id.startsWith('revise_')) await handleApproval(false, value, channelId, userName);
  try { await fetch(body.response_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ replace_original: false }) }); } catch {}
}

async function handleApproval(approved, value, channelId, userName) {
  const { agentKey } = value;
  await postAsAgent(agentKey, null, approved
    ? `✅ Approved by ${userName}.`
    : `❌ Revision requested by ${userName}. Reply with what to change.`);
}
