// tests/ics-bus.test.js — Investor Comms Service: the fan-out bus
//
// Contract: ics/bus.js exports createBus({config, audit, surfaces, vikunja}) ->
//   { submit(payload, ctx), replayIncomplete(ctx), getDigestQueue() }
//
// submit() pipeline:
//   1. validate -> {accepted:false, reason:'validation', errors[]} (or throw)
//   2. registry check -> {accepted:false, reason:'unauthorized'}
//   3. dedupe -> same idempotency_key returns the ORIGINAL record, no re-send
//   4. lane routing -> 'outcome' is QUEUED; 'immediate'/'approval' fan out to
//      ALL registered surfaces in one relay
//   5. per-channel status recorded in audit
//   6. best-effort Vikunja addComment mirror when vikunja_task_id set —
//      mirror failure must NOT fail the delivery
//   7. all surfaces failing -> dead-letter in audit,
//      {accepted:true, delivered:false, deadLetter:true} — never silent, never throws
//
// replayIncomplete(ctx) re-sends only channels not marked delivered.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { createAudit } = require('../ics/audit');
const { createBus } = require('../ics/bus');

const CEO_CFG = { ACTING_CEO_ID: 'ceo-1', CEO_SUCCESSION: ['ceo-1', 'ceo-2'] };
const CTX = { note: 'test-ctx' };

let keyCounter = 0;
function makeKey() {
  keyCounter += 1;
  return `123e4567-e89b-42d3-a456-42661417${String(keyCounter).padStart(4, '0')}`;
}

function validPayload(overrides = {}) {
  return {
    idempotency_key: makeKey(),
    engine_id: 'ceo-1',
    type: 'immediate',
    priority: 1,
    subject: 'Subject line',
    body: 'Body text with a link https://example.com/x',
    vikunja_task_id: null,
    actions: [],
    ...overrides,
  };
}

// Recording adapter: {name, calls[], send(ctx, message)}
function recordingAdapter(name, behavior = 'delivered') {
  const calls = [];
  const adapter = {
    name,
    calls,
    async send(ctx, message) {
      calls.push({ ctx, message });
      if (behavior === 'throw') throw new Error(`${name} exploded`);
      return behavior === 'delivered' ? { status: 'delivered' } : { status: 'failed', detail: `${name} said no` };
    },
  };
  return adapter;
}

// The bus talks to surfaces through {listSurfaces(), getSurface(name)}.
function fakeSurfaces(...adapters) {
  const map = new Map(adapters.map((a) => [a.name, a]));
  return {
    listSurfaces: () => [...map.keys()],
    getSurface: (n) => map.get(n),
  };
}

function makeBus({ surfaces, vikunja, auditPath } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ics-bus-'));
  const ap = auditPath || path.join(dir, 'audit.jsonl');
  const audit = createAudit(ap);
  const bus = createBus({
    config: CEO_CFG,
    audit,
    surfaces: surfaces || fakeSurfaces(),
    vikunja: vikunja || { addComment: jest.fn(async () => ({ ok: true })) },
  });
  return { bus, audit, auditPath: ap };
}

// The spec allows submit() to either RETURN {accepted:false, reason} or THROW
// on invalid payloads — accept both, but the reason must be 'validation'.
async function expectRejected(promise, reason, fieldPattern) {
  try {
    const res = await promise;
    expect(res).toMatchObject({ accepted: false, reason });
    if (fieldPattern) expect((res.errors || []).join(' | ')).toMatch(fieldPattern);
  } catch (err) {
    expect(String(err && err.message)).toMatch(new RegExp(reason, 'i'));
  }
}

beforeEach(() => { keyCounter = 0; jest.clearAllMocks(); });

