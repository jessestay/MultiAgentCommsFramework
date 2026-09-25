// tests/ics-client.test.js — Investor Comms Service: thin per-engine submit client
//
// Contract: ics/client.js exports
//   createSubmit({engine_id, type, priority, subject, body, ...}) -> payload
// with a fresh idempotency_key minted via crypto.randomUUID() on every call.
'use strict';

const crypto = require('crypto');
const { createSubmit } = require('../ics/client');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fields(overrides = {}) {
  return {
    engine_id: 'jarvis-jr',
    type: 'immediate',
    priority: 1,
    subject: 'Heads up',
    body: 'Something needs you: https://example.com/x',
    ...overrides,
  };
}

describe('createSubmit', () => {
  test('mints a fresh UUID idempotency_key on every call', () => {
    const a = createSubmit(fields());
    const b = createSubmit(fields());
    expect(a.idempotency_key).toMatch(UUID_RE);
    expect(b.idempotency_key).toMatch(UUID_RE);
    expect(a.idempotency_key).not.toBe(b.idempotency_key);
  });

  test('mints the key via crypto.randomUUID()', () => {
    const spy = jest.spyOn(crypto, 'randomUUID');
    try {
      createSubmit(fields());
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  test('passes through all submission fields', () => {
    const p = createSubmit(fields({
      vikunja_task_id: 99,
      actions: [{ label: 'Open', url: 'https://example.com/x' }],
    }));
    expect(p).toMatchObject({
      engine_id: 'jarvis-jr',
      type: 'immediate',
      priority: 1,
      subject: 'Heads up',
      body: expect.stringContaining('example.com'),
      vikunja_task_id: 99,
      actions: [{ label: 'Open', url: 'https://example.com/x' }],
    });
  });

  test('always mints a fresh key even if the caller supplies one', () => {
    const p = createSubmit(fields({ idempotency_key: 'caller-supplied' }));
    expect(p.idempotency_key).toMatch(UUID_RE);
    expect(p.idempotency_key).not.toBe('caller-supplied');
  });

  test('does not mutate the caller’s input object', () => {
    const input = fields();
    createSubmit(input);
    expect(input).not.toHaveProperty('idempotency_key');
    expect(input).toEqual(fields());
  });

  test('returns a new object per call', () => {
    const a = createSubmit(fields());
    const b = createSubmit(fields());
    expect(a).not.toBe(b);
  });
});
