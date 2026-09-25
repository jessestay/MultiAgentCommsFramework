// utils/dm.js — Direct message helpers (1:1 and group DMs)
//
// Gives every team member the same capability a human has: private 1:1 or
// small-group conversations when an @mention in a channel is too much.
//   - Sending:    sendAgentDM() / sendGroupDM() post stamped as the agent's persona.
//   - Receiving:  index.js routes incoming DM events (message.im / message.mpim)
//                 to the addressed agent, defaulting to the CEO-role holder.
//   - Teammates:  private 1:1s between agents are normal — their private channel
//                 is the [from: X → Y] delegation format, which never posts to
//                 a channel, so it works exactly like a DM.
//   - End user:   ONLY the CEO-role holder (config.CEO_AGENT_ID) may initiate
//                 DMs to Jesse (investor/chairman). dmJesse() enforces this.
//                 Jesse may DM anyone; every member responds.
//
// Required Slack scopes: im:write (1:1 DMs), mpim:write (group DMs),
// im:history (reading DM history), im:read. Events: message.im, message.mpim.
// See SETUP.md Part 6.
'use strict';

const state = require('./state');

function isDMChannelId(channelId) {
  return typeof channelId === 'string' && channelId.startsWith('D');
}

function isDMEvent(event) {
  if (!event) return false;
  if (event.channel_type === 'im' || event.channel_type === 'mpim') return true;
  return isDMChannelId(event.channel);
}

// Post to any channel/DM stamped as the agent's persona (same stamping as channel posts)
async function postAs(client, agent, channel, text, opts = {}) {
  await client.chat.postMessage({
    channel,
    text,
    username: agent.slackName,
    icon_emoji: agent.icon,
    unfurl_links: false,
    ...opts,
  });
}

// Open (or reuse the cached) 1:1 DM channel with a user. Requires im:write.
async function openDM(client, userId) {
  const key = `dm_channel_${userId}`;
  const cached = state.get('dm', key);
  if (cached) return cached;
  const res = await client.conversations.open({ users: userId });
  const channelId = res.channel && res.channel.id;
  if (channelId) state.set('dm', key, channelId);
  return channelId;
}

// DM a human as an agent persona, e.g. sendAgentDM(client, AGENTS.cmo, 'U123', '...').
async function sendAgentDM(client, agent, userId, text) {
  const channel = await openDM(client, userId);
  if (!channel) throw new Error(`Could not open DM with user ${userId}`);
  await postAs(client, agent, channel, text);
  console.log(`[dm] ${agent.id} → DM with ${userId}`);
  return channel;
}

// Small private huddle: group DM with several users. Requires mpim:write.
async function sendGroupDM(client, agent, userIds, text) {
  const res = await client.conversations.open({ users: userIds.join(',') });
  const channel = res.channel && res.channel.id;
  if (!channel) throw new Error('Could not open group DM');
  await postAs(client, agent, channel, text);
  console.log(`[dm] ${agent.id} → group DM (${userIds.length} users)`);
  return channel;
}

// DM Jesse directly as an agent persona — ONLY the CEO-role holder may
// initiate direct DMs to the end user. Everyone else routes through the PM/CEO.
// Returns the DM channel ID, or null when not permitted.
async function dmJesse(client, agent, text) {
  const { JESSE_SLACK_ID, CEO_AGENT_ID } = require('../config');
  if (!agent || agent.id !== CEO_AGENT_ID) {
    console.log(`[dm] ${agent?.id || 'unknown'} does not hold the CEO role — cannot DM the end user directly. Route through the PM/CEO.`);
    return null;
  }
  if (!JESSE_SLACK_ID) return null;
  return sendAgentDM(client, agent, JESSE_SLACK_ID, text);
}

module.exports = {
  isDMChannelId,
  isDMEvent,
  postAs,
  openDM,
  sendAgentDM,
  sendGroupDM,
  dmJesse,
};
