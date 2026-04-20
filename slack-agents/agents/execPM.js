// agents/execPM.js — Exec PM (@exec-pm) | MACF Role: Executive Secretary (ES)
// Ryan Holiday growth-hacker persona. Coordinates ALL agents. Present in EVERY channel.
// Memory: isolated to execPM namespace. Cannot read other agents' memory directly.

const cron = require('node-cron');
const { AGENTS, CHANNELS, ALL_CHANNELS, DELEGATION_TARGETS } = require('../config');
const state = require('../utils/state');
const { generateReport, generateProactivePost } = require('../utils/anthropic');
const { fetchDonationTotal } = require('../utils/gofundme');
const { getLatestCommit, getRecentlyMergedPRs } = require('../utils/github');
const { resolveChannel: _resolveChannel } = require('../utils/channels');
const { relay } = require('../utils/delegation');

const AGENT = AGENTS.execPM;
const AGENT_ID = AGENT.id; // 'execPM'

let slackClient = null;

// ─── Channel resolution ───────────────────────────────────────────────────────
async function resolveChannel(name) {
  return _resolveChannel(slackClient, name);
}

// ─── Post as this agent persona ───────────────────────────────────────────────
async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) {
    console.warn(`[execPM] Channel not found: #${channelName}`);
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
    console.log(`[execPM] ✅ Posted to #${channelName}`);
  } catch (err) {
    console.error(`[execPM] Error posting to #${channelName}:`, err.message);
  }
}

// ─── Morning Briefing (8am MT = 14:00 UTC) ───────────────────────────────────
async function runMorningBriefing() {
  const today = new Date().toDateString();
  const lastBriefing = state.get(AGENT_ID, 'lastMorningBriefing');
  if (lastBriefing === today) {
    console.log('[execPM] Morning briefing already sent today, skipping.');
    return;
  }

  console.log('[execPM] Running morning briefing...');

  const [donationResult, commitResult, prsResult] = await Promise.allSettled([
    fetchDonationTotal(),
    getLatestCommit(),
    getRecentlyMergedPRs(),
  ]);

  const donation  = donationResult.status  === 'fulfilled' ? donationResult.value  : null;
  const commit    = commitResult.status    === 'fulfilled' ? commitResult.value    : null;
  const prs       = prsResult.status       === 'fulfilled' ? prsResult.value       : [];

  const context = `
Morning briefing for Jesse Stay — ${new Date().toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Denver'
})} MT

GoFundMe: ${donation ? `$${donation.amount} raised of $2,800 (${donation.percentFunded}%)` : 'unavailable'}
Latest transkrybe commit: ${commit ? `${commit.sha} — "${commit.message}" by ${commit.author}` : 'unavailable'}
Merged PRs in last 24h: ${prs.length > 0 ? prs.map(p => `#${p.number} "${p.title}"`).join(', ') : 'None'}

Write a morning briefing. Talk like you're catching Jesse up at the start of the day — conversational, direct, no headers or bullets. Just tell him what he needs to know and what needs his attention. Flag anything urgent.
  `.trim();

  const text = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  await postToChannel(AGENT.primaryChannel, text);

  state.set(AGENT_ID, 'lastMorningBriefing', today);
  state.set(AGENT_ID, 'lastHealthCheck', new Date().toISOString());

  // Update our cached donation amount
  if (donation) state.set(AGENT_ID, 'knownDonationAmount', donation.amount);
  if (commit) state.set(AGENT_ID, 'knownCommitSha', commit.fullSha);
}

// ─── Project Health Check (every 2 hours) ────────────────────────────────────
async function runHealthCheck() {
  console.log('[execPM] Running health check...');

  // Detect idle channels
  const idleChannels = [];
  for (const channel of ALL_CHANNELS) {
    const idleMin = state.getChannelIdleMinutes(channel);
    if (idleMin > 120 && idleMin < Infinity) {
      idleChannels.push({ channel, idleMin: Math.round(idleMin) });
    }
  }

  // Check for new GoFundMe donations
  const donation = await fetchDonationTotal().catch(() => null);
  const knownAmount = state.get(AGENT_ID, 'knownDonationAmount') || 0;
  let donationAlert = null;
  if (donation) {
    if (knownAmount > 0 && donation.amount !== knownAmount) {
      donationAlert = donation;
    }
    state.set(AGENT_ID, 'knownDonationAmount', donation.amount);
  }

  // Check for new GitHub commits
  const commit = await getLatestCommit().catch(() => null);
  const knownSha = state.get(AGENT_ID, 'knownCommitSha');
  let newCommit = null;
  if (commit && commit.fullSha !== knownSha) {
    newCommit = commit;
    state.set(AGENT_ID, 'knownCommitSha', commit.fullSha);
  }

  const alerts = [];
  if (idleChannels.length > 0) {
    alerts.push(`*⏱️ Idle channels (>2hrs):* ${idleChannels.map(c => `#${c.channel} (${c.idleMin}min)`).join(', ')}`);
  }
  if (donationAlert) {
    const delta = donationAlert.amount - knownAmount;
    alerts.push(`*💚 GoFundMe:* $${knownAmount} → $${donationAlert.amount} (+$${delta.toFixed(2)}) | ${donationAlert.percentFunded}% of goal`);
    // Notify CMO
    await postToChannel(CHANNELS.marketing,
      `${AGENT.emoji} *[from: Exec PM → CMO]* GoFundMe donation detected: +$${delta.toFixed(2)} → now $${donationAlert.amount} raised. Please generate an engagement update.`
    );
  }
  if (newCommit) {
    alerts.push(`*🔀 New transkrybe commit:* \`${newCommit.sha}\` — "${newCommit.message}" by ${newCommit.author}`);
    // Notify #it channel
    await postToChannel(CHANNELS.it,
      `${AGENT.emoji} *[from: Exec PM → IT]* New commit: \`${newCommit.sha}\` — ${newCommit.message}\n👤 ${newCommit.author} · ${new Date(newCommit.date).toLocaleString('en-US', { timeZone: 'America/Denver' })} MT\n${newCommit.url}`
    );
  }

  if (alerts.length > 0) {
    await postToChannel(AGENT.primaryChannel, alerts.join('\n'));
  } else {
    console.log('[execPM] Health check clean — nothing to report.');
  }

  state.set(AGENT_ID, 'lastHealthCheck', new Date().toISOString());
}

