// agents/cto.js — CTO (@cto) | MACF Role: Chief Technology Officer
// Technical architecture, engineering decisions, transkrybe build oversight,
// code review, infrastructure, GitHub activity, and AI/ML strategy.
// Memory: isolated to cto namespace.

const cron = require('node-cron');
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport } = require('../utils/anthropic');
const { resolveChannel: _resolveChannel } = require('../utils/channels');
const { relay, stripDelegations } = require('../utils/delegation');

const AGENT = AGENTS.cto;
const AGENT_ID = AGENT.id; // 'cto'

let slackClient = null;

async function resolveChannel(name) {
  return _resolveChannel(slackClient, name);
}

async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) { console.warn(`[cto] Channel not found: #${channelName}`); return; }
  try {
    await slackClient.chat.postMessage({
      channel: channelId, text,
      username: AGENT.slackName, icon_emoji: AGENT.icon, unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[cto] ✅ Posted to #${channelName}`);
  } catch (err) {
    console.error(`[cto] Error posting to #${channelName}:`, err.message);
  }
}

// ─── Weekly tech status ───────────────────────────────────────────────────────
async function postWeeklyTechStatus() {
  const thisWeek = `${new Date().getFullYear()}-W${Math.ceil(new Date().getDate() / 7)}`;
  if (state.get(AGENT_ID, 'lastWeeklyStatus') === thisWeek) return;

  console.log('[cto] Generating weekly tech status...');
  const githubActivity = state.get(AGENT_ID, 'githubActivity') || {};
  const blockers = state.get(AGENT_ID, 'technicalBlockers') || [];

  const context = `
Weekly technical status for Jesse Stay's transkrybe.com project.

Stack: Next.js frontend, Modal/Python backend for AI transcription. GitHub: jessestay/transkrybe.

Known GitHub activity: ${JSON.stringify(githubActivity, null, 2) || 'No recent activity tracked'}
Known technical blockers: ${JSON.stringify(blockers, null, 2) || 'None logged'}

Write a brief weekly tech status covering:
1. Where the build actually stands — what's shipped, what's in progress, what's blocked
2. The one or two highest-priority technical decisions Jesse needs to make this week
3. Any infrastructure or dependency risks worth flagging (Modal costs, API limits, Next.js upgrades, etc.)
4. One concrete thing Jesse could do in the next 48 hours to unblock the most progress

Keep it short. This is a weekly pulse, not a full sprint review.
  `.trim();

  const brief = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1200 });
  await postToChannel(AGENT.primaryChannel, brief);
  state.set(AGENT_ID, 'lastWeeklyStatus', thisWeek);
}

// ─── Handle @mention ──────────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    await say("CTO here. What's the technical question?");
    return;
  }

  console.log(`[cto] Handling mention: "${text.slice(0, 80)}"`);
  const threadCtx = event.threadContext || '';

  const githubActivity = state.get(AGENT_ID, 'githubActivity') || {};
  const context = `
Jesse asked: "${text}"${threadCtx}
Known GitHub activity: ${JSON.stringify(githubActivity, null, 2)}

Respond as CTO. Be direct about trade-offs. If there's a cleaner architectural path, say so — but also flag the cost in time and complexity. Don't over-engineer. Transkrybe is early-stage; shipping matters more than perfection right now.
  `.trim();

  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await relay(response, AGENT_ID);
  await say(stripDelegations(response));
  state.updateChannelActivity(AGENT.primaryChannel);
}

// ─── Handle delegation ────────────────────────────────────────────────────────
async function handleDelegation(messageText, visitedAgents = new Set(), channelId = null) {
  const match = messageText.match(/\[from:\s*(.+?)\s*→\s*CTO\]\s*(.+)/si);
  if (!match) return false;

  const fromAgent = match[1].trim();
  const request = match[2].trim();
  console.log(`[cto] Delegation from ${fromAgent}: ${request.slice(0, 80)}`);

  state.push(AGENT_ID, 'delegationLog', {
    from: fromAgent, request: request.slice(0, 200), timestamp: new Date().toISOString()
  });

  const context = `Technical request from ${fromAgent}: "${request}"\nProvide a clear technical assessment: current state, recommended approach, estimated complexity (days/weeks), and any risks.`;
  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1200 });
  await relay(response, AGENT_ID, visitedAgents, channelId);
  await postToChannel(AGENT.primaryChannel, stripDelegations(response));
  return true;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[cto] 🖥️  CTO initialized');

  // Weekly tech status — Mondays at 9am MT (15:00 UTC)
  cron.schedule('0 15 * * 1', () =>
    postWeeklyTechStatus().catch(err => console.error('[cto] Weekly status error:', err))
  );
}

module.exports = { init, handleMention, handleDelegation, postWeeklyTechStatus };
