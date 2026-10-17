// ics/digest.js — Investor Comms Service: outcomes digest.
//
// 'outcome' submissions are queued here (module-level; the bus stages them on
// submit) and drained as a single fanning-out digest — type 'immediate', never
// 'outcome', so a drain can never re-queue itself. A failed drain propagates
// and the queue is NOT dropped.
'use strict';

const crypto = require('crypto');

const queue = [];

function queueOutcome(record) {
  queue.push({ ...record });
}

function shortText(s, max = 280) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function buildDigest() {
  if (queue.length === 0) return '';
  const date = new Date().toISOString().slice(0, 10);
  const header = `Investor outcomes digest — ${date} (${queue.length} item${queue.length === 1 ? '' : 's'})`;
  const lines = queue.map((r) => `- ${r.subject}: ${shortText(r.body)}`);
  return [header, ...lines].join('\n');
}

async function drainDigest(bus, ctx) {
  if (queue.length === 0) return { drained: 0 };
  const text = buildDigest();
  const count = queue.length;
  const payload = {
    idempotency_key: crypto.randomUUID(),
    engine_id: ctx && ctx.engineId,
    type: 'immediate', // fan out — never 'outcome' (no re-queue loops)
    priority: 3,
    subject: 'Investor outcomes digest',
    body: text,
    vikunja_task_id: null,
    actions: [],
  };
  const res = await bus.submit(payload, ctx);
  if (!res || res.accepted === false) {
    throw new Error(`digest drain rejected by bus: ${(res && res.reason) || 'unknown'}`);
  }
  queue.length = 0;
  return { drained: count };
}

module.exports = { queueOutcome, buildDigest, drainDigest };
