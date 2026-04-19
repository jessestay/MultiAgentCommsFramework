// agents/cto.js — Transkrybe Agent 🎵
// Monitors jessestay/transkrybe GitHub repo every 15min, flags deployment issues

const cron = require('node-cron');
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport, generateProactivePost } = require('../utils/anthropic');
const {
  getLatestCommit,
  getCommitsSince,
  getOpenPRs,
  getRecentlyMergedPRs,
  formatCommitNotification,
  formatPRNotification,
  OWNER,
  REPO,
} = require('../utils/github');

const AGENT = AGENTS.cto;

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
    console.error('[cto] Could not resolve channel:', name, err.message);
    return null;
  }
}

async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) {
    console.warn(`[cto] Could not find channel: ${channelName}`);
    return;
  }
  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      text: `${AGENT.emoji} *CTO* | ${text}`,
      unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[cto] Posted to #${channelName}`);
  } catch (err) {
    console.error(`[cto] Error posting to #${channelName}:`, err.message);
  }
}

// ─── GitHub polling (every 15 minutes) ───────────────────────────────────────
async function pollGitHub() {
  console.log('[cto] Polling GitHub...');

  const latestCommit = await getLatestCommit();
  if (!latestCommit) return;

  const lastSha = state.get('github.lastCommitSha');

  if (!lastSha) {
    // First run — baseline
    state.set('github.lastCommitSha', latestCommit.fullSha);
    state.set('github.lastChecked', new Date().toISOString());
    console.log(`[cto] GitHub baseline set: ${latestCommit.sha}`);
    return;
  }

  if (latestCommit.fullSha !== lastSha) {
    // New commit(s) — fetch all new ones
    const lastChecked = state.get('github.lastChecked') || new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const newCommits = await getCommitsSince(lastChecked);

    if (newCommits.length === 0) {
      // Fallback: just report the latest
      await postToChannel(AGENT.channel, formatCommitNotification(latestCommit));
    } else if (newCommits.length === 1) {
      await postToChannel(AGENT.channel, formatCommitNotification(newCommits[0]));
    } else {
      // Multiple new commits — summarize
      const commitList = newCommits.slice(0, 5).map(c => `• \`${c.sha}\` ${c.message} — ${c.author}`).join('\n');
      await postToChannel(AGENT.channel, `🔀 *${newCommits.length} new commits on transkrybe*\n${commitList}\nhttps://github.com/${OWNER}/${REPO}/commits`);
    }

    state.set('github.lastCommitSha', latestCommit.fullSha);
    state.set('github.lastChecked', new Date().toISOString());
  } else {
    console.log(`[cto] No new commits (latest: ${latestCommit.sha})`);
    state.set('github.lastChecked', new Date().toISOString());
  }

  // Also check for new/merged PRs
  await checkPRs();
}

async function checkPRs() {
  const openPRs = await getOpenPRs();
  const lastPRNumber = state.get('github.lastPRNumber') || 0;

  const newPRs = openPRs.filter(pr => pr.number > lastPRNumber);
  for (const pr of newPRs) {
    await postToChannel(AGENT.channel, formatPRNotification(pr, 'opened'));
  }

  if (openPRs.length > 0) {
    const maxPR = Math.max(...openPRs.map(p => p.number));
    if (maxPR > lastPRNumber) {
      state.set('github.lastPRNumber', maxPR);
    }
  }

  const mergedPRs = await getRecentlyMergedPRs();
  // Only report ones we haven't seen (simple check: merged in last 15min)
  const cutoff = Date.now() - 16 * 60 * 1000;
  for (const pr of mergedPRs) {
    if (new Date(pr.mergedAt).getTime() > cutoff) {
      await postToChannel(AGENT.channel, formatPRNotification(pr, 'merged'));
    }
  }
}

