// agents/jobcoach.js — Job Coach (@jobcoach)
// Scans for executive job opportunities for Jesse. Friday pipeline reports.
// Memory: isolated to jobcoach namespace.

const cron = require('node-cron');
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport, generateProactivePost } = require('../utils/anthropic');
const { resolveChannel: _resolveChannel } = require('../utils/channels');
const { relay, stripDelegations } = require('../utils/delegation');

const AGENT = AGENTS.jobcoach;
const AGENT_ID = AGENT.id; // 'jobcoach'

let slackClient = null;

async function resolveChannel(name) {
  return _resolveChannel(slackClient, name);
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
You are the Job Coach. Scan for executive job opportunities for Jesse Stay. Today: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.

Jesse's target profile: Director, VP, SVP, or C-suite. Social media, marketing, growth, community, DevRel, AI-adjacent. Remote-first. Tech/SaaS/accessibility orgs.

Background: 338K Facebook, 114.7K Twitter/X. Worked inside Google+, Facebook, Twitter. Building transkrybe.com. Accessibility advocate (son Louis has ME/CFS + hEDS).

Find 2-3 realistic strong-fit opportunities. For each: title, company, where to apply, why it fits, Jesse's competitive edge, and when to act. Plain text, no emoji or bold headers.

IMPORTANT: Do not address Jesse directly. This post goes in #jobs for the team's visibility. At the end, route your findings to Exec PM: [from: Job Coach → Exec PM] Brief summary of top opportunities found so Jesse can be briefed.
  `.trim();

  const jobs = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await postToChannel(AGENT.primaryChannel, jobs);
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
  await postToChannel(AGENT.primaryChannel, report);
  state.set(AGENT_ID, 'lastWeeklyReport', thisWeek);
}

// ─── Handle @mention ──────────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    await say("Job Coach here. What opportunity are we hunting today?");
    return;
  }

  console.log(`[jobcoach] Handling mention: "${text.slice(0, 80)}"`);
  const context = `Jesse asked: "${text}"\nLast search: ${state.get(AGENT_ID, 'lastSearched') || 'never'}\nTracked opportunities: ${(state.get(AGENT_ID, 'activeOpportunities') || []).length}`;
  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  await relay(response, AGENT_ID);
  await say(stripDelegations(response));
  state.updateChannelActivity(AGENT.primaryChannel);
}

// ─── Handle delegation ────────────────────────────────────────────────────────
async function handleDelegation(messageText, visitedAgents = new Set()) {
  const match = messageText.match(/\[from:\s*(.+?)\s*→\s*Job\s*Coach\]\s*(.+)/si);
  if (!match) return false;

  const fromAgent = match[1].trim();
  const request = match[2].trim();
  console.log(`[jobcoach] Delegation from ${fromAgent}: ${request.slice(0, 80)}`);

  const context = `Delegation from ${fromAgent}:\n"${request}"\nRespond as Job Coach with career strategy advice.`;
  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  await relay(response, AGENT_ID, visitedAgents);
  await postToChannel(AGENT.primaryChannel, `[from: Job Coach → ${fromAgent}] ${stripDelegations(response)}`);
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
