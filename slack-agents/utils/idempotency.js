// utils/idempotency.js — Cross-cutting US-X1, landed with Phase A
// (Vikunja #789).
//
// Every engine in this stack delivers at-least-once: a resumed or retried
// step can re-run. Any step with an external side effect (send, post,
// pay, file write outside the sandbox) must therefore be idempotent:
//
//   1. Its key is derived deterministically from the run ID + step
//      identity (same inputs -> same key, across processes and restarts;
//      no randomness, no timestamps) and recorded as INTENT before the
//      side effect is attempted.
//   2. If the key is already recorded COMPLETED, the step is skipped and
//      the recorded result is returned instead — never re-executed.
//   3. If the key is INTENDED but not completed, a previous run may have
//      crashed AFTER its side effect but before recording completion:
//      the external system is checked for the key BEFORE any re-attempt,
//      and a found effect is recorded as the completion.
//
// createIdempotencyLedger() is the in-memory implementation of the
// ledger contract; the production adapter persists the same
// intent/completion record shape keyed by idempotency key.

const crypto = require('crypto');

function deriveIdempotencyKey(runId, stepIdentity) {
  const hash = crypto.createHash('sha256')
    .update(`${String(runId)}\n${String(stepIdentity)}`)
    .digest('hex');
  return `idem_${hash.slice(0, 32)}`;
}

function createIdempotencyLedger() {
  const records = new Map();
  return {
    async recordIntent(key, meta) {
      // Intent is recorded once; a completed key is never downgraded.
      if (!records.has(key)) {
        records.set(key, { status: 'intended', meta: meta || {} });
      }
    },
    async recordCompletion(key, result) {
      records.set(key, { status: 'completed', result });
    },
    async lookup(key) {
      const rec = records.get(key);
      if (!rec) return { status: 'none' };
      if (rec.status === 'completed') return { status: 'completed', result: rec.result };
      return { status: 'intended', meta: rec.meta };
    },
  };
}

async function executeIdempotentStep({ ledger, key, checkExternal, perform }) {
  if (!ledger || typeof ledger.lookup !== 'function') {
    throw new Error('executeIdempotentStep requires an idempotency ledger');
  }
  if (typeof perform !== 'function') {
    throw new Error('executeIdempotentStep requires a perform function');
  }
  const before = await ledger.lookup(key);
  if (before.status === 'completed') {
    // Already done in a previous run — return the recorded result
    // without touching the external system at all.
    return { result: before.result, skipped: true };
  }
  if (before.status === 'intended') {
    // A previous run crashed mid-step. It may have crashed AFTER the
    // side effect landed — check the external system before re-trying.
    if (typeof checkExternal === 'function') {
      const ext = await checkExternal(key);
      if (ext && ext.found) {
        await ledger.recordCompletion(key, ext.result);
        return { result: ext.result, skipped: true, recoveredViaExternal: true };
      }
    }
    const result = await perform();
    await ledger.recordCompletion(key, result);
    return { result, skipped: false };
  }
  // New step: intent is recorded BEFORE the side effect is attempted.
  await ledger.recordIntent(key, {});
  const result = await perform();
  await ledger.recordCompletion(key, result);
  return { result, skipped: false };
}

module.exports = { deriveIdempotencyKey, createIdempotencyLedger, executeIdempotentStep };