describe('submit — validation', () => {
  test('accepts a valid immediate payload and fans out to every surface', async () => {
    const a = recordingAdapter('a');
    const b = recordingAdapter('b');
    const { bus } = makeBus({ surfaces: fakeSurfaces(a, b) });
    const payload = validPayload();

    const rec = await bus.submit(payload, CTX);

    expect(rec).toMatchObject({ accepted: true, delivered: true, idempotency_key: payload.idempotency_key });
    expect(a.calls).toHaveLength(1);
    expect(b.calls).toHaveLength(1);
    // adapters receive the ctx and a message carrying the submission
    expect(a.calls[0].ctx).toBe(CTX);
    expect(a.calls[0].message).toEqual(expect.objectContaining({
      subject: payload.subject,
      body: payload.body,
      idempotency_key: payload.idempotency_key,
      engine_id: payload.engine_id,
    }));
  });

  test('rejects an invalid payload before anything is sent', async () => {
    const a = recordingAdapter('a');
    const { bus, audit } = makeBus({ surfaces: fakeSurfaces(a) });

    await expectRejected(bus.submit(validPayload({ body: '' }), CTX), 'validation', /body/i);
    expect(a.calls).toHaveLength(0);
  });

  test('rejects bad type and out-of-range priority', async () => {
    const { bus } = makeBus();
    await expectRejected(bus.submit(validPayload({ type: 'urgent' }), CTX), 'validation', /type/i);
    await expectRejected(bus.submit(validPayload({ priority: 9 }), CTX), 'validation', /priority/i);
    await expectRejected(bus.submit(validPayload({ idempotency_key: 'nope' }), CTX), 'validation', /idempotency_key/i);
  });

  test('validation runs before the registry check', async () => {
    const { bus } = makeBus();
    // bad engine AND bad body -> the rejection reason must be validation, not unauthorized
    await expectRejected(
      bus.submit(validPayload({ engine_id: 'intruder', body: '' }), CTX),
      'validation',
    );
  });
});

describe('submit — registry authorization', () => {
  test('rejects submissions from a non-active engine without sending', async () => {
    const a = recordingAdapter('a');
    const { bus, audit } = makeBus({ surfaces: fakeSurfaces(a) });

    const res = await bus.submit(validPayload({ engine_id: 'ceo-2' }), CTX);

    expect(res).toEqual(expect.objectContaining({ accepted: false, reason: 'unauthorized' }));
    expect(a.calls).toHaveLength(0);
    expect(audit.readAll().some((e) => e.kind === 'rejected' && e.reason === 'unauthorized')).toBe(true);
  });

  test('rejects unknown engines', async () => {
    const { bus } = makeBus();
    const res = await bus.submit(validPayload({ engine_id: 'mallory' }), CTX);
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe('unauthorized');
  });
});

describe('submit — dedupe', () => {
  test('same idempotency_key returns the ORIGINAL record without re-sending', async () => {
    const a = recordingAdapter('a');
    const { bus } = makeBus({ surfaces: fakeSurfaces(a) });
    const payload = validPayload();

    const rec1 = await bus.submit(payload, CTX);
    const rec2 = await bus.submit({ ...payload }, CTX); // fresh object, same key

    expect(a.calls).toHaveLength(1);
    expect(rec2.duplicate).toBe(true);
    expect(rec2.idempotency_key).toBe(rec1.idempotency_key);
    expect(rec2.channels).toEqual(rec1.channels);
    expect(rec2.delivered).toBe(rec1.delivered);
  });

  test('dedupe survives a bus restart (seen-store is on disk)', async () => {
    const a = recordingAdapter('a');
    const { bus, auditPath } = makeBus({ surfaces: fakeSurfaces(a) });
    const payload = validPayload();
    await bus.submit(payload, CTX);
    expect(a.calls).toHaveLength(1);

    const b2 = recordingAdapter('b2');
    const bus2 = createBus({
      config: CEO_CFG,
      audit: createAudit(auditPath),
      surfaces: fakeSurfaces(b2),
      vikunja: { addComment: jest.fn(async () => ({})) },
    });
    const rec = await bus2.submit(payload, CTX);
    expect(rec.duplicate).toBe(true);
    expect(b2.calls).toHaveLength(0);
  });

  test('different keys are delivered independently', async () => {
    const a = recordingAdapter('a');
    const { bus } = makeBus({ surfaces: fakeSurfaces(a) });
    await bus.submit(validPayload(), CTX);
    await bus.submit(validPayload(), CTX);
    expect(a.calls).toHaveLength(2);
  });
});

