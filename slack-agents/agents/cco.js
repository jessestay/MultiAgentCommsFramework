// agents/cco.js — CCO (@cco) | MACF Role: Copy/Technical Writer (CTW)
// Chief Content Officer. Daily content suggestions. Drafts for Jesse's approval.
// Memory: isolated to cco namespace.

const cron = require('node-cron');
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport, generateProactivePost } = require('../utils/anthropic');
const { resolveChannel: _resolveChannel } = require('../utils/channels');
const { relay, stripDelegations } = require('../utils/delegation');

const AGENT = AGENTS.cco;
const AGENT_ID = AGENT.id; // 'cco'

let slackClient = null;

async function resolveChannel(name) {
  return _resolveChannel(slackClient, name);
}

async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) { console.warn(`[cco] Channel not found: #${channelName}`); return; }
  try {
    await slackClient.chat.postMessage({
      channel: channelId, text,
      username: AGENT.slackName, icon_emoji: AGENT.icon, unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[cco] ✅ Posted to #${channelName}`);
  } catch (err) {
    console.error(`[cco] Error posting to #${channelName}:`, err.message);
  }
}

// ─── Daily content suggestion ─────────────────────────────────────────────────
async function postDailyContentSuggestion() {
  const today = new Date().toDateString();
  if (state.get(AGENT_ID, 'lastSuggestedDate') === today) {
    console.log('[cco] Daily content already suggested today, skipping.');
    return;
  }

  console.log('[cco] Generating daily content suggestion...');

  // Rotate through content themes
  const themes = [
    'GoFundMe awareness — tell Louis\'s story in a new angle',
    'transkrybe.com product — a specific feature or use case',
    'Jesse personal brand — social media expertise tip or insight',
    'GoFundMe thank-you / donor appreciation post',
    'transkrybe.com — behind-the-scenes founder story',
    'Jesse personal brand — accessibility advocacy thought leadership',
    'Engagement hook — question or poll for Jesse\'s audience',
  ];
  const dayOfWeek = new Date().getDay(); // 0 = Sunday
  const theme = themes[dayOfWeek % themes.length];

  const pendingApprovals = state.get(AGENT_ID, 'pendingApprovals') || [];

  const context = `
Today's content theme: ${theme}
Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Denver' })} MT
Pending approvals: ${pendingApprovals.length} items waiting for Jesse's ✅

Write one complete, ready-to-post piece of content for Jesse.
Platform suggestion based on theme: pick the best fit (Facebook, Twitter/X, LinkedIn, or TikTok script).
Write in Jesse's voice — direct, authentic, dad who cares, tech founder who's building real things.
No AI buzzwords. No hollow affirmations. Sound like a real human.

Format:
*📝 Daily Content Draft — [Platform]*
[The actual draft content, ready to copy-paste]
---
✅ Awaiting Jesse's approval before posting.
📌 Theme: ${theme}
  `.trim();

  const draft = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1200 });

  const approvalItem = {
    id: `draft-${Date.now()}`,
    suggestedAt: new Date().toISOString(),
    theme,
    draft: draft.slice(0, 500), // Store summary
  };
  state.push(AGENT_ID, 'pendingApprovals', approvalItem, 50);
  state.set(AGENT_ID, 'lastSuggestedDate', today);

  await postToChannel(AGENT.primaryChannel, draft);
}

// ─── Handle reaction (✅ = approved) ─────────────────────────────────────────
async function handleReaction({ event, client }) {
  if (!['white_check_mark', 'heavy_check_mark'].includes(event.reaction)) return;
  if (event.item.type !== 'message') return;

  console.log('[cco] Content approval reaction detected');
  // Get the message that was reacted to
  try {
    const result = await client.conversations.history({
      channel: event.item.channel,
      oldest: String(Number(event.item.ts) - 1),
      latest: event.item.ts,
      limit: 1,
      inclusive: true,
    });
    const msg = result.messages?.[0];
    if (!msg) return;

    state.push(AGENT_ID, 'approvedContent', {
      approvedAt: new Date().toISOString(),
      content: (msg.text || '').slice(0, 300),
    });

    await postToChannel(AGENT.primaryChannel, "Content approved by Jesse. Logged and ready to schedule when you give the go-ahead.");
  } catch (err) {
    console.error('[cco] Error handling reaction:', err.message);
  }
}

// ─── Handle @mention ──────────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    const pending = (state.get(AGENT_ID, 'pendingApprovals') || []).length;
    await say(`CCO here. ${pending > 0 ? `${pending} draft(s) still waiting on your approval.` : "What content do you need?"}`);
    return;
  }

  const threadCtx = event.threadContext || '';
  console.log(`[cco] Handling mention: "${text.slice(0, 80)}"`);
  const context = `Jesse asked: "${text}"${threadCtx}\nPending approvals: ${(state.get(AGENT_ID, 'pendingApprovals') || []).length}`;
  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  await relay(response, AGENT_ID);
  await say(stripDelegations(response));
  state.updateChannelActivity(AGENT.primaryChannel);
}

// ─── Handle delegation ────────────────────────────────────────────────────────
async function handleDelegation(messageText, visitedAgents = new Set(), channelId = null) {
  const match = messageText.match(/\[from:\s*(.+?)\s*→\s*CCO\]\s*(.+)/si);
  if (!match) return false;

  const fromAgent = match[1].trim();
  const request = match[2].trim();
  console.log(`[cco] Delegation from ${fromAgent}: ${request.slice(0, 80)}`);

  state.push(AGENT_ID, 'delegationLog', {
    from: fromAgent, request: request.slice(0, 200), timestamp: new Date().toISOString()
  });

  const context = `Delegation request from ${fromAgent}:\n"${request}"\n\nRespond as Chief Content Officer. Draft requested content or answer the content question. Mark all drafts with "✅ Awaiting Jesse's approval".`;
  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await relay(response, AGENT_ID, visitedAgents, channelId);
  await postToChannel(AGENT.primaryChannel, `[from: CCO → ${fromAgent}] ${stripDelegations(response)}`);
  return true;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[cco] ✍️ Chief Content Officer initialized');

  // Daily content suggestion — weekdays 8:30am MT (14:30 UTC)
  cron.schedule('30 14 * * 1-5', () =>
    postDailyContentSuggestion().catch(err => console.error('[cco] Daily suggestion error:', err))
  );

  // Also post on Saturdays (lighter touch) — 9am MT (15:00 UTC)
  cron.schedule('0 15 * * 6', () =>
    postDailyContentSuggestion().catch(err => console.error('[cco] Sat suggestion error:', err))
  );
}

module.exports = { init, handleMention, handleDelegation, handleReaction, postDailyContentSuggestion };
