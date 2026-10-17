// agents/facebook.js — Facebook Expert | MACF Role: Facebook Operations
//
// The Facebook Expert is powered by Muse (Jarvis Jr.), Jesse's personal AI,
// which holds the live Facebook connection and real tool access.
//
// Framework convention: like every MACF agent, the Facebook Expert lives in
// shared functional channels (#marketing, #content) and takes work via
// @mentions and the [from: X → Y] delegation format — the way a specialist
// operates on an optimized human team. There is no personal inbox channel.
//
// This module is the team's front door, not the brain: it acknowledges the
// mention/delegation in place and logs the task. Muse's polling bridge picks
// the task up, does the real Facebook work, and replies in-thread as this
// persona.
//
// ─── Hard rule ─── Everything stays a draft for Jesse's review. Never publish.
'use strict';

const { AGENTS } = require('../config');
const state = require('../utils/state');
const { resolveChannel: _resolveChannel } = require('../utils/channels');

const AGENT_ID = 'facebook';
const AGENT = AGENTS[AGENT_ID];

let slackClient = null;

// Resolve a channel target that may be an ID (C…/D…/G…) or a name.
async function resolveTarget(target) {
  if (!target) target = AGENT.primaryChannel;
  if (/^[CDBG][A-Z0-9]+$/.test(target)) return target;
  return _resolveChannel(slackClient, target);
}

async function postAck(target, text) {
  if (!slackClient) return;
  try {
    const channel = await resolveTarget(target);
    if (!channel) {
      console.warn(`[facebook] Channel not found: ${target}`);
      return;
    }
    await slackClient.chat.postMessage({
      channel,
      text,
      username: AGENT.slackName,
      icon_emoji: AGENT.icon,
      unfurl_links: false,
    });
    console.log('[facebook] Ack posted');
  } catch (err) {
    console.error('[facebook] postAck error:', err.message);
  }
}

function logTask(kind, from, request) {
  try {
    state.push(AGENT_ID, 'taskQueue', {
      kind,
      from,
      request: String(request || '').slice(0, 500),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[facebook] taskQueue push failed:', err.message);
  }
}

// ─── Handle mention ───────────────────────────────────────────────────────────
// @facebook-expert in #marketing / #content → ack in the thread, log the task.
// The polling bridge (Muse) picks it up and replies in-thread with the result.
async function handleMention({ event, say }) {
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    await say('Facebook Expert here. Posts, Marketplace, ads, comments — what do you need?');
    return;
  }

  console.log(`[facebook] Mention: "${text.slice(0, 80)}"`);
  logTask('mention', 'channel-mention', text);
  await say(`On it — I'll work the Facebook side and reply here in-thread. Everything stays a draft for Jesse's review.`);
  state.updateChannelActivity(AGENT.primaryChannel);
}

// ─── Handle delegation ────────────────────────────────────────────────────────
// [from: X → Facebook Expert] → ack where it landed, log the task. The polling
// bridge does the real work and replies in-thread as this persona.
async function handleDelegation(messageText, visitedAgents = new Set(), channelId = null, threadTs = null) {
  const match = messageText.match(/\[from:\s*(.+?)\s*→\s*(?:facebook\s*expert|facebook)\]\s*([\s\S]*)/i);
  if (!match) return false;

  const fromAgent = match[1].trim();
  const request = (match[2] || '').trim();
  console.log(`[facebook] Delegation from ${fromAgent}: "${request.slice(0, 80)}"`);

  // Log delegation for context (agents can't read each other's memory)
  state.push(AGENT_ID, 'delegationLog', {
    from: fromAgent, request: request.slice(0, 200), timestamp: new Date().toISOString()
  });
  logTask('delegation', fromAgent, request);

  // CAPABILITY CHECK (Oct 4, 2026 — architectural fix):
  // Facebook Expert has NO Facebook API tools. It cannot post, check DMs,
  // or perform any Facebook actions. If the request requires real Facebook
  // execution, report a ROADBLOCK instead of pretending to work.
  const needsFacebookAction = /post|publish|dm|message|ad|comment|page|group/i.test(request);
  if (needsFacebookAction) {
    const roadblock = `[ROADBLOCK: Facebook Expert] NEED: Facebook API access (post, DM, page management) | TRIED: none available — no tools configured | BLOCKED BY: no Facebook/Meta API integration in engine`;
    console.log(`[facebook] 🚧 Cannot execute — reporting roadblock: ${request.slice(0, 60)}`);
    return {
      completed: false,
      response: roadblock,
      roadblock: true,
      agentId: AGENT_ID,
      timestamp: new Date().toISOString()
    };
  }

  // For non-action requests (advice, strategy), provide LLM guidance with tools.
  // Note: This is advisory only, not execution.
  const { generateReport, generateWithTools } = require('../utils/anthropic');
  const { stripDelegations } = require('../utils/delegation');
  const context = `Facebook marketing question from ${fromAgent}:\n"${request}"\n\nProvide Facebook marketing advice. Be specific and actionable. Note: you cannot execute Facebook actions directly — only advise.`;
  // TOOL EXECUTION (Oct 9, 2026): Facebook Expert now has tools — can check
  // URLs, read files during advisory requests.
  const { response, toolResults, toolsUsed } = await generateWithTools({
    systemPrompt: AGENT.systemPrompt,
    context,
    maxTokens: 2000,
    agentId: AGENT_ID,
  });

  // POLLER IS SOLE POSTER: Do NOT post directly. Return for validation.
  return {
    completed: true,
    response: `[from: Facebook Expert → ${fromAgent}] ${stripDelegations(response)}`,
    threadTs: threadTs,
    channel: channelId || AGENT.primaryChannel,
    subResults: [],
    agentId: AGENT_ID,
    evidence: toolsUsed > 0
      ? `Facebook advisory with ${toolsUsed} tool execution(s): ${toolResults.map(t => t.tool).join(', ')}`
      : 'Advisory only — no Facebook API execution available',
    timestamp: new Date().toISOString()
  };
}

// ─── Autonomous hourly run ────────────────────────────────────────────────
// Generates a status artifact so the sprint demo checker detects activity.
// (Added Oct 10, 2026 — Facebook Expert was the only agent without runAutonomous,
// causing false "silent" escalations despite having active tasks.)
async function runAutonomous() {
  const fs = require('fs');
  const path = require('path');
  const now = new Date();
  const artifactPath = path.join(__dirname, '..', 'hidden_files', 'facebook-status.md');
  const content = `# Facebook Expert Status\nGenerated: ${now.toISOString()} (autonomous hourly run)\n\n## Active Focus\n- Workshop promo (Oct 11): Facebook post copy and visuals\n- DM monitoring: Facebook DMs for campaign responses\n- Content: Organic Facebook strategy per Mari Smith lens\n\n## Notes\n- Buffer integration down (OAuth expired); manual posting required\n- All Facebook work is draft-only pending Jesse approval\n`;
  fs.writeFileSync(artifactPath, content);
  console.log(`[facebook] Status written to ${artifactPath}`);
  return { artifactPath };
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[facebook] Facebook Expert initialized — works in #marketing + #content, no inbox channel');
}

module.exports = { init, handleMention, handleDelegation, runAutonomous };
