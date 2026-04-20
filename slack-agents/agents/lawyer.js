// agents/lawyer.js — Lawyer (@lawyer) | MACF Role: Elite Business Lawyer (EBL)
// Legal strategy, contract review, compliance monitoring, IP protection.
// Memory: isolated to lawyer namespace.

const cron = require('node-cron');
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport } = require('../utils/anthropic');
const { resolveChannel: _resolveChannel } = require('../utils/channels');

const AGENT = AGENTS.lawyer;
const AGENT_ID = AGENT.id; // 'lawyer'

let slackClient = null;

async function resolveChannel(name) {
  return _resolveChannel(slackClient, name);
}

async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) { console.warn(`[lawyer] Channel not found: #${channelName}`); return; }
  try {
    await slackClient.chat.postMessage({
      channel: channelId, text,
      username: AGENT.slackName, icon_emoji: AGENT.icon, unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[lawyer] ✅ Posted to #${channelName}`);
  } catch (err) {
    console.error(`[lawyer] Error posting to #${channelName}:`, err.message);
  }
}

// ─── Monthly legal checkup ────────────────────────────────────────────────────
async function postMonthlyLegalCheckup() {
  const thisMonth = `${new Date().getFullYear()}-${new Date().getMonth() + 1}`;
  if (state.get(AGENT_ID, 'lastMonthlyCheckup') === thisMonth) return;

  console.log('[lawyer] Running monthly legal checkup...');

  const openRisks = state.get(AGENT_ID, 'openRisks') || [];

  const context = `
Monthly legal checkup for Jesse Stay — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.

Jesse's business context:
- transkrybe.com: SaaS music transcription product (collecting user audio/data)
- MultiAgentCommsFramework (MACF): proprietary software framework he's building
- Self-employed/founder with social media consulting history
- Exploring executive employment (reviewing offer letters, NDAs)

Open risks from memory: ${openRisks.length > 0 ? openRisks.map(r => `${r.severity.toUpperCase()}: ${r.description}`).join('; ') : 'None logged'}

Write a monthly legal status memo covering:
1. ✅ Things Jesse has protected (IP, entity, contracts)
2. ⚠️ Things he should address this month (specific action items)
3. 🔴 Anything HIGH RISK that needs immediate attention or outside counsel

Include specific recommendations. Flag anything with "🔴 HIGH RISK — consult an attorney" for serious matters.
Reminder: This is guidance, not legal representation. High-stakes matters should involve a licensed attorney.
  `.trim();

  const memo = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await postToChannel(AGENT.primaryChannel, `${AGENT.emoji} *⚖️ Monthly Legal Checkup*\n${memo}`);
  state.set(AGENT_ID, 'lastMonthlyCheckup', thisMonth);
}

// ─── Handle @mention ──────────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    await say(`${AGENT.emoji} *${AGENT.slackName}* | Counsel here. What legal matter needs attention?`);
    return;
  }

  console.log(`[lawyer] Handling mention: "${text.slice(0, 80)}"`);

  const context = `
Jesse asked: "${text}"

Respond as Elite Business Lawyer. Frame all advice as: Risk | Exposure | Recommendation.
For HIGH RISK items, explicitly note: "🔴 For this matter, I strongly recommend consulting a licensed attorney."
This is legal guidance/education, not attorney-client representation.
  `.trim();

  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await say(`${AGENT.emoji} *${AGENT.slackName}* | ${response}`);

  // Log anything flagged as a risk
  if (response.toLowerCase().includes('risk') || response.toLowerCase().includes('concern')) {
    state.push(AGENT_ID, 'openRisks', {
      description: text.slice(0, 200),
      severity: response.toLowerCase().includes('high risk') ? 'high' : 'medium',
      identified: new Date().toISOString(),
    });
  }

  state.updateChannelActivity(AGENT.primaryChannel);
}

// ─── Handle delegation ────────────────────────────────────────────────────────
async function handleDelegation(messageText) {
  const match = messageText.match(/\[from:\s*(.+?)\s*→\s*Lawyer\]\s*(.+)/si);
  if (!match) return false;

  const fromAgent = match[1].trim();
  const request = match[2].trim();
  console.log(`[lawyer] Delegation from ${fromAgent}: ${request.slice(0, 80)}`);

  state.push(AGENT_ID, 'delegationLog', {
    from: fromAgent, request: request.slice(0, 200), timestamp: new Date().toISOString()
  });

  const context = `
Legal request from ${fromAgent}: "${request}"
Provide legal guidance covering: Risk | Exposure | Recommendation.
Flag HIGH RISK items with "🔴". Note this is guidance, not representation.
  `.trim();

  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await postToChannel(AGENT.primaryChannel, `${AGENT.emoji} *[from: Lawyer → ${fromAgent}]* ${response}`);
  return true;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[lawyer] ⚖️ Lawyer initialized');

  // Monthly legal checkup — 1st of each month at 10am MT (16:00 UTC)
  cron.schedule('0 16 1 * *', () =>
    postMonthlyLegalCheckup().catch(err => console.error('[lawyer] Monthly checkup error:', err))
  );
}

module.exports = { init, handleMention, handleDelegation, postMonthlyLegalCheckup };
