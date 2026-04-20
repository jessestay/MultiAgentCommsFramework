// agents/cmo.js — CMO (@cmo) | MACF Role: Marketing Director (MD)
// Leads the Branding Team. GoFundMe monitor. Weekly content calendar. Campaign strategy.
// Memory: isolated to cmo namespace.

const cron = require('node-cron');
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport, generateProactivePost } = require('../utils/anthropic');
const { fetchDonationTotal, GOFUNDME_URL } = require('../utils/gofundme');
const { resolveChannel: _resolveChannel } = require('../utils/channels');
const { relay } = require('../utils/delegation');

const AGENT = AGENTS.cmo;
const AGENT_ID = AGENT.id; // 'cmo'

let slackClient = null;

// ─── Channel resolution ───────────────────────────────────────────────────────
async function resolveChannel(name) {
  return _resolveChannel(slackClient, name);
}

async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) {
    console.warn(`[cmo] Channel not found: #${channelName}`);
    return;
  }
  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      text,
      username: AGENT.slackName,
      icon_emoji: AGENT.icon,
      unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[cmo] ✅ Posted to #${channelName}`);
  } catch (err) {
    console.error(`[cmo] Error posting to #${channelName}:`, err.message);
  }
}

// ─── GoFundMe polling (every 30min) ─────────────────────────────────────────
async function pollGoFundMe() {
  console.log('[cmo] Polling GoFundMe...');
  const current = await fetchDonationTotal().catch(() => null);
  if (!current) return;

  const lastAmount = state.get(AGENT_ID, 'knownDonationAmount') || 0;
  state.set(AGENT_ID, 'lastGoFundMeCheck', new Date().toISOString());

  if (lastAmount === 0) {
    // First run — set baseline silently
    state.set(AGENT_ID, 'knownDonationAmount', current.amount);
    console.log(`[cmo] GoFundMe baseline set: $${current.amount}`);
    return;
  }

  if (current.amount !== lastAmount) {
    const delta = current.amount - lastAmount;
    const isIncrease = delta > 0;
    const deltaText = isIncrease ? `+$${delta.toFixed(2)}` : `-$${Math.abs(delta).toFixed(2)}`;

    const context = `
GoFundMe for Louis Stay (ME/CFS + hEDS) just changed:
- Previous total: $${lastAmount}
- New total: $${current.amount} raised of $2,800 goal
- Change: ${deltaText}
- Progress: ${current.percentFunded}%
- URL: ${GOFUNDME_URL}

Write a brief, energetic marketing update about this change.
Include specific numbers. ${isIncrease ? 'Be celebratory.' : 'Be supportive and encouraging.'}
Suggest 1-2 specific social media angles Jesse could use to amplify this.
All suggestions must note: "🔴 Needs Jesse's ✅ before posting"
    `.trim();

    const text = await generateProactivePost({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 600 });
    await postToChannel(AGENT.primaryChannel, `${AGENT.emoji} *GoFundMe Update* ${deltaText}\n${text}`);

    state.set(AGENT_ID, 'knownDonationAmount', current.amount);
    console.log(`[cmo] GoFundMe change: $${lastAmount} → $${current.amount}`);
  } else {
    console.log(`[cmo] GoFundMe unchanged: $${current.amount}`);
  }
}

