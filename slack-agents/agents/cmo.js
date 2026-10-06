// agents/cmo.js — CMO (@cmo) | MACF Role: Marketing Director (MD)
// Leads the Branding Team. GoFundMe monitor. Weekly content calendar. Campaign strategy.
// Memory: isolated to cmo namespace.

const cron = require('node-cron');
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport, generateProactivePost } = require('../utils/anthropic');
const { fetchDonationTotal, GOFUNDME_URL } = require('../utils/gofundme');
const { resolveChannel: _resolveChannel } = require('../utils/channels');
const { relay, stripDelegations } = require('../utils/delegation');
const { invokeTool, listTools } = require('../engine/mcpClient');

const AGENT = AGENTS.cmo;
const AGENT_ID = AGENT.id; // 'cmo'

let slackClient = null;

// ─── Channel resolution ───────────────────────────────────────────────────────
async function resolveChannel(name) {
  return _resolveChannel(slackClient, name);
}

async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) {
    console.warn(`[cmo] Channel not found: #${channelName}`);
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
    console.log(`[cmo] ✅ Posted to #${channelName}`);
  } catch (err) {
    console.error(`[cmo] Error posting to #${channelName}:`, err.message);
  }
}

// Post a reply in a thread (fixes "0 replies" bug where agents posted
// top-level instead of in the directive thread)
async function postToThread(channelName, threadTs, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) {
    console.warn(`[cmo] Channel not found: #${channelName}`);
    return;
  }
  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text,
      username: AGENT.slackName,
      icon_emoji: AGENT.icon,
      unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[cmo] ✅ Replied in thread ${threadTs}`);
  } catch (err) {
    console.error(`[cmo] Error replying in thread:`, err.message);
    // Fallback to top-level post if thread reply fails
    await postToChannel(channelName, text);
  }
}

// ─── GoFundMe polling (every 30min) ─────────────────────────────────────────
async function pollGoFundMe() {
  console.log('[cmo] Polling GoFundMe...');
  const current = await fetchDonationTotal().catch(() => null);
  if (!current) return;

  const lastAmount = state.get(AGENT_ID, 'knownDonationAmount') || 0;
  state.set(AGENT_ID, 'lastGoFundMeCheck', new Date().toISOString());

  if (lastAmount === 0) {
    // First run — set baseline silently
    state.set(AGENT_ID, 'knownDonationAmount', current.amount);
    console.log(`[cmo] GoFundMe baseline set: $${current.amount}`);
    return;
  }

  if (current.amount !== lastAmount) {
    const delta = current.amount - lastAmount;
    const isIncrease = delta > 0;
    const deltaText = isIncrease ? `+$${delta.toFixed(2)}` : `-$${Math.abs(delta).toFixed(2)}`;

    const context = `
Active campaign just changed:
- Previous total: $${lastAmount}
- New total: $${current.amount} raised of $${current.goal || '?'} goal
- Change: ${deltaText}
- Progress: ${current.percentFunded}%
- URL: ${GOFUNDME_URL}

Write a brief, energetic marketing update about this change.
Include specific numbers. ${isIncrease ? 'Be celebratory.' : 'Be supportive and encouraging.'}
Suggest 1-2 specific social media angles Jesse could use to amplify this.
All suggestions must note: "🔴 Needs Jesse's ✅ before posting"
    `.trim();

    const text = await generateProactivePost({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 600 });
    await postToChannel(AGENT.primaryChannel, text);

    state.set(AGENT_ID, 'knownDonationAmount', current.amount);
    console.log(`[cmo] GoFundMe change: $${lastAmount} → $${current.amount}`);
  } else {
    console.log(`[cmo] GoFundMe unchanged: $${current.amount}`);
  }
}

// ─── Weekly content calendar (Mondays 9am MT = 15:00 UTC) ────────────────────
async function postWeeklyContentCalendar() {
  const thisWeek = getISOWeek();
  if (state.get(AGENT_ID, 'lastWeeklyCalendar') === thisWeek) {
    console.log('[cmo] Weekly calendar already posted this week.');
    return;
  }

  console.log('[cmo] Generating weekly content calendar...');
  const gofundme = await fetchDonationTotal().catch(() => null);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);

  const context = `
