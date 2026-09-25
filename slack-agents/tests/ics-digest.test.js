// tests/ics-digest.test.js — Investor Comms Service: outcomes digest
//
// Contract: ics/digest.js exports
//   queueOutcome(record)            — stage a submitted outcome delivery record
//   buildDigest() -> string         — single composed text (outcome-first, short,
//                                     bullets); '' when the queue is empty
//   drainDigest(bus, ctx) -> {drained} — submits the digest through the bus and
//                                     clears the queue; {drained:0} sends nothing
// The drained digest must fan out (type immediate|approval), never re-queue as
// an outcome. Queue state is module-level; tests re-require per test.
'use strict';

let digest;

function outcomeRecord(n, overrides = {}) {
  return {
    accepted: true,
    queued: true,
    delivered: false,
    idempotency_key: `123e4567-e89b-42d3-a456-42661417${String(n).padStart(4, '0')}`,
    engine_id: 'ceo-1',
    type: 'outcome',
    priority: 2,
    subject: `Outcome ${n}`,
    body: `Body of outcome ${n}: https://example.com/${n}`,
    vikunja_task_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetModules();
  digest = require('../ics/digest');
});

describe('queueOutcome / buildDigest', () => {
  test('buildDigest composes one text with every queued outcome as a bullet', () => {
    digest.queueOutcome(outcomeRecord(1));
    digest.queueOutcome(outcomeRecord(2));
    const text = digest.buildDigest();
    expect(typeof text).toBe('string');
    expect(text).toMatch(/digest/i);
    expect(text).toContain('- Outcome 1');
    expect(text).toContain('- Outcome 2');
  });

  test('buildDigest includes the outcome bodies, kept short', () => {
    digest.queueOutcome(outcomeRecord(1));
    const text = digest.buildDigest();
    expect(text).toContain('Body of outcome 1');
    expect(text.length).toBeLessThan(2000);
  });

  test('buildDigest returns empty string when nothing is queued', () => {
    expect(digest.buildDigest()).toBe('');
  });
});

describe('drainDigest', () => {
  function fakeBus() {
    return { submit: jest.fn(async (payload) => ({ accepted: true, delivered: true, payload })) };
  }

  test('empty queue -> {drained:0} and sends nothing', async () => {
    const bus = fakeBus();
    const res = await digest.drainDigest(bus, { engineId: 'ceo-1' });
    expect(res).toEqual({ drained: 0 });
    expect(bus.submit).not.toHaveBeenCalled();
  });

  test('drains the queue through the bus as a fanning-out digest', async () => {
    const bus = fakeBus();
    digest.queueOutcome(outcomeRecord(1));
    digest.queueOutcome(outcomeRecord(2));

    const res = await digest.drainDigest(bus, { engineId: 'ceo-1' });

    expect(res).toEqual({ drained: 2 });
    expect(bus.submit).toHaveBeenCalledTimes(1);
    const payload = bus.submit.mock.calls[0][0];
    expect(payload.type).not.toBe('outcome'); // must fan out, never re-queue
    expect(['immediate', 'approval']).toContain(payload.type);
    expect(payload.body).toContain('Outcome 1');
    expect(payload.body).toContain('Outcome 2');
    expect(payload.engine_id).toBe('ceo-1');
  });

  test('drain clears the queue: second drain sends nothing', async () => {
    const bus = fakeBus();
    digest.queueOutcome(outcomeRecord(3));
    await digest.drainDigest(bus, { engineId: 'ceo-1' });
    expect(digest.buildDigest()).toBe('');

    const res = await digest.drainDigest(bus, { engineId: 'ceo-1' });
    expect(res).toEqual({ drained: 0 });
    expect(bus.submit).toHaveBeenCalledTimes(1);
  });

  test('a failing bus submit propagates (queue is NOT silently dropped)', async () => {
    const bus = { submit: jest.fn(async () => { throw new Error('bus down'); }) };
    digest.queueOutcome(outcomeRecord(4));
    await expect(digest.drainDigest(bus, { engineId: 'ceo-1' })).rejects.toThrow('bus down');
    // still queued — nothing was lost
    expect(digest.buildDigest()).toContain('Outcome 4');
  });
});