describe('submit — lane routing', () => {
  test('outcome messages are QUEUED, not fanned out', async () => {
    const a = recordingAdapter('a');
    const { bus, audit } = makeBus({ surfaces: fakeSurfaces(a) });
    const payload = validPayload({ type: 'outcome', priority: 2 });

    const rec = await bus.submit(payload, CTX);

    expect(rec).toMatchObject({ accepted: true, queued: true, delivered: false, channels: {} });
    expect(a.calls).toHaveLength(0);
    expect(audit.readAll().some((e) => e.kind === 'queued' && e.idempotency_key === payload.idempotency_key)).toBe(true);
  });

  test('getDigestQueue returns queued outcomes', async () => {
    const { bus } = makeBus();
    const p1 = validPayload({ type: 'outcome' });
    const p2 = validPayload({ type: 'outcome' });
    await bus.submit(p1, CTX);
    await bus.submit(p2, CTX);
    await bus.submit(validPayload({ type: 'immediate' }), CTX); // not queued

    const q = bus.getDigestQueue();
    expect(q).toHaveLength(2);
    expect(q.map((r) => r.idempotency_key).sort()).toEqual([p1.idempotency_key, p2.idempotency_key].sort());
  });

  test('approval fans out like immediate', async () => {
    const a = recordingAdapter('a');
    const { bus } = makeBus({ surfaces: fakeSurfaces(a) });
    const rec = await bus.submit(validPayload({ type: 'approval', priority: 2 }), CTX);
    expect(rec).toMatchObject({ accepted: true, delivered: true });
    expect(a.calls).toHaveLength(1);
  });
});

describe('submit — per-channel audit + dead letter', () => {
  test('per-channel delivery status is recorded in the audit log', async () => {
    const a = recordingAdapter('a');
    const b = recordingAdapter('b');
    const { bus, audit } = makeBus({ surfaces: fakeSurfaces(a, b) });
    const payload = validPayload();
    const rec = await bus.submit(payload, CTX);

    const deliveries = audit.readAll().filter((e) => e.kind === 'channel_delivery');
    expect(deliveries).toHaveLength(2);
    expect(deliveries.map((e) => e.channel).sort()).toEqual(['a', 'b']);
    expect(deliveries.every((e) => e.status === 'delivered' && e.idempotency_key === payload.idempotency_key)).toBe(true);
    expect(rec.channels.a.status).toBe('delivered');
    expect(rec.channels.b.status).toBe('delivered');
  });

  test('partial failure: surviving channels still deliver, no dead letter', async () => {
    const a = recordingAdapter('a', 'delivered');
    const b = recordingAdapter('b', 'failed');
    const { bus, audit } = makeBus({ surfaces: fakeSurfaces(a, b) });

    const rec = await bus.submit(validPayload(), CTX);

    expect(rec.accepted).toBe(true);
    expect(rec.delivered).toBe(true);
    expect(rec.deadLetter).toBeFalsy();
    expect(rec.channels.a.status).toBe('delivered');
    expect(rec.channels.b.status).toBe('failed');
    expect(audit.readAll().some((e) => e.kind === 'dead_letter')).toBe(false);
  });

  test('adapter throwing is caught and counted as a channel failure', async () => {
    const a = recordingAdapter('a', 'throw');
    const b = recordingAdapter('b', 'delivered');
    const { bus } = makeBus({ surfaces: fakeSurfaces(a, b) });

    const rec = await bus.submit(validPayload(), CTX);

    expect(rec.delivered).toBe(true);
    expect(rec.channels.a.status).toBe('failed');
    expect(rec.channels.a.detail).toMatch(/exploded/);
  });

  test('all surfaces failing -> dead-letter entry, never silent, never throws', async () => {
    const a = recordingAdapter('a', 'failed');
    const b = recordingAdapter('b', 'failed');
    const { bus, audit } = makeBus({ surfaces: fakeSurfaces(a, b) });
    const payload = validPayload();

    const rec = await bus.submit(payload, CTX);

    expect(rec).toMatchObject({ accepted: true, delivered: false, deadLetter: true });
    const dead = audit.readAll().filter((e) => e.kind === 'dead_letter');
    expect(dead).toHaveLength(1);
    expect(dead[0].idempotency_key).toBe(payload.idempotency_key);
  });
});

