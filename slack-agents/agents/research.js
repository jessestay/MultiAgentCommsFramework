// agents/research.js — Research Agent 🔍
// Proactively surfaces insights. Responds to [from: X → Research] delegations.

const cron = require('node-cron');
const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport, generateProactivePost } = require('../utils/anthropic');

const AGENT = AGENTS.research;

// Research topics to rotate through
const PROACTIVE_TOPICS = [
  {
    topic: 'GoFundMe growth tactics for disability fundraising',
    context: 'Louis Stay has ME/CFS and hEDS and needs a power wheelchair. GoFundMe goal: $2,800, ~$350 raised. What specific tactics drive donations for disability fundraising campaigns?',
    relevantChannel: CHANNELS.marketing,
  },
  {
    topic: 'transkrybe competitors — music transcription tools',
    context: 'transkrybe.com is a music transcription SaaS (Next.js + Modal/Python). Who are the main competitors? What features do they have? Where are the gaps transkrybe can exploit?',
    relevantChannel: CHANNELS.it,
  },
  {
    topic: 'ME/CFS and hEDS awareness — viral content trends',
    context: 'Louis Stay has ME/CFS and hEDS. What content formats are currently driving awareness and engagement for these conditions? What hashtags, creators, or stories are breaking through?',
    relevantChannel: CHANNELS.marketing,
  },
  {
    topic: 'Social media fundraising — best practices for existing large audiences',
    context: 'Jesse has 338K Facebook followers, 114.7K Twitter followers. What are the best strategies for converting existing social audiences into GoFundMe donors? Case studies preferred.',
    relevantChannel: CHANNELS.marketing,
  },
  {
    topic: 'Power wheelchair funding resources — alternatives to GoFundMe',
    context: 'Louis needs a power wheelchair for ME/CFS and hEDS. What grants, nonprofits, Medicaid programs, or other funding sources exist beyond GoFundMe? Jesse needs comprehensive options.',
    relevantChannel: CHANNELS.execPM,
  },
  {
    topic: 'Music transcription SaaS — pricing and positioning trends',
    context: 'transkrybe.com competes in the music transcription space. What pricing models, positioning angles, and GTM strategies are working for niche SaaS tools right now?',
    relevantChannel: CHANNELS.it,
  },
];

let slackClient = null;
let channelIdMap = {};
let topicIndex = 0;

async function resolveChannel(name) {
  if (channelIdMap[name]) return channelIdMap[name];
  try {
    const result = await slackClient.conversations.list({ types: 'public_channel,private_channel', limit: 200 });
    for (const ch of result.channels) {
      channelIdMap[ch.name] = ch.id;
    }
    return channelIdMap[name];
  } catch (err) {
    console.error('[research] Could not resolve channel:', name, err.message);
    return null;
  }
}

async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) {
    console.warn(`[research] Could not find channel: ${channelName}`);
    return;
  }
  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      text: `${AGENT.emoji} *Research* | ${text}`,
      unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[research] Posted to #${channelName}`);
  } catch (err) {
    console.error(`[research] Error posting to #${channelName}:`, err.message);
  }
}

// ─── Proactive research posts (Tues & Fri, 10am MT = 16:00 UTC) ──────────────
async function postProactiveResearch() {
  console.log('[research] Generating proactive research post...');

  const item = PROACTIVE_TOPICS[topicIndex % PROACTIVE_TOPICS.length];
  topicIndex++;

  const seen = state.get('research.seenTopics') || [];
  if (seen.includes(item.topic)) {
    // Skip if we've covered this recently — find next unseen topic
    const unseen = PROACTIVE_TOPICS.find(t => !seen.includes(t.topic));
    if (!unseen) {
      // All covered — reset and start over
      state.set('research.seenTopics', []);
    } else {
      topicIndex = PROACTIVE_TOPICS.indexOf(unseen);
    }
  }

  const prompt = `
Research task: ${item.topic}

Context: ${item.context}

Provide:
1. 3-5 specific, actionable findings (not generic advice)
2. 1-2 concrete examples or case studies if applicable
3. An "Action for Jesse" — the single most useful thing he can do with this information this week

Format for Slack: Use *bold* for section headers, bullet points for findings. Keep it scannable.
Be specific — cite numbers, examples, or named tools/programs where you can.
  `.trim();

  const findings = await generateReport({ systemPrompt: AGENT.systemPrompt, context: prompt, maxTokens: 1200 });

  // Post to research channel
  await postToChannel(AGENT.channel, `*📚 Proactive Research: ${item.topic}*\n${findings}`);

  // Also cross-post a summary to the relevant channel if different
  if (item.relevantChannel !== CHANNELS.research) {
    const summary = await generateProactivePost({
      systemPrompt: AGENT.systemPrompt,
      context: `Summarize this research finding in 2-3 sentences for the ${item.relevantChannel} channel team:\n${findings}`,
    });
    await postToChannel(item.relevantChannel, `[from: Research → ${item.relevantChannel}] New research available in #research:\n${summary}`);
  }

  state.push('research.seenTopics', item.topic);
  state.set('research.lastProactivePost', new Date().toISOString());
}

// ─── Handle delegation requests from other agents ─────────────────────────────
async function handleDelegation(message, channelName) {
  const delegationMatch = message.match(/\[from: (\w[\w\s]+) → Research\] (.+)/s);
  if (!delegationMatch) return false;

  const fromAgent = delegationMatch[1];
  const request = delegationMatch[2].trim();
  console.log(`[research] Delegation from ${fromAgent}:`, request);

  const context = `
+Research request from the ${fromAgent} agent:
"${request}"

Provide a thorough, specific response with:
1. Direct answer to the question
2. Supporting evidence or examples (3-5 bullets)
3. Recommended next steps for Jesse

Reference Jesse's active projects where relevant:
- GoFundMe: https://www.gofundme.com/f/help-louis-stay-get-a-wheelchair (Louis Stay, ME/CFS + hEDS, needs power wheelchair)
- transkrybe.com (music transcription SaaS)
  `.trim();

  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });

  // Post to research channel first
  await postToChannel(AGENT.channel, `*Research response for ${fromAgent}*\n${response}`);

  // Then cross-post back to the requesting agent's channel
  const fromChannelKey = Object.keys(CHANNELS).find(k => AGENTS[k]?.name === fromAgent);
  if (fromChannelKey) {
    const fromChannelName = CHANNELS[fromChannelKey];
    if (fromChannelName !== CHANNELS.research) {
      await postToChannel(fromChannelName, `[from: Research → ${fromAgent}] ${response}`);
    }
  }

  return true;
}

// ─── Respond to @mentions ────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) return;

  const context = `
Jesse is asking the Research agent: "${text}"

Provide a helpful, specific answer with sources where possible.
Focus on practical, actionable information relevant to Jesse's projects.
  `.trim();

  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context });

  await say(`${AGENT.emoji} *Research* | ${response}`);
  state.updateChannelActivity(AGENT.channel;
}

// ─── Init ────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[research] Agent initialized');

  // Proactive research — Tuesdays and Fridays at 10am MT (16:00 UTC)
  cron.schedule('0 16 * * 2,5', () => postProactiveResearch().catch(err => console.error('[research] Proactive research error:', err)));

  // Extra deep-dive Mondays at 2pm MT (20:00 UTC) — rotating topics
  cron.schedule('0 20 * * 1', () => postProactiveResearch().catch(err => console.error('[research] Monday deep-dive error:', err)));
}

module.exports = { init, handleMention, handleDelegation, postProactiveResearch };
