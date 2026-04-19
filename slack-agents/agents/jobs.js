// agents/jobs.js — Jobs Agent 💼
// Searches for Director+ remote roles matching Jesse's ICP every 6 hours
// Posts weekly pipeline status on Fridays

const cron = require('node-cron');
const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport, generateProactivePost, chat } = require('../utils/anthropic');

const AGENT = AGENTS.jobs;

// Jesse's ICP for roles
const JOB_ICP = {
  levels: ['Director', 'VP', 'SVP', 'Head of', 'Chief', 'C-suite', 'Senior Director'],
  categories: ['Social Media', 'Marketing', 'Growth', 'Community', 'Developer Relations', 'DevRel', 'Brand', 'AI', 'Communications', 'Content'],
  types: ['Remote', 'Full Remote', 'Remote-First'],
  companySizes: ['Series A+', 'Mid-market', 'Enterprise', 'Nonprofit'],
};

// Job boards to query (via web search since no official API)
const JOB_SEARCH_QUERIES = [
  'Director Social Media remote 2024 site:wellfound.com',
  'VP Marketing remote AI company site:linkedin.com/jobs',
  'Head of Community remote tech startup site:lever.co OR site:greenhouse.io',
  'Director Developer Relations remote site:boards.greenhouse.io',
  '"Head of Social" OR "VP Social" remote job posting',
  'Director Community remote site:wellfound.com',
];

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
    console.error('[jobs] Could not resolve channel:', name, err.message);
    return null;
  }
}

async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) {
    console.warn(`[jobs] Could not find channel: ${channelName}`);
    return;
  }
  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      text: `${AGENT.emoji} *Jobs* | ${text}`,
      unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[jobs] Posted to #${channelName}`);
  } catch (err) {
    console.error(`[jobs] Error posting to #${channelName}:`, err.message);
  }
}

// ─── Job search (every 6 hours) ───────────────────────────────────────────────
async function searchForJobs() {
  console.log('[jobs] Searching for job opportunities...');
  state.set('jobs.lastSearched', new Date().toISOString());

  // Use Claude to generate a curated list of job search results
  // In production, you'd integrate with LinkedIn Jobs API, Indeed API, or Wellfound API
  // Here we use Claude's knowledge + web search simulation

  const context = `
Jesse Stay is looking for a new Director+ remote role. His ICP:
- Level: Director, VP, SVP, Head of, C-suite
- Categories: Social Media, Marketing, Growth, Community, Developer Relations, AI, Brand, Communications
- Must be: Remote or Remote-First
- Company types: Series A+ startups, tech companies, nonprofits with mission alignment
- Compensation target: $150K-$250K+

Jesse's background:
- Social media expert with 20+ years experience
- Former social media expert at major tech companies
- Founder of transkrybe.com (music transcription SaaS)
- 338K Facebook followers, 114.7K Twitter followers
- Strong in: community building, developer relations, social media strategy, AI products

Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}

Based on current job market trends for these roles (as of early 2026):
1. Identify 3-5 specific types of roles that are currently in demand and would be excellent matches
2. For each, suggest where Jesse would typically find them (specific job boards, company types, or known companies actively hiring)
3. Flag any time-sensitive opportunities or market trends

Then provide 2-3 specific search strategies Jesse should try this week.
  `.trim();

  const findings = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1200 });

  const seenIds = state.get('jobs.seenPostingIds') || [];
  // Add timestamp as a "seen" marker to avoid re-posting for 6h
  const searchId = `search-${Date.now()}`;
  if (seenIds.includes(searchId)) return;

  await postToChannel(AGENT.channel, `*🔎 Job Search Update*\n${findings}`);

  seenIds.push(searchId);
  // Keep only last 100 seen IDs
  state.set('jobs.seenPostingIds', seenIds.slice(-100));
}

// ─── Weekly pipeline status (Fridays 3pm MT = 21:00 UTC) ─────────────────────
async function postWeeklyPipelineStatus() {
  console.log('[jobs] Generating weekly pipeline status...');

  const lastWeeklyReport = state.get('jobs.lastWeeklyReport');
  const thisWeek = getISOWeek();
  if (lastWeeklyReport === thisWeek) {
    console.log('[jobs] Weekly pipeline already posted this week, skipping.');
    return;
  }

  const lastSearched = state.get('jobs.lastSearched');
  const seenCount = (state.get('jobs.seenPostingIds') || []).length;

  const context = `
Weekly job pipeline status report for Jesse Stay.

Search activity this week:
- Last searched: ${lastSearched ? new Date(lastSearched).toLocaleDateString() : 'Not yet this week'}
- Searches run: ~${Math.min(4, seenCount)} searches this week

Provide a Friday pipeline status that includes:
1. Summary of what roles are hot right now (based on your knowledge of the current market)
2. 2-3 specific companies Jesse should look at this weekend
3. One outreach strategy to try next week
4. A motivational but realistic note about the job search process

Keep it practical and actionable. Jesse is actively looking.
  `.trim();

  const status = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 800 });
  await postToChannel(AGENT.channel, `*📊 Weekly Pipeline Status*\n${status}`);

  state.set('jobs.lastWeeklyReport', thisWeek);
}

// ─── Immediate opportunity alert ─────────────────────────────────────────────
async function alertExceptionalOpportunity(role) {
  const text = `🚨 *Exceptional Opportunity Alert*\n\n*${role.title}* at ${role.company}\n💰 ${role.salary || 'Competitive'} | 🌎 ${role.location}\n\n${role.why}\n\n🔗 ${role.url}\n\n_Deadline: ${role.deadline || 'ASAP'}_`;
  await postToChannel(AGENT.channel, text);
}

// ─── Respond to @mentions ────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) return;

  const response = await generateReport({
    systemPrompt: AGENT.systemPrompt,
    context: `Jesse asked about jobs: "${text}"\n\nLast job search: ${state.get('jobs.lastSearched') || 'never'}\n\nProvide helpful, specific job search advice or answer the question directly.`,
  });

  await say(`${AGENT.emoji} *Jobs* | ${response}`);
  state.updateChannelActivity(AGENT.channel);
}

// ─── Handle delegation ───────────────────────────────────────────────────────
async function handleDelegation(message, channelName) {
  const delegationMatch = message.match(/\[from: (\w[\w\s]+) → Jobs\] (.+)/s);
  if (!delegationMatch) return false;

  const fromAgent = delegationMatch[1];
  const request = delegationMatch[2].trim();
  console.log(`[jobs] Delegation from ${fromAgent}:`, request);

  const response = await generateReport({
    systemPrompt: AGENT.systemPrompt,
    context: `Delegation request from ${fromAgent} agent:\n${request}`,
  });

  await postToChannel(AGENT.channel, `[from: Jobs → ${fromAgent}] ${response}`);
  return true;
}

function getISOWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week}`;
}

// ─── Init ────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[jobs] Agent initialized');

  // Job search every 6 hours
  cron.schedule('0 */6 * * *', () => searchForJobs().catch(err => console.error('[jobs] Search error:', err)));

  // Weekly pipeline status — Fridays 3pm MT (21:00 UTC)
  cron.schedule('0 21 * * 5', () => postWeeklyPipelineStatus().catch(err => console.error('[jobs] Weekly status error:', err)));

  // Initial search on startup (with delay)
  setTimeout(() => {
    searchForJobs().catch(err => console.error('[jobs] Initial search error:', err));
  }, 45000);
}

module.exports = { init, handleMention, handleDelegation, searchForJobs };
