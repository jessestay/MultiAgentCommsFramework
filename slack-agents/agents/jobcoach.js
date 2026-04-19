// agents/jobcoach.js — Job Coach (@jobcoach)
// Scans for executive job opportunities for Jesse. Friday pipeline reports.
// Memory: isolated to jobcoach namespace.

const cron = require('node-cron');
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport, generateProactivePost } = require('../utils/anthropic');

const AGENT = AGENTS.jobcoach;
const AGENT_ID = AGENT.id; // 'jobcoach'

let slackClient = null;
const channelIdCache = {};

async function resolveChannel(name) {
  if (channelIdCache[name]) return channelIdCache[name];
  try {
    const result = await slackClient.conversations.list({ types: 'public_channel,private_channel', limit: 200 });
    for (const ch of result.channels) channelIdCache[ch.name] = ch.id;
    return channelIdCache[name];
  } catch (err) {
    console.error(`[jobcoach] Could not resolve channel ${name}:`, err.message);
    return null;
  }
}

async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) { console.warn(`[jobcoach] Channel not found: #${channelName}`); return; }
  try {
    await slackClient.chat.postMessage({
      channel: channelId, text,
      username: AGENT.slackName, icon_emoji: AGENT.icon, unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[jobcoach] ✅ Posted to #${channelName}`);
  } catch (err) {
    console.error(`[jobcoach] Error posting to #${channelName}:`, err.message);
  }
}

// ─── Job search (every 6 hours) ───────────────────────────────────────────────
async function searchJobs() {
  console.log('[jobcoach] Scanning for job opportunities...');
  state.set(AGENT_ID, 'lastSearched', new Date().toISOString());

  const context = `
Scan for executive job opportunities for Jesse Stay. Today: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.

Jesse's target profile:
- Title: Director, VP, SVP, or C-suite
- Function: Social media, marketing, growth, community, developer relations, AI-adjacent
- Type: Remote-first preferred
- Companies: Tech, SaaS, mission-driven nonprofits, accessibility orgs
- Compensation: Commensurate with Director+ experience (tech sector)

Identify 2-3 realistic opportunities that would be strong fits given Jesse's background:
- 338K Facebook followers, 114.7K Twitter/X followers
- Social media platform insider (worked at Google+, Facebook, Twitter)
- Tech founder (transkrybe.com)
- Accessibility advocate (son Louis has ME/CFS + hEDS)
- Strong public speaker and community builder

For each opportunity, format as:
*[Title]* at *[Company]*
🔗 Apply: [specific realistic job board URL or "Search LinkedIn for exact posting"]
🎯 Fit: [1 sentence why this is perfect for Jesse]
📅 Act by: [specific date or "Apply within 2 weeks for best results"]
⚡ Edge: [Jesse's unique competitive angle for this specific role]
  `.trim();

  const jobs = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await postToChannel(AGENT.primaryChannel, `${AGENT.emoji} *🔍 Job Scan Results*\n${jobs}`);
}

// ─── Friday pipeline report ───────────────────────────────────────────────────
async function postWeeklyPipelineReport() {
  const thisWeek = getISOWeek();
  if (state.get(AGENT_ID, 'lastWeeklyReport') === thisWeek) {
    console.log('[jobcoach] Weekly report already posted this week.');
    return;
  }

  console.log('[jobcoach] Generating weekly pipeline report...');
  const opportunities = state.get(AGENT_ID, 'activeOpportunities') || [];

  const context = `
Weekly job pipeline report for Jesse Stay — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.

${opportunities.length > 0
  ? `Active opportunities being tracked:\n${opportunities.map((o, i) => `${i + 1}. ${o.title} at ${o.company} — ${o.stage}`).join('\n')}`
  : 'No opportunities currently tracked. Starting fresh scan.'
}

Write a Friday pipeline status report:
1. Summary of active opportunities and their stages
2. Recommended actions for this weekend/next week
3. Any applications Jesse should prioritize
4. Networking touchpoints he should make

Be direct and action-oriented. No fluff.
  `.trim();

  const report = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1200 });
  await postToChannel(AGENT.primaryChannel, `${AGENT.emoji} *📊 Weekly Job Pipeline*\n${report}`);
  state.set(AGENT_ID, 'lastWeeklyReport', thisWeek);
}

// ─── Handle @mention ──────────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    await say(`${AGENT.emoji} *${AGENT.slackName}* | Job Coach here. What opportunity are we hunting today?`);
    return;
  }

  console.log(`[jobcoach] Handling mention: "${text.slice(0, 80)}"`);
  const context = `Jesse asked: "${text}"\nLast search: ${state.get(AGENT_ID, 'lastSearched') || 'never'}\nTracked opportunities: ${(state.get(AGENT_ID, 'activeOpportunities') || []).length}`;
  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  await say(`${AGENT.emoji} *${AGENT.slackName}* | ${response}`);
  state.updateChannelActivity(AGENT.primaryChannel);
}

// ─── Handle delegation ────────────────────────────────────────────────────────
async function handleDelegation(messageText) {
  const match = messageText.match(/\[from:\s*(.+?)\s*→\s*Job\s*Coach\]\s*(.+)/si);
  if (!match) return false;

  const fromAgent = match[1].trim();
  const request = match[2].trim();
  console.log(`[jobcoach] Delegation from ${fromAgent}: ${request.slice(0, 80)}`);

  const context = `Delegation from ${fromAgent}:\n"${request}"\nRespond as Job Coach with career strategy advice.`;
  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  await postToChannel(AGENT.primaryChannel, `${AGENT.emoji} *[from: Job Coach → ${fromAgent}]* ${response}`);
  return true;
}

function getISOWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return `${now.getFullYear()}-W${Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7)}`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[jobcoach] 💼 Job Coach initialized');

  // Job search every 6 hours
  cron.schedule('0 */6 * * *', () =>
    searchJobs().catch(err => console.error('[jobcoach] Job search error:', err))
  );

  // Friday pipeline report — Fridays at 4pm MT (22:00 UTC)
  cron.schedule('0 22 * * 5', () =>
    postWeeklyPipelineReport().catch(err => console.error('[jobcoach] Pipeline report error:', err))
  );

  // Initial search on startup (60s delay)
  setTimeout(() => {
    searchJobs().catch(err => console.error('[jobcoach] Initial search error:', err));
  }, 60_000);
}

module.exports = { init, handleMention, handleDelegation, searchJobs, postWeeklyPipelineReport };