// ─── Weekly content calendar (Mondays 9am MT = 15:00 UTC) ────────────────────
async function postWeeklyContentCalendar() {
  const thisWeek = getISOWeek();
  if (state.get(AGENT_ID, 'lastWeeklyCalendar') === thisWeek) {
    console.log('[cmo] Weekly calendar already posted this week.');
    return;
  }

  console.log('[cmo] Generating weekly content calendar...');
  const gofundme = await fetchDonationTotal().catch(() => null);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);

  const context = `
Weekly content calendar for Jesse Stay.
Week of: ${weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

Active campaigns:
1. Louis Stay GoFundMe — $${gofundme?.amount || '?'} raised of $2,800
2. transkrybe.com music transcription SaaS — awareness and growth
3. Jesse's personal brand — tech founder, dad, accessibility advocate

Jesse's channels: Facebook (338K), Twitter/X (114.7K), LinkedIn, 3 TikToks, 3 YouTubes

Create a Mon–Sun calendar:
- 1 content piece per day
- Rotate platforms (FB, X, LinkedIn, TikTok)
- Mix: GoFundMe (2x), transkrybe (2x), personal brand (2x), engagement (1x)
- Each marked: "🔴 Needs Jesse's ✅"

Format: *Day* — Platform — Content type — Topic — Rationale (1 line)
  `.trim();

  const calendar = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await postToChannel(AGENT.primaryChannel, `${AGENT.emoji} *📅 Weekly Content Calendar*\n${calendar}`);

  // Delegate execution to CCO
  await postToChannel(AGENT.primaryChannel,
    `${AGENT.emoji} *[from: CMO → CCO]* Weekly calendar is up. Please draft the first 2 posts (Mon + Tue) for Jesse's review.`
  );

  state.set(AGENT_ID, 'lastWeeklyCalendar', thisWeek);
}

// ─── Handle @mention ──────────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    await say(`${AGENT.emoji} *${AGENT.slackName}* | CMO here. What marketing strategy can I help with?`);
    return;
  }

  console.log(`[cmo] Handling mention: "${text.slice(0, 80)}"`);

  const context = `
Jesse asked (in #marketing or via @mention): "${text}"
My current state: GoFundMe last known: $${state.get(AGENT_ID, 'knownDonationAmount')} raised.
Last weekly calendar: ${state.get(AGENT_ID, 'lastWeeklyCalendar') || 'not posted yet'}
  `.trim();

  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  await say(`${AGENT.emoji} *${AGENT.slackName}* | ${response}`);
  state.updateChannelActivity(AGENT.primaryChannel);
  await relay(response, AGENT_ID);
}

// ─── Handle delegation ────────────────────────────────────────────────────────
async function handleDelegation(messageText, visitedAgents = new Set()) {
  const match = messageText.match(/\[from:\s*(.+?)\s*→\s*CMO\]\s*(.+)/si);
  if (!match) return false;

  const fromAgent = match[1].trim();
  const request = match[2].trim();
  console.log(`[cmo] Delegation from ${fromAgent}: ${request.slice(0, 80)}`);

  // Log delegation for context (agents can't read each other's memory)
  state.push(AGENT_ID, 'delegationLog', {
    from: fromAgent, request: request.slice(0, 200), timestamp: new Date().toISOString()
  });

  const context = `
Delegation request from ${fromAgent}:
"${request}"

Respond as CMO. If this requires research, delegate to CRO.
If it needs content drafted, delegate to CCO. If it needs design, delegate to CUXO.
  `.trim();

  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  await postToChannel(AGENT.primaryChannel, `${AGENT.emoji} *[from: CMO → ${fromAgent}]* ${response}`);
  await relay(response, AGENT_ID, visitedAgents);
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getISOWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week}`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[cmo] 📊 Chief Marketing Officer initialized');

  // GoFundMe poll every 30 minutes
  cron.schedule('*/30 * * * *', () =>
    pollGoFundMe().catch(err => console.error('[cmo] GoFundMe poll error:', err))
  );

  // Weekly content calendar — Mondays at 9am MT (15:00 UTC)
  cron.schedule('0 15 * * 1', () =>
    postWeeklyContentCalendar().catch(err => console.error('[cmo] Calendar error:', err))
  );

  // Initial GoFundMe poll on startup
  setTimeout(() => {
    pollGoFundMe().catch(err => console.error('[cmo] Initial poll error:', err));
  }, 15_000);
}

module.exports = { init, handleMention, handleDelegation, pollGoFundMe, postWeeklyContentCalendar };