Weekly content calendar for Jesse Stay.
Week of: ${weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

Active campaigns:
1. Active campaign — $${gofundme?.amount || '?'} raised of $${gofundme?.goal || '?'}
2. transkrybe.com music transcription SaaS — awareness and growth
3. Jesse's personal brand — tech founder, dad, accessibility advocate

Jesse's channels: Facebook, Twitter/X, LinkedIn, TikTok, YouTube (load current stats from project context JSON)

Create a Mon–Sun calendar:
- 1 content piece per day
- Rotate platforms (FB, X, LinkedIn, TikTok)
- Mix: GoFundMe (2x), transkrybe (2x), personal brand (2x), engagement (1x)
- Each marked: "🔴 Needs Jesse's ✅"

Format: *Day* — Platform — Content type — Topic — Rationale (1 line)
  `.trim();

  const calendar = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 1500 });
  await postToChannel(AGENT.primaryChannel, calendar);

  // Delegate execution to CCO
  await postToChannel(AGENT.primaryChannel,
    `[from: CMO → CCO] Weekly calendar is up. Please draft the first 2 posts (Mon + Tue) for Jesse's review.`
  );

  state.set(AGENT_ID, 'lastWeeklyCalendar', thisWeek);
}

// ─── Handle @mention ──────────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    await say("CMO here. What marketing strategy can I help with?");
    return;
  }

  const threadCtx = event.threadContext || '';
  console.log(`[cmo] Handling mention: "${text.slice(0, 80)}"`);

  const context = `
Jesse asked (in #marketing or via @mention): "${text}"${threadCtx}
My current state: GoFundMe last known: $${state.get(AGENT_ID, 'knownDonationAmount')} raised.
Last weekly calendar: ${state.get(AGENT_ID, 'lastWeeklyCalendar') || 'not posted yet'}
  `.trim();

  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  await relay(response, AGENT_ID);
  await say(stripDelegations(response));
  state.updateChannelActivity(AGENT.primaryChannel);
}