describe('submit — Vikunja mirror (best-effort)', () => {
  test('mirrors an addComment onto the Vikunja task when vikunja_task_id is set', async () => {
    const vikunja = { addComment: jest.fn(async () => ({ ok: true })) };
    const { bus } = makeBus({ vikunja });
    const rec = await bus.submit(validPayload({ vikunja_task_id: 123 }), CTX);

    expect(rec.delivered).toBe(true);
    expect(vikunja.addComment).toHaveBeenCalledTimes(1);
    const [agentId, taskId, comment] = vikunja.addComment.mock.calls[0];
    expect(typeof agentId).toBe('string');
    expect(taskId).toBe(123);
    expect(typeof comment).toBe('string');
    expect(comment.length).toBeGreaterThan(0);
  });

  test('a mirror failure does NOT fail the delivery', async () => {
    const vikunja = { addComment: jest.fn(async () => { throw new Error('vikunja is down again'); }) };
    const a = recordingAdapter('a');
    const { bus, audit } = makeBus({ surfaces: fakeSurfaces(a), vikunja });

    const rec = await bus.submit(validPayload({ vikunja_task_id: 7 }), CTX);

    expect(rec).toMatchObject({ accepted: true, delivered: true, deadLetter: false });
    expect(a.calls).toHaveLength(1);
    expect(audit.readAll().some((e) => e.kind === 'mirror_failed')).toBe(true);
  });

  test('no mirror when vikunja_task_id is null', async () => {
    const vikunja = { addComment: jest.fn(async () => ({})) };
    const { bus } = makeBus({ vikunja });
    await bus.submit(validPayload({ vikunja_task_id: null }), CTX);
    expect(vikunja.addComment).not.toHaveBeenCalled();
  });
});

describe('replayIncomplete — crash recovery', () => {
  const K = '123e4567-e89b-42d3-a456-426614179999';
  const MSG = {
    subject: 'S', body: 'B', idempotency_key: K,
    engine_id: 'ceo-1', type: 'immediate', priority: 1,
  };

  test('re-sends only channels not marked delivered', async () => {
    const a = recordingAdapter('a');
    const b = recordingAdapter('b');
    const { bus, audit } = makeBus({ surfaces: fakeSurfaces(a, b) });

    // simulate a relay crash: channel a delivered, channel b failed mid-relay
    audit.append({ kind: 'channel_delivery', idempotency_key: K, channel: 'a', status: 'delivered', message: MSG });
    audit.append({ kind: 'channel_delivery', idempotency_key: K, channel: 'b', status: 'failed', detail: 'boom', message: MSG });

    const results = await bus.replayIncomplete(CTX);

    expect(a.calls).toHaveLength(0); // already delivered -> skipped
    expect(b.calls).toHaveLength(1); // only the failed one re-attempted
    expect(b.calls[0].message).toEqual(MSG);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ idempotency_key: K, channel: 'b', status: 'delivered' });
    // the successful replay is itself audit-logged
    expect(audit.readAll().filter((e) =>
      e.kind === 'channel_delivery' && e.channel === 'b' && e.status === 'delivered')).toHaveLength(1);
  });

  test('skips keys where every channel already delivered', async () => {
    const a = recordingAdapter('a');
    const b = recordingAdapter('b');
    const { bus, audit } = makeBus({ surfaces: fakeSurfaces(a, b) });
    audit.append({ kind: 'channel_delivery', idempotency_key: K, channel: 'a', status: 'delivered', message: MSG });
    audit.append({ kind: 'channel_delivery', idempotency_key: K, channel: 'b', status: 'delivered', message: MSG });

    const results = await bus.replayIncomplete(CTX);

    expect(results).toEqual([]);
    expect(a.calls).toHaveLength(0);
    expect(b.calls).toHaveLength(0);
  });

  test('skips channels that are no longer registered (adapter uninstalled)', async () => {
    const a = recordingAdapter('a');
    const { bus, audit } = makeBus({ surfaces: fakeSurfaces(a) }); // 'ghost' not registered
    audit.append({ kind: 'channel_delivery', idempotency_key: K, channel: 'ghost', status: 'failed', message: MSG });

    const results = await bus.replayIncomplete(CTX);
    expect(results).toEqual([]);
    expect(a.calls).toHaveLength(0);
  });

  test('returns [] when there is nothing incomplete', async () => {
    const { bus } = makeBus();
    await expect(bus.replayIncomplete(CTX)).resolves.toEqual([]);
  });
});