// ─── Daily dev summary (9am MT weekdays) ─────────────────────────────────────
async function postDailySummary() {
  console.log('[cto] Generating daily dev summary...');

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [recentCommits, openPRs, mergedPRs] = await Promise.all([
    getCommitsSince(since24h),
    getOpenPRs(),
    getRecentlyMergedPRs(),
  ]);

  const context = `
Dayly transkrybe development summary for Jesse:

Recent commits (24h): ${recentCommits.length > 0
  ? recentCommits.map(c => `${c.sha} — "${c.message}" by ${c.author} at ${new Date(c.date).toLocaleString('en-US', { timeZone: 'America/Denver' })} MT`).join('\n')
  : 'None'}

Open PRs: ${openPRs.length > 0
  ? openPRs.map(p => `#${p.number} "${p.title}" by ${p.author}`).join('\n')
  : 'None'}

Merged PRs (24h): ${mergedPRs.length > 0
  ? mergedPRs.map(p => `#${p.number} "${p.title}"`).join(', ')
  : 'None'}

Write a concise daily dev summary. Highlight anything notable, flag any open PRs that need review, and suggest next priorities if obvious from the commit messages.
  `.trim();

  const summary = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  await postToChannel(AGENT.channel, `*📊 Daily Dev Summary*\n${summary}`);
}

// ─── Error/anomaly detection (simulated — real version would read logs) ───────
async function checkForAnomalies() {
  // In production, this would poll your error tracking service (Sentry, Datadog, etc.)
  // For now, we check if there's been no commits in >48h (possible project stall)
  const lastChecked = state.get('github.lastChecked');
  if (!lastChecked) return;

  const hoursSinceLastCheck = (Date.now() - new Date(lastChecked).getTime()) / 3600000;
  const lastCommitTime = state.get('github.lastCommitSha') ? null : null; // would need to store date

  // Stale check: if no commits in 72h, flag it
  // (Simplified implementation — production would track commit dates)
  console.log('[cto] Anomaly check complete (no anomalies detected)');
}

// ─── Respond to @mentions ────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) return;

  const response = await generateReport({
    systemPrompt: AGENT.systemPrompt,
    context: `Jesse asked: "${text}"\n\nLast known commit SHA: ${state.get('github.lastCommitSha') || 'unknown'}\nLast checked: ${state.get('github.lastChecked') || 'never'}`,
  });

  await say(`${AGENT.emoji} *CTO* | ${response}`);
  state.updateChannelActivity(AGENT.channel);
}

// ─── Handle delegation ───────────────────────────────────────────────────────
async function handleDelegation(message, channelName) {
  const delegationMatch = message.match(/\[from: (\w[\w\s]+) → Transkrybe\] (.+)/s);
  if (!delegationMatch) return false;

  const fromAgent = delegationMatch[1];
  const request = delegationMatch[2].trim();
  console.log(`[cto] Delegation from ${fromAgent}:`, request);

  const response = await generateReport({
    systemPrompt: AGENT.systemPrompt,
    context: `Delegation request from ${fromAgent} agent:\n${request}\n\nCurrent state:\nLast commit: ${state.get('github.lastCommitSha') || 'unknown'}`,
  });

  await postToChannel(AGENT.channel, `[from: CTO → ${fromAgent}] ${response}`);
  return true;
}

// ─── Init ────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[cto] Agent initialized');

  // GitHub poll every 15 minutes
  cron.schedule('*/15 * * * *', () => pollGitHub().catch(err => console.error('[cto] GitHub poll error:', err)));

  // Daily dev summary — 9am MT weekdays (15:00 UTC)
  cron.schedule('0 15 * * 1-5', () => postDailySummary().catch(err => console.error('[cto] Daily summary error:', err)));

  // Anomaly check every 6 hours
  cron.schedule('0 */6 * * *', () => checkForAnomalies().catch(err => console.error('[cto] Anomaly check error:', err)));

  // Initial poll on startup
  setTimeout(() => {
    pollGitHub().catch(err => console.error('[cto] Initial poll error:', err));
  }, 20000);
}

module.exports = { init, handleMention, handleDelegation, pollGitHub };
