/**
 * engine/tests/workEngine-strikes.test.js
 *
 * TDD for the Oct 12, 2026 starvation fix: workTask() returned early on LLM
 * failure WITHOUT recording lastWorked, so the candidate picker re-selected
 * the same failing task every cycle forever (task #11: 71 consecutive
 * attempts, 40 tasks starved).
 *
 * BDD scenarios:
 * - Given a task fails 3 times in 4h, when the picker runs, then the task
 *   is parked (isParked true) and skipped.
 * - Given recordAttempt(taskId, false) is called, when checked, then
 *   lastWorked is set even though the work failed.
 * - Given recordAttempt(taskId, true) is called after failures, when
 *   checked, then strikes are cleared and the task is unparked.
 * - Given strikes older than 4h, when isParked is checked, then they are
 *   expired and the task is not parked.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('workEngine failure-strike system (starvation fix)', () => {
  let workEngine;
  let state;
  let tmpStateDir;

  beforeEach(() => {
    jest.resetModules();
    // Isolate the state store in a temp dir so tests never touch real state.
    tmpStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'we-strikes-'));
    process.env.MACF_STATE_DIR = tmpStateDir;
    state = require('../../utils/state');
    workEngine = require('../workEngine');
  });

  afterEach(() => {
    delete process.env.MACF_STATE_DIR;
    fs.rmSync(tmpStateDir, { recursive: true, force: true });
  });

  test('failed attempt still records lastWorked', () => {
    workEngine.recordAttempt(999, false);
    const last = state.get('workEngine', 'lastWorked.999');
    expect(last).toBeTruthy();
    expect(new Date(last).getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('3 failures in 4h parks the task', () => {
    workEngine.recordAttempt(1001, false);
    workEngine.recordAttempt(1001, false);
    expect(workEngine.isParked(1001)).toBe(false);
    workEngine.recordAttempt(1001, false);
    expect(workEngine.isParked(1001)).toBe(true);
  });

  test('success clears strikes and unparks', () => {
    workEngine.recordAttempt(1002, false);
    workEngine.recordAttempt(1002, false);
    workEngine.recordAttempt(1002, false);
    expect(workEngine.isParked(1002)).toBe(true);
    workEngine.recordAttempt(1002, true);
    expect(workEngine.isParked(1002)).toBe(false);
  });

  test('strikes older than 4h expire', () => {
    const old = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
    state.set('workEngine', 'failStrikes.1003', [old, old, old]);
    expect(workEngine.isParked(1003)).toBe(false);
  });

  test('relay queue enqueues and drains FIFO with cap', () => {
    const items = workEngine.drainRelayQueue();
    expect(items).toEqual([]);
    workEngine.enqueueRelay({ taskId: 1, title: 't', agent: 'cmo', deliverable: 'd', done: true, ts: 'x' });
    workEngine.enqueueRelay({ taskId: 2, title: 't', agent: 'cfo', deliverable: 'd', done: false, ts: 'y' });
    const drained = workEngine.drainRelayQueue();
    expect(drained.length).toBe(2);
    expect(drained[0].taskId).toBe(1);
    expect(workEngine.drainRelayQueue()).toEqual([]);
  });
});