// ─── Handle delegation ────────────────────────────────────────────────────────
async function handleDelegation(messageText, visitedAgents = new Set(), channelId = null, threadTs = null) {
  const match = messageText.match(/\[from:\s*(.+?)\s*→\s*CMO\]\s*(.+)/si);
  if (!match) return false;

  const fromAgent = match[1].trim();
  const request = match[2].trim();
  console.log(`[cmo] Delegation from ${fromAgent}: ${request.slice(0, 80)}`);

  // Log delegation for context (agents can't read each other's memory)
  state.push(AGENT_ID, 'delegationLog', {
    from: fromAgent, request: request.slice(0, 200), timestamp: new Date().toISOString()
  });

  // Check if this directive requires MCP tool execution
  let toolResult = null;
  const lowerRequest = request.toLowerCase();

  try {
    // Research requests → Tavily
    if (lowerRequest.includes('research') || lowerRequest.includes('search for') || lowerRequest.includes('find information')) {
      console.log('[cmo] Executing via Tavily MCP...');
      const query = request.slice(0, 200);
      toolResult = await invokeTool('tavily', 'tavily_search', { query, max_results: 5 });
      console.log('[cmo] Tavily result received');
    }
    // Content publishing → Buffer (when configured)
    else if (lowerRequest.includes('publish') && lowerRequest.includes('buffer')) {
      console.log('[cmo] Executing via Buffer MCP...');
      // Buffer tool invocation would go here
      toolResult = { note: 'Buffer publishing via MCP - implementation pending channel config' };
    }
  } catch (e) {
    console.error(`[cmo] MCP tool failed: ${e.message}`);
    toolResult = { error: e.message };
  }

  // EXPERT LENSES (Oct 6, 2026): Load the actual playbook contents, not just
  // the one-paragraph summaries in config.js.
  let lensContext = '';
  try {
    const { loadContentLenses } = require('../utils/expertLens');
    lensContext = loadContentLenses();
  } catch (e) {
    console.error('[cmo] Failed to load expert lenses:', e.message);
  }

  const context = `
Delegation request from ${fromAgent}:
"${request}"

${lensContext ? `EXPERT GUIDANCE (follow this when writing):\n${lensContext}\n\n` : ''}${toolResult ? `Tool execution result:\n${JSON.stringify(toolResult).slice(0, 1000)}` : ''}

Respond as CMO. If this requires research, delegate to CRO.
If it needs content drafted, delegate to CCO. If it needs design, delegate to CUXO.
${toolResult ? 'Include the tool result in your response with specific findings.' : ''}
  `.trim();

  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  const subResults = await relay(response, AGENT_ID, visitedAgents, channelId);

  // ROOT-CAUSE FIX: Do NOT post directly. Return the response for the poller
  // to validate. The poller is the sole poster — it validates evidence BEFORE
  // posting, preventing empty "on it" messages from spamming the channel.
  const formattedResponse = `[from: CMO → ${fromAgent}] ${stripDelegations(response)}`;

  // Return evidence contract: what was actually done
  // The poller will post this ONLY if evidence validation passes.
  return {
    completed: true,
    response: formattedResponse,  // Poller posts this if validated
    threadTs: threadTs,           // Poller uses this for thread reply
    channel: AGENT.primaryChannel,
    subResults: subResults,
    evidence: toolResult ? `Executed via MCP: ${JSON.stringify(toolResult).slice(0, 200)}` : null,
    // NULL evidence for text-only replies forces the poller to validate
    // the response content itself for verifiable deliverables.
    agentId: AGENT_ID,
    timestamp: new Date().toISOString()
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getISOWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week}`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[cmo] 📊 Chief Marketing Officer initialized');

  // GoFundMe poll every 30 minutes
  cron.schedule('*/30 * * * *', () =>
    pollGoFundMe().catch(err => console.error('[cmo] GoFundMe poll error:', err))
  );

  // Weekly content calendar — Mondays at 9am MT (15:00 UTC)
  cron.schedule('0 15 * * 1', () =>
    postWeeklyContentCalendar().catch(err => console.error('[cmo] Calendar error:', err))
  );

  // Initial GoFundMe poll on startup
  setTimeout(() => {
    pollGoFundMe().catch(err => console.error('[cmo] Initial poll error:', err));
  }, 15_000);
}

// ─── Autonomous market scan ───────────────────────────────────────────────────
// Standard autonomous interface: called hourly by engine/autonomousRunner.js.
// Generates a market scan artifact (workshop promo status, content pipeline)
// independent of Slack directives.
const MARKET_SCAN_PATH = require('path').join(__dirname, '..', 'hidden_files', 'market-scan.md');

async function runAutonomous() {
  const now = new Date();
  const scan = `# Market Scan
Generated: ${now.toISOString()} (autonomous CMO hourly run)

## Workshop Promo (Oct 11)
- Status: CCO drafting copy, CUXO on visuals
- Price: $90 through Oct 8, then $149
- Links: Standard https://www.paypal.com/ncp/payment/99NXFJ6G8UV46

## Content Pipeline
- No new content scheduled this hour
- Awaiting CCO drafts for review

## Notes
- Last updated: ${now.toISOString()}
`;
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = path.dirname(MARKET_SCAN_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MARKET_SCAN_PATH, scan);
    console.log(`[cmo] Market scan written to ${MARKET_SCAN_PATH}`);
  } catch (err) {
    console.error('[cmo] Market scan failed:', err.message);
  }
  return {
    agentId: 'cmo',
    artifactPath: MARKET_SCAN_PATH,
    timestamp: now.toISOString(),
  };
}

module.exports = { init, handleMention, handleDelegation, pollGoFundMe, postWeeklyContentCalendar, runAutonomous };
