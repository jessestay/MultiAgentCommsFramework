// ics/mcp.js — Investor Comms Service: MCP-style interface.
//
//   notify_investor({engine_id, type, priority, subject, body, ...}, {bus, ctx})
//       validates + submits through the bus; mints idempotency_key when absent.
//   delivery_status({idempotency_key}, {audit})
//       per-channel status + dead-letter flag from the audit log.
//   investor_reply({surface, replyTo, body}, {audit})
//       records an investor reply from any surface and queues it to the CEO
//       inbox; getCeoInbox() returns a copy of the queued replies.
'use strict';

const crypto = require('crypto');

const inbox = [];

async function notify_investor(args, deps) {
  const payload = {
    ...(args || {}),
    idempotency_key: (args && args.idempotency_key) || crypto.randomUUID(),
  };
  return deps.bus.submit(payload, deps.ctx);
}

async function delivery_status(args, deps) {
  const key = args && args.idempotency_key;
  const entries = deps.audit.readAll().filter((e) => e.idempotency_key === key);
  if (entries.length === 0) return { found: false };
  const channels = {};
  let deadLetter = false;
  let delivered = false;
  let queued = false;
  for (const e of entries) {
    if (e.kind === 'channel_delivery') {
      channels[e.channel] = { status: e.status };
      if (e.detail) channels[e.channel].detail = e.detail;
      if (e.status === 'delivered') delivered = true;
    } else if (e.kind === 'dead_letter') {
      deadLetter = true;
    } else if (e.kind === 'queued') {
      queued = true;
    }
  }
  return { found: true, idempotency_key: key, channels, deadLetter, delivered, queued };
}

async function investor_reply(args, deps) {
  const body = args && args.body;
  if (typeof body !== 'string' || body.trim() === '') {
    return { recorded: false, reason: 'validation' };
  }
  const reply = {
    surface: args.surface,
    replyTo: args.replyTo,
    body,
    ts: new Date().toISOString(),
  };
  deps.audit.append({ kind: 'investor_reply', ...reply });
  inbox.push(reply);
  return { recorded: true };
}

function getCeoInbox() {
  return inbox.map((r) => ({ ...r }));
}

module.exports = { notify_investor, delivery_status, investor_reply, getCeoInbox };
