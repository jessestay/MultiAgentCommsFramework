// tests/ics-mcp.test.js — Investor Comms Service: MCP-style interface
//
// Contract: ics/mcp.js exports
//   notify_investor(args, deps) -> validates + submits via bus, returns the
//       delivery record. deps = {bus, ctx}. Mints idempotency_key when absent.
//   delivery_status({idempotency_key}, deps) -> audit lookup with per-channel
//       status and dead-letter flag; {found:false} for unknown keys.
//       deps = {audit}.
//   investor_reply({surface, replyTo, body}, deps) -> records the reply in the
//       audit log + queues it to the CEO inbox; getCeoInbox() returns it;
//       returns {recorded:true}. deps = {audit}.
//   getCeoInbox() -> queued investor replies (module-level; tests re-require).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { createAudit } = require('../ics/audit');
const { createBus } = require('../ics/bus');

const CEO_CFG = { ACTING_CEO_ID: 'ceo-1', CEO_SUCCESSION: ['ceo-1', 'ceo-2'] };
const CTX = {};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let mcp;
let bus;
let audit;

function recordingAdapter(name, behavior = 'delivered') {
  return {
    name,
    async send() {
      return behavior === 'delivered' ? { status: 'delivered' } : { status: 'failed', detail: 'nope' };
    },
  };
}

function validArgs(overrides = {}) {
  return {
    engine_id: 'ceo-1',
    type: 'immediate',
    priority: 1,
    subject: 'Ping',
    body: 'Jesse-gated item: https://example.com/approve',
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetModules();
  mcp = require('../ics/mcp');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ics-mcp-'));
  audit = createAudit(path.join(dir, 'audit.jsonl'));
  const map = new Map([['sink', recordingAdapter('sink')]]);
  bus = createBus({
    config: CEO_CFG,
    audit,
    surfaces: { listSurfaces: () => [...map.keys()], getSurface: (n) => map.get(n) },
    vikunja: { addComment: jest.fn(async () => ({})) },
  });
});

describe('notify_investor', () => {
  test('validates and submits through the bus, returning the delivery record', async () => {
    const rec = await mcp.notify_investor(validArgs(), { bus, ctx: CTX });
    expect(rec).toMatchObject({ accepted: true, delivered: true });
    expect(rec.idempotency_key).toMatch(UUID_RE);
  });

  test('mints an idempotency_key when the caller does not supply one', async () => {
    const rec = await mcp.notify_investor(validArgs(), { bus, ctx: CTX });
    expect(rec.idempotency_key).toMatch(UUID_RE);
  });

  test('uses a caller-supplied idempotency_key when present', async () => {
    const key = '123e4567-e89b-42d3-a456-426614174000';
    const rec = await mcp.notify_investor(validArgs({ idempotency_key: key }), { bus, ctx: CTX });
    expect(rec.idempotency_key).toBe(key);
  });

  test('invalid args are rejected, not submitted', async () => {
    const rec = await mcp.notify_investor(validArgs({ type: 'bogus' }), { bus, ctx: CTX });
    expect(rec.accepted).toBe(false);
    expect(rec.reason).toBe('validation');
  });

  test('non-CEO engines are rejected', async () => {
    const rec = await mcp.notify_investor(validArgs({ engine_id: 'mallory' }), { bus, ctx: CTX });
    expect(rec).toMatchObject({ accepted: false, reason: 'unauthorized' });
  });
});

describe('delivery_status', () => {
  test('returns per-channel status and the dead-letter flag after a delivery', async () => {
    const rec = await mcp.notify_investor(validArgs(), { bus, ctx: CTX });
    const status = await mcp.delivery_status({ idempotency_key: rec.idempotency_key }, { audit });
    expect(status).toMatchObject({
      found: true,
      idempotency_key: rec.idempotency_key,
      deadLetter: false,
    });
    expect(status.channels.sink.status).toBe('delivered');
  });

  test('surfaces the dead-letter flag when every channel failed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ics-mcp-dl-'));
    const audit2 = createAudit(path.join(dir, 'audit.jsonl'));
    const map = new Map([['bad', recordingAdapter('bad', 'failed')]]);
    const bus2 = createBus({
      config: CEO_CFG,
      audit: audit2,
      surfaces: { listSurfaces: () => [...map.keys()], getSurface: (n) => map.get(n) },
      vikunja: { addComment: jest.fn(async () => ({})) },
    });
    const rec = await mcp.notify_investor(validArgs(), { bus: bus2, ctx: CTX });
    expect(rec.deadLetter).toBe(true);
    const status = await mcp.delivery_status({ idempotency_key: rec.idempotency_key }, { audit: audit2 });
    expect(status).toMatchObject({ found: true, deadLetter: true });
    expect(status.channels.bad.status).toBe('failed');
  });

  test('unknown key -> {found:false}', async () => {
    const status = await mcp.delivery_status(
      { idempotency_key: '123e4567-e89b-42d3-a456-426614174000' },
      { audit },
    );
    expect(status).toEqual({ found: false });
  });
});

describe('investor_reply / getCeoInbox', () => {
  test('records the reply and queues it to the CEO inbox', async () => {
    const res = await mcp.investor_reply(
      { surface: 'muse-chat', replyTo: 'key-1', body: 'Approved — go ahead.' },
      { audit },
    );
    expect(res).toEqual({ recorded: true });

    const inbox = mcp.getCeoInbox();
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      surface: 'muse-chat',
      replyTo: 'key-1',
      body: 'Approved — go ahead.',
    });
    expect(Number.isNaN(Date.parse(inbox[0].ts))).toBe(false);

    const logged = audit.readAll().filter((e) => e.kind === 'investor_reply');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ surface: 'muse-chat', replyTo: 'key-1' });
  });

  test('inbox accumulates replies in order', async () => {
    await mcp.investor_reply({ surface: 'slack-dm', replyTo: 'k1', body: 'one' }, { audit });
    await mcp.investor_reply({ surface: 'slice', replyTo: 'k2', body: 'two' }, { audit });
    const inbox = mcp.getCeoInbox();
    expect(inbox.map((r) => r.body)).toEqual(['one', 'two']);
  });

  test('missing body is rejected, nothing recorded', async () => {
    const res = await mcp.investor_reply({ surface: 'muse-chat', replyTo: 'k1', body: '' }, { audit });
    expect(res).toEqual(expect.objectContaining({ recorded: false }));
    expect(mcp.getCeoInbox()).toHaveLength(0);
    expect(audit.readAll().filter((e) => e.kind === 'investor_reply')).toHaveLength(0);
  });

  test('getCeoInbox returns a copy (mutating it does not drain the inbox)', async () => {
    await mcp.investor_reply({ surface: 'muse-chat', replyTo: 'k1', body: 'hi' }, { audit });
    mcp.getCeoInbox().pop();
    expect(mcp.getCeoInbox()).toHaveLength(1);
  });
});
