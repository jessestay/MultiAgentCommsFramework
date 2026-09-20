// agents/facebook.js — Facebook Expert | MACF Role: Facebook Operations
// The Facebook Expert is powered by Muse (Jarvis Jr.), Jesse's personal AI,
// which holds the live Facebook connection and real tool access.
// This module is the team's interface: it routes delegated Facebook work into
// the #facebook-expert inbox channel, where Muse picks it up on its polling
// cadence and replies in-thread as the Facebook Expert persona.
// ─── Hard rule ─── Everything stays a draft for Jesse's review. Never publish.
'use strict';

const { AGENTS } = require('../config');
const state = require('../utils/state');
const { relay } = require('../utils/agents');
const { resolveChannel } = require('../utils/channels');

const AGENT_ID = 'facebook';
const AGENT = AGENTS[AGENT_ID];

let slackClient = null;

// ─── Handle mention ───────────────────────────────────────────────────────────
// @facebook-expert in any channel → file the ask in the inbox, ack in place.
async function handleMention({ event, say }) {
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    await say('Facebook Expert here. Posts, Marketplace, ads, comments — what do you need?');
    return;
  }

  console.log(`[facebook] Mention: "${text.slice(0, 80)}"`);
  const taskTs = await fileTask('channel-mention', text);
  if (taskTs) {
    await say(`Got it — working this in #facebook-expert and I'll reply in-thread. Everything stays a draft for Jesse's review.`);
  } else {
    await say('Tried to file that in #facebook-expert but the channel is unreachable. Make sure I\'m in the channel and try again.');
  }
  state.updateChannelActivity(AGENT.primaryChannel);
}

// ─── Handle delegation ────────────────────────────────────────────────────────
// [from: X → Facebook Expert] → file in the #facebook-expert inbox channel and
// acknowledge. The real work happens on Muse's polling bridge, which reads the
// inbox and replies in-thread as this persona.
async function handleDelegation(messageText, visitedAgents = new Set(), channelId = null) {
  const match = messageText.match(/\[from:\s*(.+?)\s*→\s*(?:facebook\s*expert|facebook)\]\s*(.+)/si);
  if (!match) return false;

  const fromAgent = match[1].trim();
  const request = match[2].trim();
  console.log(`[facebook] Delegation from ${fromAgent}: ${request.slice(0, 80)}`);

  // Log delegation for context (agents can't read each other's memory)
  state.push(AGENT_ID, 'delegationLog', {
    from: fromAgent, request: request.slice(0, 200), timestamp: new Date().toISOString()
  });

  const taskTs = await fileTask(fromAgent, request);
  if (taskTs) {
    await relay(`[from: Facebook Expert → ${fromAgent}] Filed in #facebook-expert. I'll reply in-thread with the result; everything stays a draft for Jesse's review.`, AGENT_ID, visitedAgents, channelId);
  } else {
    await relay(`[from: Facebook Expert → ${fromAgent}] Couldn't reach #facebook-expert (channel missing or I'm not in it). Please check the channel and re-delegate.`, AGENT_ID, visitedAgents, channelId);
  }
  return true;
}

// ─── File a task in the inbox channel ────────────────────────────────────────
// Posts the task with origin metadata so the polling bridge can claim it and
// reply in-thread. Returns the posted message ts, or null on failure.
async function fileTask(from, request) {
  if (!slackClient) return null;
  try {
    const channelId = await resolveChannel(slackClient, 'facebook-expert');
    if (!channelId) {
      console.error('[facebook] Could not resolve #facebook-expert');
      return null;
    }
    const result = await slackClient.chat.postMessage({
      channel: channelId,
      text: `📘 New Facebook task — from ${from}:\n${request}`,
    });
    state.push(AGENT_ID, 'taskQueue', {
      from, request: request.slice(0, 200), ts: result.ts, timestamp: new Date().toISOString()
    });
    return result.ts;
  } catch (err) {
    console.error('[facebook] fileTask error:', err.message);
    return null;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[facebook] 📘 Facebook Expert initialized (routed to #facebook-expert inbox)');
}

module.exports = { init, handleMention, handleDelegation };
