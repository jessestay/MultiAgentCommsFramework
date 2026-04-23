// agents/cro.js — CRO (@cro) | MACF Role: Chief Research Officer
// Surfaces intelligence proactively. Responds to delegation research requests.
// Memory: isolated to cro namespace.

const cron = require('node-cron');
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport } = require('../utils/anthropic');
const { resolveChannel: _resolveChannel } = require('../utils/channels');
const { relay, stripDelegations } = require('../utils/delegation');
const { search: webSearch, browse, formatResults } = require('../utils/search');

const AGENT = AGENTS.cro;
const AGENT_ID = AGENT.id; // 'cro'

let slackClient = null;

async function resolveChannel(name) {
  return _resolveChannel(slackClient, name);
}

async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) { console.warn(`[cro] Channel not found: #${channelName}`); return; }
  try {
    await slackClient.chat.postMessage({
      channel: channelId, text,
      username: AGENT.slackName, icon_emoji: AGENT.icon, unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[cro] ✅ Posted to #${channelName}`);
  } catch (err) {
    console.error(`[cro] Error posting to #${channelName}:`, err.message);
  }
}

// ─── Proactive research post (Tues + Fri) ────────────────────────────────────
async function postProactiveResearch() {
  const lastPost = state.get(AGENT_ID, 'lastProactivePost');
  const today = new Date().toDateString();
  if (lastPost === today) {
    console.log('[cro] Research already posted today, skipping.');
    return;
  }

  console.log('[cro] Generating proactive research post...');
  const seenTopics = state.get(AGENT_ID, 'seenTopics') || [];

  const topicPool = [
    'Fundraising growth tactics for active campaigns (load campaign details from project context JSON)',
    'transkrybe competitors — music transcription tools landscape in 2026',
    'Accessibility and disability advocacy content Jesse could amplify (load specific campaign context from project context JSON)',
    'Social media algorithm changes affecting Facebook and Twitter/X reach in 2026',
    'AI tools for music and audio that transkrybe should watch or partner with',
    'Remote executive hiring trends — what companies are looking for in 2026',
    'Accessibility tech and disability advocacy momentum Jesse could ride',
    'Creator economy monetization strategies for 100K+ follower accounts',
  ];

  // Pick a topic Jesse hasn't heard about recently
  const freshTopics = topicPool.filter(t => !seenTopics.includes(t));
  const topic = freshTopics.length > 0
    ? freshTopics[Math.floor(Math.random() * freshTopics.length)]
    : topicPool[Math.floor(Math.random() * topicPool.length)];

  const context = `
Research topic: ${topic}
Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}

Write a research brief for Jesse Stay. Be an intelligence analyst — surface what matters NOW, not generic background.

Format:
*📊 Research Brief — [Topic]*
• [Key finding 1] — specific, recent, citable if possible
• [Key finding 2]
• [Key finding 3]
*💡 Strategic implications for Jesse:*
• [What this means for his GoFundMe / transkrybe / personal brand]
*⚡ Recommended actions:*
• [1-2 concrete actions Jesse could take this week]

Be specific. Cite real examples, real numbers, real trends where possible.
  `.trim();

  const research = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1200 });
  await postToChannel(AGENT.primaryChannel, research);

  state.push(AGENT_ID, 'seenTopics', topic, 20);
  state.set(AGENT_ID, 'lastProactivePost', today);
  state.push(AGENT_ID, 'researchLog', { topic, timestamp: new Date().toISOString() });
}

// ─── Handle @mention ──────────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    await say("CRO here. What do you need me to research?");
    return;
  }

  const threadCtx = event.threadContext || '';
  console.log(`[cro] Handling mention: "${text.slice(0, 80)}"`);
  // Try live web search first for better research quality
  const searchResults = await webSearch(text, 5);
  const searchCtx = searchResults
    ? `\n\nLive search results:\n${formatResults(searchResults)}`
    : '';

  const context = `Jesse asked for research on: "${text}"${threadCtx}${searchCtx}\nProvide findings, what they mean, and what Jesse should do with them.`;
  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await relay(response, AGENT_ID);
  await say(stripDelegations(response));
  state.updateChannelActivity(AGENT.primaryChannel);
}

// ─── Handle delegation ────────────────────────────────────────────────────────
async function handleDelegation(messageText, visitedAgents = new Set(), channelId = null) {
  const match = messageText.match(/\[from:\s*(.+?)\s*→\s*CRO\]\s*(.+)/si);
  if (!match) return false;

  const fromAgent = match[1].trim();
  const request = match[2].trim();
  console.log(`[cro] Delegation from ${fromAgent}: ${request.slice(0, 80)}`);

  state.push(AGENT_ID, 'delegationLog', {
    from: fromAgent, request: request.slice(0, 200), timestamp: new Date().toISOString()
  });
  state.push(AGENT_ID, 'researchLog', { topic: request.slice(0, 100), from: fromAgent, timestamp: new Date().toISOString() });

  // Try live search for delegation research requests too
  const searchResults = await webSearch(request, 5);
  const searchCtx = searchResults
    ? `\n\nLive search results:\n${formatResults(searchResults)}`
    : '';

  const context = `Research request from ${fromAgent}:\n"${request}"${searchCtx}\n\nProvide a focused research brief addressing this specific request. Include sources where possible.`;
  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });

  // Respond in the research channel and tag the requesting agent
  await relay(response, AGENT_ID, visitedAgents, channelId);
  await postToChannel(AGENT.primaryChannel, `[from: CRO → ${fromAgent}] ${stripDelegations(response)}`);
  return true;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[cro] 🔍 Chief Research Officer initialized');

  // Proactive research — Tuesdays and Fridays at 11am MT (17:00 UTC)
  cron.schedule('0 17 * * 2,5', () =>
    postProactiveResearch().catch(err => console.error('[cro] Research post error:', err))
  );
}

module.exports = { init, handleMention, handleDelegation, postProactiveResearch };
