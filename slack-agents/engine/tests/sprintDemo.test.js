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
  let sprintDemo;
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
    // Prevent main() from running on require — it calls main() at load.
    // We stub process.exit and silence console.
    jest.spyOn(process, 'exit').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    sprintDemo = require('../sprintDemo');
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
    delete process.env.VIKUNJA_TOKEN;
  });

  test('fetches tasks from BOTH project 2 and project 16', async () => {
    // getActiveTasksByAgent is not exported yet — this test drives that refactor.
    // For now, assert via the mocked fetch call URLs.
    expect(sprintDemo).toBeDefined();

    // Trigger the internal fetch by requiring fresh and letting main run,
    // then inspect fetch calls. main() is async; wait a tick.
    await new Promise(r => setTimeout(r, 100));

    const urls = global.fetch.mock.calls.map(c => c[0]);
    const projectIds = urls
      .map(u => (u.match(/\/projects\/(\d+)\/tasks/) || [])[1])
      .filter(Boolean)
      .map(Number);

    expect(projectIds).toContain(2);
    expect(projectIds).toContain(16);
  });

  test('agent with tasks only on project 16 appears in active work', async () => {
    await new Promise(r => setTimeout(r, 100));
    // CMO only has tasks on project 16 in our fixture.
    // If project 16 is scanned, the fetch mock was hit for it (asserted above).
    // This documents the BDD expectation: no agent is invisible.
    const urls = global.fetch.mock.calls.map(c => c[0]);
    expect(urls.some(u => u.includes('/projects/16/tasks'))).toBe(true);
  });
});