// ─── Handle @mention ──────────────────────────────────────────────────────────
async function handleMention({ event, say, client }) {
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    await say("I'm here. What do you need, Jesse?");
    return;
  }

  console.log(`[execPM] Handling mention: "${text.slice(0, 80)}"`);

  const context = `
Jesse asked: "${text}"

My current state:
- Last health check: ${state.get(AGENT_ID, 'lastHealthCheck') || 'never'}
- GoFundMe (last known): $${state.get(AGENT_ID, 'knownDonationAmount') || 0} raised
- Last transkrybe commit I saw: ${state.get(AGENT_ID, 'knownCommitSha') || 'unknown'}

I am Jesse's single point of contact on this team. Handle his request directly and completely. If I need something from another agent (CMO, CRO, CCO, CFO, Lawyer, Job Coach, CUXO), delegate using [from: Exec PM → AgentName] format and handle the routing myself. Never tell Jesse to go talk to another agent — I aggregate and bring results back to him.
  `.trim();

  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  await say(response);
  state.updateChannelActivity(event.channel || AGENT.primaryChannel);
  await relay(response, AGENT_ID);
}

// ─── Handle delegation from other agents ─────────────────────────────────────
async function handleDelegation(messageText, visitedAgents = new Set()) {
  // Match: [from: {anyone} → Exec PM] {request}
  const match = messageText.match(/\[from:\s*(.+?)\s*→\s*Exec\s*PM\]\s*(.+)/si);
  if (!match) return false;

  const fromAgent = match[1].trim();
  const request = match[2].trim();
  console.log(`[execPM] Delegation from ${fromAgent}: ${request.slice(0, 80)}`);

  const context = `Delegation request from ${fromAgent}:\n${request}`;
  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  await postToChannel(AGENT.primaryChannel, `[from: Exec PM → ${fromAgent}] ${response}`);
  await relay(response, AGENT_ID, visitedAgents);
  return true;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[execPM] 🔵 Executive Secretary initialized');

  // Morning briefing: 8am MT = 14:00 UTC (winter) / 15:00 UTC (summer/MDT)
  cron.schedule('0 14 * * *', () =>
    runMorningBriefing().catch(err => console.error('[execPM] Morning briefing error:', err))
  );

  // Health check every 2 hours
  cron.schedule('0 */2 * * *', () =>
    runHealthCheck().catch(err => console.error('[execPM] Health check error:', err))
  );

  // Startup health check (30s delay for Slack to connect)
  setTimeout(() => {
    runHealthCheck().catch(err => console.error('[execPM] Startup health check error:', err));
  }, 30_000);
}

module.exports = { init, handleMention, handleDelegation, runMorningBriefing, runHealthCheck };
