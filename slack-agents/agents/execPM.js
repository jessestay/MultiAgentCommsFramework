// agents/execPM.js — Exec PM Agent 📋
// Proactively monitors all channels, runs health checks, posts morning briefings

const cron = require('node-cron');
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport, generateProactivePost } = require('../utils/anthropic');
const { fetchDonationTotal } = require('../utils/gofundme');
const { getLatestCommit, getRecentlyMergedPRs } = require('../utils/github');

const AGENT = AGENTS.execPM;

// Channels to monitor for idle detection
const MONITORED_CHANNELS = Object.values(CHANNELS);
const IDLE_THRESHOLD_MINUTES = 120; // 2 hours

let slackClient = null;
let channelIdMap = {}; // name -> id

async function resolveChannel(name) {
  if (channelIdMap[name]) return channelIdMap[name];
  try {
    const result = await slackClient.conversations.list({ types: 'public_channel,private_channel', limit: 200 });
    for (const ch of result.channels) {
      channelIdMap[ch.name] = ch.id;
    }
    return channelIdMap[name];
  } catch (err) {
    console.error('[execPM] Could not resolve channel:', name, err.message);
    return null;
  }
}

async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) {
    console.warn(`[execPM] Could not find channel: ${channelName}`);
    return;
  }
  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      text: `${AGENT.emoji} *Exec PM* | ${text}`,
      unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[execPM] Posted to #${channelName}`);
  } catch (err) {
    console.error(`[execPM] Error posting to #${channelName}:`, err.message);
  }
}

// ─── Morning Briefing (8am MT = 14:00 UTC) ───────────────────────────────────
async function runMorningBriefing() {
  console.log('[execPM] Running morning briefing...');
  const lastBriefing = state.get('execPM.lastMorningBriefing');
  const today = new Date().toDateString();
  if (lastBriefing === today) {
    console.log('[execPM] Morning briefing already sent today, skipping.');
    return;
  }

  // Gather data
  const [donationData, latestCommit, mergedPRs] = await Promise.allSettled([
    fetchDonationTotal(),
    getLatestCommit(),
    getRecentlyMergedPRs(),
  ]);

  const donation = donationData.status === 'fulfilled' ? donationData.value : null;
  const commit = latestCommit.status === 'fulfilled' ? latestCommit.value : null;
  const prs = mergedPRs.status === 'fulfilled' ? mergedPRs.value : [];

  const context = `
Good morning briefing for Jesse Stay — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Denver' })} MT

GoFundMe status: ${donation ? `$${donation.amount} raised of $2,800 (${donation.percentFunded}%)` : 'Could not fetch'}
Latest transkrybe commit: ${commit ? `${commit.sha} — "${commit.message}" by ${commit.author} at ${new Date(commit.date).toLocaleString('en-US', { timeZone: 'America/Denver' })} MT` : 'Could not fetch'}
Merged PRs (24h): ${prs.length > 0 ? prs.map(p => `#${p.number} "${p.title}"`).join(', ') : 'None'}

Content pending Jesse approval: ${(state.get('content.pendingApprovals') || []).length} items
Active job leads being tracked: Yes

Write a morning briefing message for Jesse. Be direct, concise, and human. Flag anything that needs his attention today.
  `.trim();

  const text = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  await postToChannel(AGENT.channel, `*🌅 Morning Briefing*\n${text}`);

  state.set('execPM.lastMorningBriefing', today);
  state.set('execPM.lastHealthCheck', new Date().toISOString());
}

// ─── Project Health Check (every 2 hours) ───────────────────────────────────
async function runHealthCheck() {
  console.log('[execPM] Running project health check...');

  const idleChannels = [];
  for (const channel of MONITORED_CHANNELS) {
    const idleMinutes = state.getChannelIdleMinutes(channel);
    if (idleMinutes > IDLE_THRESHOLD_MINUTES && idleMinutes < Infinity) {
      idleChannels.push({ channel, idleMinutes: Math.round(idleMinutes) });
    }
  }

  // Check GoFundMe
  const gofundme = await fetchDonationTotal();
  const lastAmount = state.get('gofundme.lastAmount') || 0;
  let donationAlert = null;
  if (gofundme && gofundme.amount !== lastAmount && lastAmount > 0) {
    donationAlert = gofundme;
    state.set('gofundme.lastAmount', gofundme.amount);
  } else if (gofundme && lastAmount === 0) {
    state.set('gofundme.lastAmount', gofundme.amount);
  }

  // Check GitHub
  const commit = await getLatestCommit();
  const lastSha = state.get('github.lastCommitSha');
  let newCommit = null;
  if (commit && commit.fullSha !== lastSha) {
    newCommit = commit;
    state.set('github.lastCommitSha', commit.fullSha);
  }

  // Build alert messages
  const alerts = [];
  if (idleChannels.length > 0) {
    alerts.push(`*Idle channels (>2hrs):* ${idleChannels.map(c => `#${c.channel} (${c.idleMinutes}min)`).join(', ')}`);
  }
  if (donationAlert) {
    alerts.push(`*GoFundMe update:* $${donationAlert.amount} raised (${donationAlert.percentFunded}% of goal)`);
    // Also notify marketing channel
    const mktChannel = await resolveChannel(CHANNELS.marketing);
    if (mktChannel) {
      await slackClient.chat.postMessage({
        channel: mktChannel,
        text: `${AGENTS.marketing.emoji} *Marketing* | 💚 GoFundMe total changed → $${donationAlert.amount} raised of $2,800 (${donationAlert.percentFunded}%)\nhttps://www.gofundme.com/f/help-louis-stay-get-a-wheelchair`,
        unfurl_links: false,
      });
      state.updateChannelActivity(CHANNELS.marketing);
    }
  }
  if (newCommit) {
    alerts.push(`*New transkrybe commit:* \`${newCommit.sha}\` — "${newCommit.message}" by ${newCommit.author}`);
    // Notify transkrybe channel too
    const txChannel = await resolveChannel(CHANNELS.it);
    if (txChannel) {
      await slackClient.chat.postMessage({
        channel: txChannel,
        text: `${AGENTS.transkrybe.emoji} *Transkrybe* | 🔀 New commit: \`${newCommit.sha}\` — ${newCommit.message}\n👤 ${newCommit.author} · ${new Date(newCommit.date).toLocaleString('en-US', { timeZone: 'America/Denver' })} MT\n${newCommit.url}`,
        unfurl_links: false,
      });
      state.updateChannelActivity(CHANNELS.it);
    }
  }

  if (alerts.length > 0) {
    await postToChannel(AGENT.channel, `*🔍 Health Check*\n${alerts.join('\n')}`);
  } else {
    console.log('[execPM] Health check clean — nothing to report.');
  }

  state.set('execPM.lastHealthCheck', new Date().toISOString());
}

