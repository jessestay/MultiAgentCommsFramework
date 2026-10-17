/**
 * engine/tests/kernel-m4-healer.test.js
 *
 * M4 of the execution kernel (Vikunja #771) — the self-healer verify loop.
 * Spec: EXECUTION-KERNEL-SPEC.md, US-7 (healer verify loop).
 *
 * BDD scenarios:
 * - Given a repair whose verification test exists, when the healer verifies
 *   it, then a passing test yields TRUE (closed) and a failing or erroring
 *   test yields 'initiated' (still open — never silently closed).
 * - Given prior repairs stuck at 'initiated', when a later cycle re-checks
 *   them, then entries whose test now passes become verified, entries still
 *   failing stay open with a recheck count, and entries that keep failing
 *   past 24 hours escalate to 'needs_ceo' instead of sitting invisible.
 * - Entries with no verification test (e.g. LOW_QUALITY) and entries already
 *   in a terminal state are left untouched by the re-check pass.
 */
'use strict';

const healer = require('../self-healer');
const { VERIFICATION_TESTS, verifyWithTest, recheckInitiatedRepairs } = healer;

const HOUR = 3600 * 1000;

function entry(over = {}) {
  return {
    timestamp: new Date(Date.now() - HOUR).toISOString(),
    issueType: 'STALE_TASKS',
    severity: 'high',
    action: 'test repair',
    verification: 'initiated',
    taskIds: [1],
    ...over,
  };
}

describe('M4 verifyWithTest: a repair closes only on a passed test', () => {
  const origStale = VERIFICATION_TESTS.STALE_TASKS;
  afterEach(() => { VERIFICATION_TESTS.STALE_TASKS = origStale; });

  test('Given a passing verification test, then the result is true', async () => {
    VERIFICATION_TESTS.STALE_TASKS = async () => true;
    await expect(verifyWithTest('STALE_TASKS')).resolves.toBe(true);
  });
  test('Given a failing verification test, then the repair stays initiated (open)', async () => {
    VERIFICATION_TESTS.STALE_TASKS = async () => false;
    await expect(verifyWithTest('STALE_TASKS')).resolves.toBe('initiated');
  });
  test('Given a verification test that errors, then the repair stays initiated', async () => {
    VERIFICATION_TESTS.STALE_TASKS = async () => { throw new Error('monitor down'); };
    await expect(verifyWithTest('STALE_TASKS')).resolves.toBe('initiated');
  });
  test('Given an issue type with no verification test, then the result is initiated', async () => {
    await expect(verifyWithTest('LOW_QUALITY')).resolves.toBe('initiated');
  });
});

describe('M4 recheckInitiatedRepairs: prior initiated repairs get resolved', () => {
  test('Given an initiated entry whose test now passes, then it becomes verified', async () => {
    const log = { repairs: [entry()], lastHeal: null };
    const tests = { STALE_TASKS: async () => true };
    const summary = await recheckInitiatedRepairs(log, tests, Date.now());
    expect(log.repairs[0].verification).toBe(true);
    expect(log.repairs[0].verifiedAt).toBeTruthy();
    expect(summary.verified).toBe(1);
  });

  test('Given an initiated entry whose test still fails and is young, then it stays initiated with a recheck count', async () => {
    const log = { repairs: [entry()], lastHeal: null };
    const tests = { STALE_TASKS: async () => false };
    const summary = await recheckInitiatedRepairs(log, tests, Date.now());
    expect(log.repairs[0].verification).toBe('initiated');
    expect(log.repairs[0].rechecks).toBe(1);
    expect(summary.stillPending).toBe(1);
    expect(summary.escalated).toBe(0);
  });

  test('Given an old entry that keeps failing, then it escalates to needs_ceo', async () => {
    const old = entry({
      timestamp: new Date(Date.now() - 30 * HOUR).toISOString(),
      rechecks: 1,
    });
    const log = { repairs: [old], lastHeal: null };
    const tests = { STALE_TASKS: async () => false };
    const summary = await recheckInitiatedRepairs(log, tests, Date.now());
    expect(log.repairs[0].verification).toBe('needs_ceo');
    expect(summary.escalated).toBe(1);
  });

  test('Given entries with no test or in terminal states, then they are untouched', async () => {
    const noTest = entry({ issueType: 'LOW_QUALITY' });
    const done = entry({ verification: true });
    const log = { repairs: [noTest, done], lastHeal: null };
    const summary = await recheckInitiatedRepairs(log, {}, Date.now());
    expect(log.repairs[0].verification).toBe('initiated');
    expect(log.repairs[0].rechecks).toBeUndefined();
    expect(log.repairs[1].verification).toBe(true);
    expect(summary.verified + summary.escalated + summary.stillPending).toBe(0);
  });

  test('Given a test that errors during re-check, then the entry stays initiated', async () => {
    const log = { repairs: [entry()], lastHeal: null };
    const tests = { STALE_TASKS: async () => { throw new Error('vikunja down'); } };
    const summary = await recheckInitiatedRepairs(log, tests, Date.now());
    expect(log.repairs[0].verification).toBe('initiated');
    expect(summary.stillPending).toBe(1);
  });
});
