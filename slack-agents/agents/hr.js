// agents/hr.js — Head of HR (@head-of-hr) | MACF Role: Skill Creator
// Team capability: who the team needs, what skills they need, building those skills.
// Owns the meta-skill function: identifying skill gaps, building new expert skill
// lenses, improving existing ones. Runs a quarterly skills review.
// Memory: isolated to hr namespace.

const cron = require('node-cron');
const { AGENTS } = require('../config');
const state = require('../utils/state');
const { generateReport } = require('../utils/anthropic');
const { resolveChannel: _resolveChannel } = require('../utils/channels');
const { relay, stripDelegations } = require('../utils/delegation');

const AGENT = AGENTS.hr;
const AGENT_ID = AGENT.id; // 'hr'

let slackClient = null;

async function resolveChannel(name) {
  return _resolveChannel(slackClient, name);
}

async function postToChannel(channelName, text, threadTs = null) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) { console.warn(`[hr] Channel not found: #${channelName}`); return; }
  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      ...(threadTs ? { thread_ts: threadTs } : {}), text,
      username: AGENT.slackName, icon_emoji: AGENT.icon, unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[hr] ✅ Posted to #${channelName}`);
  } catch (err) {
    console.error(`[hr] Error posting to #${channelName}:`, err.message);
  }
}

// ─── Quarterly skills review ──────────────────────────────────────────────────
async function postQuarterlySkillsReview() {
  const now = new Date();
  const quarter = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  if (state.get(AGENT_ID, 'lastQuarterlyReview') === quarter) return;

  console.log('[hr] Running quarterly skills review...');
  const skillGaps = state.get(AGENT_ID, 'skillGaps') || [];

  const context = `
Quarterly skills review for Jesse Stay's AI team — ${quarter}.

Known skill gaps logged since last review: ${skillGaps.length > 0 ? skillGaps.map(g => `${g.area}: ${g.description}`).join('; ') : 'None logged'}.

Write a quarterly skills review covering:
1. 🧠 What the team can do now — current capabilities and expert lenses in play
2. 🔍 Gaps — where the team is struggling or a new project needs a capability nobody has
3. 🛠️ What you're building next — new or improved skills planned, with owners

Keep it concrete and brief. This posts in #management for the team.
  `.trim();

  const review = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await postToChannel(AGENT.primaryChannel, review);
  state.set(AGENT_ID, 'lastQuarterlyReview', quarter);
}

// ─── Handle @mention ──────────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    await say("Head of HR here. Skill gaps, new roles, team capabilities — what do you need?");
    return;
  }

  console.log(`[hr] Handling mention: "${text.slice(0, 80)}"`);
  const threadCtx = event.threadContext || '';

  const context = `
Teammate asked: "${text}"${threadCtx}

Respond as the Head of HR and skill creator. If they're describing a repeated struggle, diagnose whether it's a skill gap and say what skill you'd build to fix it. If they need a new capability, outline the skill. Be warm but direct.
  `.trim();

  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await relay(response, AGENT_ID);
  await say(stripDelegations(response));

  // Log anything that looks like a skill gap for the quarterly review
  if (/skill gap|struggl|can't|unable to|need.*skill|new capabilit/i.test(text)) {
    state.push(AGENT_ID, 'skillGaps', {
      area: text.slice(0, 60), description: text.slice(0, 200),
      identified: new Date().toISOString(),
    });
  }

  state.updateChannelActivity(AGENT.primaryChannel);
}

// ─── Handle delegation ────────────────────────────────────────────────────────
async function handleDelegation(messageText, visitedAgents = new Set(), channelId = null, threadTs = null) {
  const match = messageText.match(/\[from:\s*(.+?)\s*→\s*(?:Head of HR|HR)\]\s*(.+)/si);
  if (!match) return false;

  const fromAgent = match[1].trim();
  const request = match[2].trim();
  console.log(`[hr] Delegation from ${fromAgent}: ${request.slice(0, 80)}`);

  state.push(AGENT_ID, 'delegationLog', {
    from: fromAgent, request: request.slice(0, 200), timestamp: new Date().toISOString()
  });

  const context = `
Skill request from ${fromAgent}: "${request}"
Respond as the Head of HR and skill creator. Apply the meta-skill rules: propose your own rules and push back where the request is vague; describe what the skill is for with full context rather than over-scripting behavior; keep it to one specific concern. If the request involves asking Jesse anything, note that it needs its own dedicated handling skill coordinated with Exec PM.
  `.trim();

  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  const subResults = await relay(response, AGENT_ID, visitedAgents, channelId);

  // POLLER IS SOLE POSTER (Oct 4, 2026 — architectural fix):
  // Do NOT post directly. Return the response for the poller to validate and post.
  return {
    completed: true,
    response: `[from: HR → ${fromAgent}] ${stripDelegations(response)}`,
    threadTs: threadTs,
    channel: AGENT.primaryChannel,
    subResults: subResults,
    // EVIDENCE FIX (Oct 6, 2026 — self-healer root-cause): same dead-letter
    // mechanism as CTO/Lawyer — the written HR assessment carried no evidence
    // marker. The assessment IS the deliverable for non-action directives.
    evidence: 'HR assessment generated (LLM report, no tool execution)',
    agentId: AGENT_ID,
    timestamp: new Date().toISOString()
  };
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[hr] 🧑‍💼 Head of HR initialized');

  // Quarterly skills review — 1st of Jan/Apr/Jul/Oct at 10am MT (16:00 UTC)
  cron.schedule('0 16 1 1,4,7,10 *', () =>
    postQuarterlySkillsReview().catch(err => console.error('[hr] Quarterly review error:', err))
  );
}

module.exports = { init, handleMention, handleDelegation, postQuarterlySkillsReview };
