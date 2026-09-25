// tests/ics-audit.test.js — Investor Comms Service: append-only JSONL audit log
//
// Contract: ics/audit.js exports createAudit(path) ->
//   { append(entry) -> entry with id+ts, readAll() -> [],
//     hasSeen(key) -> bool, markSeen(key, recordId) }
// Disk format is JSONL, append-only. Tests use tmp dirs only — never the real path.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { createAudit } = require('../ics/audit');

let dir;
let auditPath;
let audit;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ics-audit-'));
  auditPath = path.join(dir, 'audit.jsonl');
  audit = createAudit(auditPath);
});

describe('append / readAll', () => {
  test('append returns the entry stamped with id and ts', () => {
    const entry = audit.append({ kind: 'channel_delivery', channel: 'slack-dm', status: 'delivered' });
    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(entry.ts))).toBe(false);
    expect(entry.kind).toBe('channel_delivery');
    expect(entry.status).toBe('delivered');
  });

  test('readAll returns entries in append order with fields intact', () => {
    audit.append({ kind: 'a', n: 1 });
    audit.append({ kind: 'b', n: 2 });
    audit.append({ kind: 'c', n: 3 });
    const all = audit.readAll();
    expect(all).toHaveLength(3);
    expect(all.map((e) => e.kind)).toEqual(['a', 'b', 'c']);
    expect(all.map((e) => e.n)).toEqual([1, 2, 3]);
    expect(all.every((e) => e.id && e.ts)).toBe(true);
  });

  test('disk format is JSONL: one JSON object per line', () => {
    audit.append({ kind: 'channel_delivery', status: 'delivered' });
    audit.append({ kind: 'queued' });
    const lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(JSON.parse(lines[0]).kind).toBe('channel_delivery');
  });

  test('append does not mutate the caller’s object', () => {
    const entry = { kind: 'x' };
    audit.append(entry);
    expect(entry).toEqual({ kind: 'x' }); // no id/ts leaked onto the input
  });

  test('ids are unique across appends', () => {
    const ids = new Set();
    for (let i = 0; i < 50; i++) ids.add(audit.append({ kind: 'x' }).id);
    expect(ids.size).toBe(50);
  });

  test('two handles on the same path both see all entries', () => {
    const other = createAudit(auditPath);
    audit.append({ kind: 'from-first' });
    other.append({ kind: 'from-second' });
    expect(audit.readAll().map((e) => e.kind).sort()).toEqual(['from-first', 'from-second']);
  });
});

describe('readAll edge cases', () => {
  test('readAll on a missing file returns [] (no throw)', () => {
    const fresh = createAudit(path.join(dir, 'does-not-exist-yet.jsonl'));
    expect(fresh.readAll()).toEqual([]);
  });

  test('readAll on a fresh audit returns []', () => {
    expect(audit.readAll()).toEqual([]);
  });
});

describe('seen-store (idempotency)', () => {
  test('hasSeen is false for unknown keys', () => {
    expect(audit.hasSeen('nope')).toBe(false);
  });

  test('markSeen -> hasSeen round-trips with the record id', () => {
    const entry = audit.append({ kind: 'delivery', idempotency_key: 'k1' });
    audit.markSeen('k1', entry.id);
    expect(audit.hasSeen('k1')).toBe(true);
    expect(audit.hasSeen('k2')).toBe(false);
  });

  test('seen-store survives a new handle on the same path (restart-safe dedupe)', () => {
    audit.markSeen('persist-me', 'rec-1');
    const reopened = createAudit(auditPath);
    expect(reopened.hasSeen('persist-me')).toBe(true);
  });

  test('markSeen is idempotent', () => {
    audit.markSeen('k', 'rec-1');
    audit.markSeen('k', 'rec-1');
    expect(audit.hasSeen('k')).toBe(true);
  });
});
