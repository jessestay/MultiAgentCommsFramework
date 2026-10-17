/**
 * engine/tests/sprintDemo-honest.test.js
 *
 * TDD for the Oct 12, 2026 P0.2 fix: checkRecentDemos() used to read
 * .agent-health.json (lastActivity + lifetime directivesCompleted), which the
 * hourly autonomous pulse-runner bumps every hour — so every check reported
 * "all agents demoed" while zero real work shipped.
 *
 * New contract: a demo is TASK-LINKED OUTPUT — the work engine posted a
 * deliverable as the agent within the window (state: workEngine/lastDemo.*).
 * Heartbeats no longer count.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('sprintDemo honest demo detection (P0.2)', () => {
  let sprintDemo;
  let state;
  let tmpStateDir;

  beforeEach(() => {
    jest.resetModules();
    tmpStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-honest-'));
    process.env.MACF_STATE_DIR = tmpStateDir;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    state = require('../../utils/state');
    sprintDemo = require('../sprintDemo');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.MACF_STATE_DIR;
    fs.rmSync(tmpStateDir, { recursive: true, force: true });
  });

  test('agent with recent work-engine deliverable counts as demoed', async () => {
    state.set('workEngine', 'lastDemo.cmo', new Date().toISOString());
    state.set('workEngine', 'lastDemoTask.cmo', 81);
    const demos = await sprintDemo.checkRecentDemos();
    expect(demos.cmo).toBeTruthy();
    expect(demos.cmo.taskId).toBe(81);
  });

  test('agent with only heartbeat activity does NOT count as demoed', async () => {
    // Simulate: health file shows recent activity, but work engine never
    // posted a deliverable for this agent. No lastDemo state set.
    const demos = await sprintDemo.checkRecentDemos();
    expect(demos.cfo).toBeFalsy();
    expect(demos.execpm).toBeFalsy();
  });

  test('stale lastDemo (older than 2h) does not count', async () => {
    state.set('workEngine', 'lastDemo.cto', new Date(Date.now() - 3 * 3600 * 1000).toISOString());
    const demos = await sprintDemo.checkRecentDemos();
    expect(demos.cto).toBeFalsy();
  });

  test('fresh lastDemo within window counts', async () => {
    state.set('workEngine', 'lastDemo.cro', new Date(Date.now() - 90 * 60 * 1000).toISOString());
    const demos = await sprintDemo.checkRecentDemos();
    expect(demos.cro).toBeTruthy();
  });
});
