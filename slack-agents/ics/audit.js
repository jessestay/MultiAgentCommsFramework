// ics/audit.js — Investor Comms Service: append-only JSONL audit log.
//
// Every submission, per-channel delivery, queue event, rejection, mirror
// failure, dead letter, and investor reply is appended as one JSON object per
// line. The idempotency seen-store is disk-backed (kind:'seen' entries) so
// dedupe survives a bus restart.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createAudit(filePath) {
  function append(entry) {
    const stamped = { ...entry, id: crypto.randomUUID(), ts: new Date().toISOString() };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${JSON.stringify(stamped)}\n`, 'utf8');
    return stamped;
  }

  function readAll() {
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') return [];
      throw err;
    }
    return raw.split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line));
  }

  function hasSeen(key) {
    return readAll().some((e) => e.kind === 'seen' && e.key === key);
  }

  function markSeen(key, recordId) {
    if (hasSeen(key)) return; // idempotent
    append({ kind: 'seen', key, recordId });
  }

  return { append, readAll, hasSeen, markSeen };
}

module.exports = { createAudit };
