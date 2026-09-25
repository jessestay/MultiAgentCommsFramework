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
async function handleDelegation(messageText, visitedAgents = new Set(), channelId = null) {
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

  await postAck(
    channelId || AGENT.primaryChannel,
    `[from: Facebook Expert → ${fromAgent}] On it — working the Facebook side now, I'll reply in-thread with what I find. Everything stays a draft for Jesse's review.`
  );
  return true;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[facebook] Facebook Expert initialized — works in #marketing + #content, no inbox channel');
}

module.exports = { init, handleMention, handleDelegation };
