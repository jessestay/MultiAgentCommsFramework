// durable-x2-pruning.test.js — Cross-cutting US-X2, Phase A scope
// (Vikunja #789). The build sequence lands US-X2 WITH Phase A: the
// durability layer must not grow until it becomes the next outage.
//
// TDD RED PHASE (Oct 16, 2026): written from the acceptance criteria BEFORE
// the implementation. Contract (on utils/checkpointStore.js, see
// durable-a1-checkpoint.test.js for the store's core API):
//
//   * A checkpoint's status marks its run's lifecycle: 'running' while
//     active; terminal statuses are 'done', 'cancelled', and
//     'permanently_dead' (a permanently dead-lettered directive's final
//     checkpoint).
//   * store.pruneCompleted({ now = Date.now(), retentionMs, absoluteExpiryMs })
//       -> Promise<{ removed: number }>
//     Rules:
//       - a TERMINAL checkpoint whose updatedAt is older than
//         now - retentionMs is deleted (US-X2.1);
//       - a checkpoint of ANY status whose updatedAt is older than
//         now - absoluteExpiryMs is deleted (US-X2.3);
//       - active ('running') checkpoints inside the absolute expiry are
//         NEVER deleted (US-X2.2), and terminal checkpoints still inside
//         the retention window are kept;
//       - the return value reports exactly how many checkpoints were
//         removed (US-X2.3).
//   * saveCheckpoint's `at` payload field (ms epoch) sets updatedAt, which
//     is what makes aged checkpoints expressible in tests — production
//     callers omit it and get Date.now().

function impl(rel) {
  try { return require(rel); } catch (e) {
    throw new Error(`RED PHASE (TDD): implementation module not built yet: ${rel} — ${e.code || e.message}`);
  }
}

const DAY = 24 * 60 * 60 * 1000;
const RETENTION = 7 * DAY;
const ABSOLUTE = 90 * DAY;

function newStore() {
  const mod = impl('../../utils/checkpointStore');
  return { mod, store: mod.createCheckpointStore(mod.createMemoryAdapter()) };
}

async function seed(store, runId, status, ageMs, now) {
  await store.saveCheckpoint(runId, {
    messages: [{ role: 'user', content: `Task for ${runId}` }],
    stepIndex: 4, status, at: now - ageMs,
  });
}

// ─── TDD unit: pruning eligibility + expiry ─────────────────────────────────

describe('pruning job — eligibility and expiry (TDD)', () => {
  test('terminal checkpoints past the retention window are eligible; fresh terminal ones are not', async () => {
    const { store } = newStore();
    const now = Date.now();
    await seed(store, 'run-old-done', 'done', 10 * DAY, now);
    await seed(store, 'run-fresh-done', 'done', 1 * DAY, now);
    const { removed } = await store.pruneCompleted({ now, retentionMs: RETENTION, absoluteExpiryMs: ABSOLUTE });
    expect(removed).toBe(1);
    expect(await store.loadCheckpoint('run-old-done')).toBeNull();
    expect(await store.loadCheckpoint('run-fresh-done')).not.toBeNull();
  });

  test('every terminal status is prunable (done, cancelled, permanently_dead)', async () => {
    const { store } = newStore();
    const now = Date.now();
    await seed(store, 'run-t-done', 'done', 30 * DAY, now);
    await seed(store, 'run-t-cancelled', 'cancelled', 30 * DAY, now);
    await seed(store, 'run-t-dead', 'permanently_dead', 30 * DAY, now);
    const { removed } = await store.pruneCompleted({ now, retentionMs: RETENTION, absoluteExpiryMs: ABSOLUTE });
    expect(removed).toBe(3);
  });

  test('pruning with nothing eligible removes zero and reports zero', async () => {
    const { store } = newStore();
    const now = Date.now();
    await seed(store, 'run-live', 'running', 1 * DAY, now);
    const { removed } = await store.pruneCompleted({ now, retentionMs: RETENTION, absoluteExpiryMs: ABSOLUTE });
    expect(removed).toBe(0);
    expect(await store.loadCheckpoint('run-live')).not.toBeNull();
  });
});

// ─── BDD: US-X2 — checkpoints are pruned on a retention rule ────────────────

describe('US-X2 — checkpoints are pruned on a retention rule', () => {
  test('X2.1: a terminal task\'s checkpoint is deleted by the pruning job after the retention window', async () => {
    const { store } = newStore();
    const now = Date.now();
    await seed(store, 'run-x2-1', 'done', RETENTION + DAY, now);
    const { removed } = await store.pruneCompleted({ now, retentionMs: RETENTION, absoluteExpiryMs: ABSOLUTE });
    expect(removed).toBe(1);
    expect(await store.loadCheckpoint('run-x2-1')).toBeNull();
  });

  test('X2.2: checkpoints for still-active tasks are never deleted by the pruning job', async () => {
    const { store } = newStore();
    const now = Date.now();
    // Older than the retention window, younger than the absolute expiry:
    // only the terminal rule could touch it, and it must not.
    await seed(store, 'run-x2-2', 'running', 30 * DAY, now);
    const { removed } = await store.pruneCompleted({ now, retentionMs: RETENTION, absoluteExpiryMs: ABSOLUTE });
    expect(removed).toBe(0);
    const cp = await store.loadCheckpoint('run-x2-2');
    expect(cp).not.toBeNull();
    expect(cp.status).toBe('running');
  });

  test('X2.3: the pruning job deletes any checkpoint older than the absolute expiry regardless of state, and reports the removal count', async () => {
    const { store } = newStore();
    const now = Date.now();
    await seed(store, 'run-ancient-running', 'running', 100 * DAY, now); // absolute-expiry removal
    await seed(store, 'run-old-terminal', 'done', 30 * DAY, now);          // retention removal
    await seed(store, 'run-fresh-running', 'running', 1 * DAY, now);       // kept
    await seed(store, 'run-fresh-terminal', 'done', 1 * DAY, now);         // kept (inside retention)
    const { removed } = await store.pruneCompleted({ now, retentionMs: RETENTION, absoluteExpiryMs: ABSOLUTE });
    expect(removed).toBe(2);
    expect(await store.loadCheckpoint('run-ancient-running')).toBeNull();
    expect(await store.loadCheckpoint('run-old-terminal')).toBeNull();
    expect(await store.loadCheckpoint('run-fresh-running')).not.toBeNull();
    expect(await store.loadCheckpoint('run-fresh-terminal')).not.toBeNull();
  });
});
