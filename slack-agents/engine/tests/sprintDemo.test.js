/**
 * engine/tests/sprintDemo.test.js
 *
 * TDD for Jesse's law: sprint demo check must scan ALL active projects.
 *
 * BUG (Oct 6, 2026): getActiveTasksByAgent() only scanned Vikunja project 2
 * (MACF), missing project 16 (Revenue Sprint). The CFO's "[CFO] Daily revenue
 * dashboard" task (#86) lives on project 16, so the CFO's 8-hour demo drought
 * was invisible to the monitor. The comment even said "Check MACF project (2)
 * and Revenue Sprint" but the loop was `for (const projectId of [2])`.
 *
 * BDD scenarios:
 * - Given tasks exist on project 16, when the demo check runs,
 *   then those tasks count toward agents' active work.
 * - Given an agent has tasks ONLY on project 16, when the demo check runs,
 *   then that agent appears in the agents-with-work list.
 */
'use strict';

// We need to test getActiveTasksByAgent without hitting real Vikunja.
// The module uses global fetch, so we mock it.

describe('sprintDemo project coverage', () => {
  let helpers;
  const realFetch = global.fetch;

  const project2Tasks = [
    { id: 63, title: '[CFO] Engine task', done: false,
      assignees: [{ username: 'cfo' }], updated: '2026-10-06T00:00:00Z' },
  ];
  const project16Tasks = [
    { id: 86, title: '[CFO] Daily revenue dashboard', done: false,
      assignees: [{ username: 'cfo' }], updated: '2026-10-06T00:00:00Z' },
    { id: 87, title: '[CMO] Workshop promo', done: false,
      assignees: [{ username: 'cmo' }], updated: '2026-10-06T00:00:00Z' },
  ];

  beforeEach(() => {
    jest.resetModules();
    // Mock fetch to return project-specific tasks
    global.fetch = jest.fn(async (url) => {
      const match = url.match(/\/projects\/(\d+)\/tasks/);
      const projectId = match ? parseInt(match[1], 10) : null;
      const tasks = projectId === 2 ? project2Tasks
        : projectId === 16 ? project16Tasks
        : [];
      return { ok: true, json: async () => tasks };
    });
    process.env.VIKUNJA_TOKEN = 'test-token';
    // main() no longer runs on require (guarded by require.main === module),
    // so requiring is side-effect free. Silence console anyway.
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    helpers = require('../sprintDemo');
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
    delete process.env.VIKUNJA_TOKEN;
  });

  test('fetches tasks from BOTH project 2 and project 16', async () => {
    await helpers.getActiveTasksByAgent();
    const urls = global.fetch.mock.calls.map(c => c[0]);
    const projectIds = urls
      .map(u => (u.match(/\/projects\/(\d+)\/tasks/) || [])[1])
      .filter(Boolean)
      .map(Number);

    expect(projectIds).toContain(2);
    expect(projectIds).toContain(16);
  });

  test('agent with tasks only on project 16 appears in active work', async () => {
    const tasksByAgent = await helpers.getActiveTasksByAgent();
    // CMO only has tasks on project 16 in our fixture.
    expect(Object.keys(tasksByAgent)).toContain('cmo');
    // CFO spans both projects: 1 task from #2, 1 from #16.
    expect(tasksByAgent['cfo']).toHaveLength(2);
  });
});

/**
 * TDD for the Oct 6, 2026 root-cause fixes:
 *
 * 1. JOINT COVERAGE: per-agent miss streaks on jointly-assigned standing
 *    tasks inflated to false escalations (cfo's 32-miss streak on #63, a task
 *    shared with execpm who was actively demoing it). A demo by ANY assignee
 *    of a shared task satisfies the hour for all assignees.
 *
 * 2. ESCALATION DEDUPE: demo_streak_broken gaps were re-persisted every run
 *    once a streak passed 3 (45 duplicate gaps). The escalation now persists
 *    only on the 3-crossing run.
 */
describe('sprintDemo joint coverage and escalation dedupe', () => {
  let helpers;

  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => [] }));
    process.env.VIKUNJA_TOKEN = 'test-token';
    // main() is guarded by require.main === module, so requiring is
    // side-effect free. Silence console output anyway.
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    helpers = require('../sprintDemo');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.VIKUNJA_TOKEN;
  });

  test('exports the pure helpers', () => {
    expect(typeof helpers.isJointlyCovered).toBe('function');
    expect(typeof helpers.crossesEscalationThreshold).toBe('function');
  });

  test('jointly assigned agent is covered when a co-assignee demoed this hour', () => {
    // cfo + execpm share #63; execpm demoed.
    const tasks = [{ id: 63, title: 'shared engine task', assignees: ['cfo', 'execpm'] }];
    expect(helpers.isJointlyCovered(tasks, 'cfo', new Set(['execpm']))).toBe(true);
  });

  test('sole assignee is never covered', () => {
    // cro alone on #82 — no co-assignee can cover.
    const tasks = [{ id: 82, title: 'solo task', assignees: ['cro'] }];
    expect(helpers.isJointlyCovered(tasks, 'cro', new Set(['execpm']))).toBe(false);
  });

  test('partial coverage does not count', () => {
    const tasks = [
      { id: 1, title: 'shared', assignees: ['cfo', 'execpm'] },
      { id: 2, title: 'solo', assignees: ['cfo'] },
    ];
    expect(helpers.isJointlyCovered(tasks, 'cfo', new Set(['execpm']))).toBe(false);
  });

  test('no tasks means not covered', () => {
    expect(helpers.isJointlyCovered([], 'cfo', new Set(['execpm']))).toBe(false);
  });

  test('escalation crosses threshold only once', () => {
    expect(helpers.crossesEscalationThreshold(2, 3)).toBe(true);
    expect(helpers.crossesEscalationThreshold(3, 4)).toBe(false);
    expect(helpers.crossesEscalationThreshold(32, 33)).toBe(false);
    expect(helpers.crossesEscalationThreshold(0, 1)).toBe(false);
  });
});
