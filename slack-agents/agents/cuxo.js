// agents/cuxo.js — CUXO (@cuxo) | MACF Role: Designer (DES)
// Chief UX Officer. UX reviews, accessibility advocacy, visual design direction.
// Memory: isolated to cuxo namespace.

const cron = require('node-cron');
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport } = require('../utils/anthropic');
const { resolveChannel: _resolveChannel } = require('../utils/channels');
const { relay, stripDelegations } = require('../utils/delegation');

const AGENT = AGENTS.cuxo;
const AGENT_ID = AGENT.id; // 'cuxo'

let slackClient = null;

async function resolveChannel(name) {
  return _resolveChannel(slackClient, name);
}

async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) { console.warn(`[cuxo] Channel not found: #${channelName}`); return; }
  try {
    await slackClient.chat.postMessage({
      channel: channelId, text,
      username: AGENT.slackName, icon_emoji: AGENT.icon, unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[cuxo] ✅ Posted to #${channelName}`);
  } catch (err) {
    console.error(`[cuxo] Error posting to #${channelName}:`, err.message);
  }
}

// ─── Proactive UX insight (Wednesdays) ───────────────────────────────────────
async function postWeeklyUXInsight() {
  console.log('[cuxo] Posting weekly UX insight...');

  const context = `
Write a proactive UX/design insight for Jesse Stay's #marketing channel.
Focus on one of these areas (rotate weekly):
- transkrybe.com UX improvement opportunity
- Accessibility best practice Jesse should apply to his digital presence
- Social media visual design tip for higher engagement
- User research method Jesse could apply to validate transkrybe features

Format:
*🟣 UX Insight — [Topic]*
[Specific, actionable insight — not generic advice]
*Why it matters:* [business or user impact in 1 sentence]
*Action for Jesse:* [concrete next step]

Be specific. No platitudes. Real design thinking.
  `.trim();

  const insight = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 800 });
  await postToChannel(AGENT.primaryChannel, insight);
  state.set(AGENT_ID, 'lastUXReview', new Date().toISOString());
}

// ─── Handle @mention ──────────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    await say("CUXO here. What UX or design challenge can I solve?");
    return;
  }

  console.log(`[cuxo] Handling mention: "${text.slice(0, 80)}"`);
  const threadCtx = event.threadContext || '';

  const context = `
Jesse asked: "${text}"${threadCtx}

Respond as Chief UX Officer. When accessibility is relevant, cite WCAG 2.1 AA (4.5:1 body text contrast, 3:1 large text). Be specific and actionable, not vague.
  `.trim();

  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await relay(response, AGENT_ID);
  await say(stripDelegations(response));
  state.updateChannelActivity(AGENT.primaryChannel);
}

// ─── Handle delegation ────────────────────────────────────────────────────────
async function handleDelegation(messageText, visitedAgents = new Set(), channelId = null) {
  const match = messageText.match(/\[from:\s*(.+?)\s*→\s*CUXO\]\s*(.+)/si);
  if (!match) return false;

  const fromAgent = match[1].trim();
  const request = match[2].trim();
  console.log(`[cuxo] Delegation from ${fromAgent}: ${request.slice(0, 80)}`);

  state.push(AGENT_ID, 'delegationLog', {
    from: fromAgent, request: request.slice(0, 200), timestamp: new Date().toISOString()
  });

  const context = `
Delegation from ${fromAgent}: "${request}"
Respond as CUXO — provide design specifications, UX recommendations, or accessibility guidance.
When giving visual specs, use format: Element | Color (#hex) | Size | Spacing | Contrast ratio
  `.trim();

  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await relay(response, AGENT_ID, visitedAgents, channelId);
  await postToChannel(AGENT.primaryChannel, `[from: CUXO → ${fromAgent}] ${stripDelegations(response)}`);
  return true;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[cuxo] 🟣 Chief UX Officer initialized');

  // Weekly UX insight — Wednesdays at 10am MT (16:00 UTC)
  cron.schedule('0 16 * * 3', () =>
    postWeeklyUXInsight().catch(err => console.error('[cuxo] UX insight error:', err))
  );
}

module.exports = { init, handleMention, handleDelegation, postWeeklyUXInsight };