// ─── Respond to @mentions ────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) return;

  console.log('[execPM] Handling mention:', text);
  const response = await generateReport({
    systemPrompt: AGENT.systemPrompt,
    context: `Jesse asked: "${text}"\n\nCurrent state:\n- GoFundMe: $${state.get('gofundme.lastAmount')} raised\n- Last GitHub commit SHA: ${state.get('github.lastCommitSha') || 'unknown'}\n- Pending content approvals: ${(state.get('content.pendingApprovals') || []).length}`,
  });

  await say(`${AGENT.emoji} *Exec PM* | ${response}`);
  state.updateChannelActivity(AGENT.channel);
}

// ─── Handle delegation from other agents ─────────────────────────────────────
async function handleDelegation(message, channelName) {
  const delegationMatch = message.match(/\[from: (\w[\w\s]+) → Exec PM\] (.+)/s);
  if (!delegationMatch) return false;

  const fromAgent = delegationMatch[1];
  const request = delegationMatch[2].trim();
  console.log(`[execPM] Delegation from ${fromAgent}:`, request);

  const response = await generateReport({
    systemPrompt: AGENT.systemPrompt,
    context: `Delegation request from ${fromAgent} agent:\n${request}`,
  });

  await postToChannel(AGENT.channel, `[from: Exec PM → ${fromAgent}] ${response}`);
  return true;
}

// ─── Init ────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[execPM] Agent initialized');

  // Morning briefing: 8am MT = 14:00 UTC (15:00 UTC in MDT)
  // Use '0 14 * * *' for MST, '0 15 * * *' for MDT — Railway runs in UTC
  cron.schedule('0 14 * * *', () => runMorningBriefing().catch(err => console.error('[execPM] Morning briefing error:', err)));

  // Project health check every 2 hours
  cron.schedule('0 */2 * * *', () => runHealthCheck().catch(err => console.error('[execPM] Health check error:', err)));

  // Run an immediate health check on startup (with 30s delay to let Slack connect)
  setTimeout(() => {
    runHealthCheck().catch(err => console.error('[execPM] Startup health check error:', err));
  }, 30000);
}

module.exports = { init, handleMention, handleDelegation, runMorningBriefing, runHealthCheck };
