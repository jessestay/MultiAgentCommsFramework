// ics/adapters/slackDm.js — Investor Comms Service: Slack DM surface.
//
// LIVE-shape adapter wrapping utils/dm.js dmJesse(): opens Jesse's DM and
// posts as the CEO-role persona. The dmJesse CEO-role gate stays enforced —
// a non-CEO agent is refused with {status:'failed'} and nothing is posted.
// Slack API errors are caught and reported, never thrown.
'use strict';

const { dmJesse } = require('../../utils/dm');

function composeText(message) {
  const subject = (message.subject || '').trim();
  const body = message.body || '';
  return subject ? `${subject}\n\n${body}` : body;
}

async function send(ctx, message) {
  const { client, agent } = ctx || {};
  const agentId = (agent && agent.id) || 'unknown';
  try {
    const channelId = await dmJesse(client, agent, composeText(message || {}));
    if (!channelId) {
      return {
        status: 'failed',
        detail: `Refused: agent '${agentId}' does not hold the CEO role — only the CEO-role holder may DM Jesse. Route through the PM/CEO.`,
      };
    }
    return { status: 'delivered' };
  } catch (err) {
    return { status: 'failed', detail: err && err.message ? err.message : String(err) };
  }
}

module.exports = { name: 'slack-dm', send };
