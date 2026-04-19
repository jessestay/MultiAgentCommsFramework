// agents/marketing.js — Marketing Agent 📣
// Monitors GoFundMe, Facebook schedule, posts weekly content calendar

const cron = require('node-cron');
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport, generateProactivePost } = require('../utils/anthropic');
const { fetchDonationTotal, formatDonationUpdate, GOFUNDME_URL } = require('../utils/gofundme');

const AGENT = AGENTS.marketing;

let slackClient = null;
let channelIdMap = {};

async function resolveChannel(name) {
  if (channelIdMap[name]) return channelIdMap[name];
  try {
    const result = await slackClient.conversations.list({ types: 'public_channel,private_channel', limit: 200 });
    for (const ch of result.channels) {
      channelIdMap[ch.name] = ch.id;
    }
    return channelIdMap[name];
  } catch (err) {
    console.error('[marketing] Could not resolve channel:', name, err.message);
    return null;
  }
}

async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) {
    console.warn(`[marketing] Could not find channel: ${channelName}`);
    return;
  }
  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      text: `${AGENT.emoji} *Marketing* | ${text}`,
      unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[marketing] Posted to #${channelName}`);
  } catch (err) {
    console.error(`[marketing] Error posting to #${channelName}:`, err.message);
  }
}

// ─── GoFundMe polling (every 30min) ─────────────────────────────────────────
async function pollGoFundMe() {
  console.log('[marketing] Polling GoFundMe...');
  const current = await fetchDonationTotal();
  if (!current) return;

  const lastAmount = state.get('gofundme.lastAmount') || 0;
  state.set('gofundme.lastChecked', new Date().toISOString());

  if (lastAmount === 0) {
    // First run — just save, don't alert
    state.set('gofundme.lastAmount', current.amount);
    console.log(`[marketing] GoFundMe baseline set: $${current.amount}`);
    return;
  }

  if (current.amount !== lastAmount) {
    const delta = current.amount - lastAmount;
    const deltaText = delta > 0 ? `+$${delta.toFixed(2)}` : `-$${Math.abs(delta).toFixed(2)}`;

    const context = `
GoFundMe for Louis Stay just changed:
- Previous total: $${lastAmount}
- New total: $${current.amount}
- Change: ${deltaText}
- Progress: ${current.percentFunded}% of $2,800 goal
- URL: ${GOFUNDME_URL}

Write a brief, energetic Slack update about this donation change.
Mention the specific change amount. Keep it human and celebratory if it's a donation.
Suggest what Jesse could post on his social channels to thank donors or encourage more.
Note that Jesse needs to ✅ any social content before posting.
    `.trim();

    const text = await generateProactivePost({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 600 });
    await postToChannel(AGENT.channel, text);

    state.set('gofundme.lastAmount', current.amount);
    console.log(`[marketing] GoFundMe change detected: $${lastAmount} → $${current.amount}`);
  } else {
    console.log(`[marketing] GoFundMe unchanged: $${current.amount}`);
  }
}

// ─── Weekly content calendar (Mondays 9am MT = 15:00 UTC) ───────────────────
async function postWeeklyContentCalendar() {
  console.log('[marketing] Generating weekly content calendar...');
  const lastCalendar = state.get('marketing.lastWeeklyCalendar');
  const thisWeek = getISOWeek();
  if (lastCalendar === thisWeek) {
    console.log('[marketing] Weekly calendar already posted this week, skipping.');
    return;
  }

  const gofundme = await fetchDonationTotal();
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday

  const context = `
Generate a weekly content calendar for Jesse Stay.
Week of: ${weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

Active campaigns:
1. Louis Stay GoFundMe — currently $${gofundme?.amount || '?'} raised of $2,800
2. transkrybe.com product awareness
3. Jesse's personal brand / social media thought leadership

Jesse's channels: Facebook (338K), Twitter/X (114.7K), LinkedIn, 3 TikToks, 3 YouTubes

Create a Mon-Sun calendar suggesting:
- 1 piece of content per day
- Platform-specific (rotate across FB, X, LinkedIn, TikTok)
- Mix of GoFundMe awareness, transkrybe, and personal brand content
- All must be flagged as "needs Jesse's ✅ before posting"

Format each day as: *Day* — Platform — Topic (with brief rationale)
  `.trim();

  const calendar = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await postToChannel(AGENT.channel, `*📅 Weekly Content Calendar*\n${calendar}`);

  state.set('marketing.lastWeeklyCalendar', thisWeek);
}

// ─── Daily engagement nudge ──────────────────────────────────────────────────
async function postDailyEngagementNudge() {
  const context = `
Give Jesse one specific, actionable engagement tip for today.
Base it on his active campaigns* GoFundMe for Louis, transkrybe product, personal brand.
Keep it to 2-3 sentences max. Be specific. No generic advice.
  `.trim();

  const text = await generateProactivePost({ systemPrompt: AGENT.systemPrompt, context });
  await postToChannel(AGENT.channel, `*💡 Today's Engagement Nudge*\n${text}`);
}

// ─── Respond to @mentions ────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) return;

  const response = await generateReport({
    systemPrompt: AGENT.systemPrompt,
    context: `Jesse asked: "${text}"\n\nCurrent GoFundMe: $${state.get('gofundme.lastAmount')} raised of $2,800`,
  });

  await say(`${AGENT.emoji} *Marketing* | ${response}`);
  state.updateChannelActivity(AGENT.channel);
}

// ─── Handle delegation ───────────────────────────────────────────────────────
async function handleDelegation(message, channelName) {
  const delegationMatch = message.match(/\[from: (\w[\w\s]+) → Marketing\] (.+)/s);
  if (!delegationMatch) return false;

  const fromAgent = delegationMatch[1];
  const request = delegationMatch[2].trim();
  console.log(`[marketing] Delegation from ${fromAgent}:`, request);

  const response = await generateReport({
    systemPrompt: AGENT.systemPrompt,
    context: `Delegation request from ${fromAgent} agent:\n${request}`,
  });

  await postToChannel(AGENT.channel, `[from: Marketing → ${fromAgent}] ${response}`);
  return true;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getISOWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week}`;
}

// ─── Init ────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[marketing] Agent initialized');

  // GoFundMe poll every 30 minutes
  cron.schedule('*/30 * * * *', () => pollGoFundMe().catch(err => console.error('[marketing] GoFundMe poll error:', err)));

  // Weekly content calendar — Mondays at 9am MT (15:00 UTC)
  cron.schedule('0 15 * * 1', () => postWeeklyContentCalendar().catch(err => console.error('[marketing] Weekly calendar error:', err)));

  // Daily engagement nudge — weekdays at 9:30am MT (15:30 UTC)
  cron.schedule('30 15 * * 1-5', () => postDailyEngagementNudge().catch(err => console.error('[marketing] Daily nudge error:', err)));

  // Initial poll on startup
  setTimeout(() => {
    pollGoFundMe().catch(err => console.error('[marketing] Initial poll error:', err));
  }, 15000);
}

module.exports = { init, handleMention, handleDelegation, pollGoFundMe };
