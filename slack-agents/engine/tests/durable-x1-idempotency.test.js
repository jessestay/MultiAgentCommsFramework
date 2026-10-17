// durable-x1-idempotency.test.js — Cross-cutting US-X1, Phase A scope
// (Vikunja #789). The build sequence lands US-X1 WITH Phase A: resumed
// steps are unsafe without it, because every engine in this stack delivers
// at-least-once and a resumed step can re-run.
//
// TDD RED PHASE (Oct 16, 2026): written from the acceptance criteria BEFORE
// the implementation. Contract:
//
//   * NEW MODULE utils/idempotency.js exporting:
//       deriveIdempotencyKey(runId, stepIdentity) -> string
//         Deterministic: same inputs -> same key, across processes and
//         restarts (no randomness, no timestamps). Different run or step
//         -> different key.
//       createIdempotencyLedger() -> ledger (in-memory implementation of
//         the ledger contract; the production adapter persists the same
//         shape — intent/completion records keyed by idempotency key):
//         recordIntent(key, meta?)          -> records status 'intended'
//         recordCompletion(key, result)     -> records status 'completed'
//                                              with the step's result
//         lookup(key) -> { status: 'none' }
//                      | { status: 'intended', meta }
//                      | { status: 'completed', result }
//       executeIdempotentStep({ ledger, key, checkExternal, perform })
//         -> Promise<{ result, skipped, recoveredViaExternal? }>
//         Semantics:
//           - key already completed: perform is NOT called (and
//             checkExternal is NOT called); the recorded result is
//             returned with skipped: true. (US-X1.2)
//           - key intended but not completed (a previous run crashed —
//             possibly AFTER its side effect): checkExternal(key) is
//             consulted BEFORE any re-attempt. If it reports the effect
//             exists ({ found: true, result }), completion is recorded
//             from it and perform is NOT called. If it reports not found,
//             the step proceeds to perform. (US-X1.3)
//           - new key: intent is recorded BEFORE perform runs — inside
//             perform, lookup(key).status is already 'intended' — then
//             completion is recorded with perform's result. (US-X1.1)

function impl(rel) {
  try { return require(rel); } catch (e) {
    throw new Error(`RED PHASE (TDD): implementation module not built yet: ${rel} — ${e.code || e.message}`);
  }
}

// ─── TDD unit: idempotency-key derivation + completion ledger ───────────────

describe('idempotency-key derivation + completion ledger (TDD)', () => {
  test('deriveIdempotencyKey is deterministic and scoped by run and step', () => {
    const { deriveIdempotencyKey } = impl('../../utils/idempotency');
    const k1 = deriveIdempotencyKey('run-1', 'step:fileWrite:out.md');
    const k2 = deriveIdempotencyKey('run-1', 'step:fileWrite:out.md');
    expect(k1).toBe(k2);
    expect(typeof k1).toBe('string');
    expect(k1.length).toBeGreaterThan(0);
    expect(deriveIdempotencyKey('run-2', 'step:fileWrite:out.md')).not.toBe(k1);
    expect(deriveIdempotencyKey('run-1', 'step:fileWrite:other.md')).not.toBe(k1);
  });

  test('the ledger tracks none → intended → completed with the recorded result', async () => {
    const { createIdempotencyLedger } = impl('../../utils/idempotency');
    const ledger = createIdempotencyLedger();
    expect(await ledger.lookup('k-none')).toEqual({ status: 'none' });
    await ledger.recordIntent('k-1', { step: 'fileWrite' });
    expect((await ledger.lookup('k-1')).status).toBe('intended');
    await ledger.recordCompletion('k-1', { ref: 'msg-123' });
    const done = await ledger.lookup('k-1');
    expect(done.status).toBe('completed');
    expect(done.result).toEqual({ ref: 'msg-123' });
    // Other keys are unaffected.
    expect((await ledger.lookup('k-2')).status).toBe('none');
  });
});

// ─── BDD: US-X1 — side-effecting steps are idempotent ───────────────────────

describe('US-X1 — side-effecting steps are idempotent', () => {
  test('X1.1: the idempotency key is recorded (intent) BEFORE the side effect is attempted', async () => {
    const { createIdempotencyLedger, executeIdempotentStep, deriveIdempotencyKey } = impl('../../utils/idempotency');
    const ledger = createIdempotencyLedger();
    const key = deriveIdempotencyKey('run-x1', 'step:post:announcement');
    let statusDuringPerform = null;
    const out = await executeIdempotentStep({
      ledger, key,
      checkExternal: async () => ({ found: false }),
      perform: async () => {
        statusDuringPerform = (await ledger.lookup(key)).status;
        return { ref: 'msg-123' };
      },
    });
    expect(statusDuringPerform).toBe('intended');
    expect(out).toEqual({ result: { ref: 'msg-123' }, skipped: false });
    expect((await ledger.lookup(key)).status).toBe('completed');
  });

  test('X1.2: a step whose key is already completed is skipped and the recorded result returned instead', async () => {
    const { createIdempotencyLedger, executeIdempotentStep } = impl('../../utils/idempotency');
    const ledger = createIdempotencyLedger();
    await ledger.recordIntent('k-done', {});
    await ledger.recordCompletion('k-done', { ref: 'already-posted' });
    const perform = jest.fn(async () => ({ ref: 'DUPLICATE' }));
    const checkExternal = jest.fn(async () => ({ found: false }));
    const out = await executeIdempotentStep({ ledger, key: 'k-done', checkExternal, perform });
    expect(perform).not.toHaveBeenCalled();
    expect(checkExternal).not.toHaveBeenCalled();
    expect(out.skipped).toBe(true);
    expect(out.result).toEqual({ ref: 'already-posted' });
  });

  test('X1.3: a step that crashed after its side effect checks the external system for the key before re-attempting', async () => {
    const { createIdempotencyLedger, executeIdempotentStep } = impl('../../utils/idempotency');
    const ledger = createIdempotencyLedger();
    // Previous run: intent recorded, side effect happened, process died
    // before completion was recorded.
    await ledger.recordIntent('k-crashed', {});
    const perform = jest.fn(async () => ({ ref: 'DUPLICATE' }));
    const out = await executeIdempotentStep({
      ledger, key: 'k-crashed',
      checkExternal: async (key) => {
        expect(key).toBe('k-crashed');
        return { found: true, result: { ref: 'external-msg-9' } };
      },
      perform,
    });
    expect(perform).not.toHaveBeenCalled();
    expect(out.skipped).toBe(true);
    expect(out.result).toEqual({ ref: 'external-msg-9' });
    // The externally-verified completion is now recorded in the ledger.
    expect((await ledger.lookup('k-crashed')).status).toBe('completed');
  });

  test('X1.3b: when the external check finds no effect, the crashed step is re-attempted', async () => {
    const { createIdempotencyLedger, executeIdempotentStep } = impl('../../utils/idempotency');
    const ledger = createIdempotencyLedger();
    await ledger.recordIntent('k-crashed-clean', {});
    const perform = jest.fn(async () => ({ ref: 'fresh-msg' }));
    const out = await executeIdempotentStep({
      ledger, key: 'k-crashed-clean',
      checkExternal: async () => ({ found: false }),
      perform,
    });
    expect(perform).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ result: { ref: 'fresh-msg' }, skipped: false });
    expect((await ledger.lookup('k-crashed-clean')).status).toBe('completed');
  });
});
