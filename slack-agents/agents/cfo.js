// agents/cfo.js — CFO (@cfo) | MACF Role: Business Income Coach (BIC)
// Revenue optimization, SaaS metrics, tax strategy, financial planning.
// Memory: isolated to cfo namespace.

const cron = require('node-cron');
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport } = require('../utils/anthropic');
const { chatTurn, isConfigured: gatewayConfigured } = require('../utils/litellm');
const { runToolLoop, withModelFallback } = require('../mcp-client');
const { resolveChannel: _resolveChannel } = require('../utils/channels');
const { relay, stripDelegations } = require('../utils/delegation');

const AGENT = AGENTS.cfo;
const AGENT_ID = AGENT.id; // 'cfo'

// ─── Hands: verified finance via MCP tools ────────────────────────────────────
// When the CFO needs ground truth (revenue, PayPal, balances, transactions),
// it calls the real tools instead of inventing numbers. The tool loop is
// budgeted (grants.json); on budget exhaustion it returns verified-so-far.
const HANDS_TRIGGERS = /\b(revenue|paypal|balance|transaction|payout|cash position|dashboard|how much (did|have|do) (we|i)|money (in|came))\b/i;

function needsHands(text) {
  return HANDS_TRIGGERS.test(text || '');
}

async function answerWithHands({ systemPrompt, request }) {
  const started = Date.now();
  // Budget tier first; fall back to the capable tier when the budget model
  // garbles a tool call (verified behavior Oct 1, 2026).
  const handsTurn = withModelFallback(
    ({ messages, tools, model }) => chatTurn({ messages, tools, model, maxTokens: 800 }),
  );
  const result = await runToolLoop({
    role: 'cfo',
    systemPrompt: `${systemPrompt}

You have READ-ONLY finance tools (PayPal transactions and balances). Use them whenever the question is about actual money — revenue, payouts, balances, cash position. Report only numbers the tools returned; if a tool fails or the budget runs out, say exactly what is verified and what is UNVERIFIED. Never invent a figure. Keep the final answer under 250 words, plain sentences, no emoji.`,
    userMessage: request,
    llmTurn: handsTurn,
    onProgress: ({ tool, n }) => console.log(`[cfo:hands] tool #${n}: ${tool}`),
  });
  console.log(`[cfo:hands] done in ${Date.now() - started}ms, ${result.toolCallsUsed} tool calls`);
  const evidence = result.toolSummaries.length
    ? `\n\n(Verified via tools: ${result.toolSummaries.join(' | ')})`
    : '';
  if (result.budgetExhausted && !result.text) {
    return `I started checking the real numbers but hit my tool budget before finishing. Verified so far: ${result.toolSummaries.join(' | ') || 'nothing yet'}. The rest is UNVERIFIED — I will not guess.`;
  }
  return (result.text || 'No answer produced.') + evidence;
}

// Fail-closed: when the hands path throws, NEVER fall back to a plain LLM
// for money questions — an unguided model can fabricate figures. Say so.
function handsFailureMessage(err) {
  return `I could not verify the real numbers just now (tool system error: ${String(err.message || err).slice(0, 120)}). I will not guess at balances or revenue — please try again in a few minutes.`;
}

let slackClient = null;

async function resolveChannel(name) {
  return _resolveChannel(slackClient, name);
}

