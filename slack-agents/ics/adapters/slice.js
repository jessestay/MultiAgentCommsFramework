// ics/adapters/slice.js — Investor Comms Service: Bacon "The Slice" surface.
//
// Posts `bacon notify <message>` to the private #bacon Slack channel, which
// the Bacon desktop agent polls and raises as a Windows toast. Bacon's
// contract: the message portion is 1–280 chars with control characters
// stripped. Bacon and MACF stay independent: this adapter is just a Slack
// message — if Bacon isn't installed, the surface is simply not registered
// and delivery continues on the remaining surfaces.
//
// ctx must carry {client, baconChannelId}; without a channel id the adapter
// fails closed without calling Slack.
'use strict';

const PREFIX = 'bacon notify ';
const MAX_MESSAGE_CHARS = 280;

function sanitize(text) {
  return String(text || '').replace(/[\x00-\x1f]/g, '');
}

function composeMessage(message) {
  const subject = (message.subject || '').trim();
  const body = message.body || '';
  const combined = subject ? `${subject} ${body}` : body;
  return sanitize(combined).slice(0, MAX_MESSAGE_CHARS);
}

async function send(ctx, message) {
  const channel = ctx && ctx.baconChannelId;
  if (!channel) {
    return {
      status: 'failed',
      detail: 'Missing baconChannelId in ctx: the #bacon channel id is required to post the notify command.',
    };
  }
  const text = PREFIX + composeMessage(message || {});
  try {
    const res = await ctx.client.chat.postMessage({ channel, text });
    if (res && res.ok === false) {
      return { status: 'failed', detail: res.error || 'slack postMessage returned ok:false' };
    }
    return { status: 'delivered' };
  } catch (err) {
    return { status: 'failed', detail: err && err.message ? err.message : String(err) };
  }
}

module.exports = { name: 'slice', send };
