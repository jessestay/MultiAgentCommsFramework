/**
 * engine/tests/kernel-m5-timeout.test.js
 *
 * M5 of the execution kernel (Vikunja #771) — stalls become failures.
 * Spec: EXECUTION-KERNEL-SPEC.md, US-8 (gateway resilience at the work
 * layer): a hung execution must fail as an attempt, not wedge the cycle.
 *
 * BDD scenarios:
 * - Given an execution that settles within the bound, when it is wrapped
 *   in the execution timeout, then its value passes through unchanged.
 * - Given an execution that never settles (a wedged model/tool call),
 *   when the bound expires, then the wrapper rejects with an
 *   execution_timeout error, so workTask's existing failure path records
 *   the attempt and the cycle is released.
 * - Given an execution that rejects on its own, then that rejection
 *   propagates unchanged (not masked as a timeout).
 */
'use strict';

const { withExecutionTimeout } = require('../workEngine');

describe('M5 withExecutionTimeout: a hung execution becomes a failed attempt', () => {
  test('Given a prompt execution, then its value passes through', async () => {
    await expect(withExecutionTimeout(Promise.resolve(42), 1000, 'task #1')).resolves.toBe(42);
  });

  test('Given an execution that never settles, then it rejects as execution_timeout', async () => {
    const never = new Promise(() => {});
    await expect(withExecutionTimeout(never, 25, 'task #99')).rejects.toThrow(/execution_timeout/);
  });

  test('Given an execution that rejects itself, then the original error propagates', async () => {
    const boom = Promise.reject(new Error('gateway exploded'));
    boom.catch(() => {}); // keep the pre-fix failing state from crashing on an unhandled rejection
    await expect(withExecutionTimeout(boom, 1000, 'task #2')).rejects.toThrow('gateway exploded');
  });
});