async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) { console.warn(`[cfo] Channel not found: #${channelName}`); return; }
  try {
    await slackClient.chat.postMessage({
      channel: channelId, text,
      username: AGENT.slackName, icon_emoji: AGENT.icon, unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[cfo] ✅ Posted to #${channelName}`);
  } catch (err) {
    console.error(`[cfo] Error posting to #${channelName}:`, err.message);
  }
}

// ─── Monthly financial brief ──────────────────────────────────────────────────
async function postMonthlyFinancialBrief() {
  const thisMonth = `${new Date().getFullYear()}-${new Date().getMonth() + 1}`;
  if (state.get(AGENT_ID, 'lastMonthlyBrief') === thisMonth) return;

  console.log('[cfo] Generating monthly financial brief...');
  const metrics = state.get(AGENT_ID, 'trackedMetrics') || {};

  const context = `
Monthly financial brief for Jesse Stay — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.

Jesse's revenue sources:
- transkrybe.com SaaS (early stage — limited revenue currently)
- Potential consulting/freelance (social media expertise)
- Job search for executive salary
- GoFundMe (active campaign — load goal and details from project context JSON; not business revenue)

Known metrics: ${JSON.stringify(metrics, null, 2) || 'None tracked yet — first run'}

Write a monthly financial brief covering:
1. *Revenue status:* What's coming in vs. what should be (with specific targets)
2. *SaaS metrics to track:* MRR, CAC, LTV, churn — even if $0 right now, set baselines
3. *Tax strategy this month:* Specific deductions Jesse can take as a founder/self-employed person
4. *Cash flow priority:* What Jesse should focus revenue efforts on this month
5. *⚡ One quick win:* Something Jesse can do in the next 7 days to improve financial position

Be specific with numbers. Use format: Current → Target → How to get there.
Disclaimer: This is financial guidance for planning purposes — consult a CPA for tax filing.
  `.trim();

  const brief = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await postToChannel(AGENT.primaryChannel, brief);
  state.set(AGENT_ID, 'lastMonthlyBrief', thisMonth);
}

// ─── Handle @mention ──────────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    await say("CFO here. What's on your mind financially?");
    return;
  }

  const threadCtx = event.threadContext || '';
  console.log(`[cfo] Handling mention: "${text.slice(0, 80)}"`);

  const context = `
Jesse asked: "${text}"${threadCtx}
Known metrics: ${JSON.stringify(state.get(AGENT_ID, 'trackedMetrics') || {}, null, 2)}

Respond as CFO. Use specific numbers. Flag any tax deadlines. For actual tax filing or investment decisions, remind Jesse to consult a CPA.
  `.trim();

  // Hands path: money questions get verified tool data, not LLM guesses.
  let response;
  if (needsHands(text) && gatewayConfigured()) {
    try {
      response = await answerWithHands({ systemPrompt: AGENT.systemPrompt, request: context });
    } catch (err) {
      console.error('[cfo] hands failed (fail-closed, no LLM fallback):', err.message);
      response = handsFailureMessage(err);
    }
  } else {
    response = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  }
  await relay(response, AGENT_ID);
  await say(stripDelegations(response));
  state.updateChannelActivity(AGENT.primaryChannel);
}

// ─── Handle delegation ────────────────────────────────────────────────────────
async function handleDelegation(messageText, visitedAgents = new Set(), channelId = null) {
  const match = messageText.match(/\[from:\s*(.+?)\s*→\s*CFO\]\s*(.+)/si);
  if (!match) return false;

  const fromAgent = match[1].trim();
  const request = match[2].trim();
  console.log(`[cfo] Delegation from ${fromAgent}: ${request.slice(0, 80)}`);

  state.push(AGENT_ID, 'delegationLog', {
    from: fromAgent, request: request.slice(0, 200), timestamp: new Date().toISOString()
  });

  const context = `Financial request from ${fromAgent}: "${request}"\nProvide specific financial analysis: Current | Target | Action | Impact.`;
  // Hands path: money questions get verified tool data, not LLM guesses.
  let response;
  if (needsHands(request) && gatewayConfigured()) {
    try {
      response = await answerWithHands({ systemPrompt: AGENT.systemPrompt, request: context });
    } catch (err) {
      console.error('[cfo] hands failed (fail-closed, no LLM fallback):', err.message);
      response = handsFailureMessage(err);
    }
  } else {
    response = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1200 });
  }
  await relay(response, AGENT_ID, visitedAgents, channelId);
  // Post the clean response to #management — Jesse doesn't need the routing prefix
  await postToChannel(AGENT.primaryChannel, stripDelegations(response));
  return true;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[cfo] 💰 CFO initialized');

  // Monthly financial brief — 1st of each month at 9am MT (15:00 UTC)
  cron.schedule('0 15 1 * *', () =>
    postMonthlyFinancialBrief().catch(err => console.error('[cfo] Monthly brief error:', err))
  );
}

module.exports = { init, handleMention, handleDelegation, postMonthlyFinancialBrief };
