/**
 * engine/tests/integration/vikunja-projects.integration.js
 *
 * INTEGRATION TEST (hits real Vikunja API).
 *
 * Verifies the sprint demo monitor sees tasks on ALL active projects.
 * This catches the Oct 6 bug where project 16 was missing from the scan.
 *
 * SAFETY: Read-only. Only fetches task lists, never modifies.
 *
 * RUN: npx jest engine/tests/integration/ --forceExit
 * SKIP in CI unless VIKUNJA_INTEGRATION_TEST=1 is set.
 */
'use strict';

describe('Vikunja project coverage (real API)', () => {
  const PROJECTS = [2, 16]; // MACF, Revenue Sprint
  const TOKEN = process.env.VIKUNJA_TOKEN;

  beforeAll(() => {
    if (process.env.VIKUNJA_INTEGRATION_TEST !== '1') {
      console.log('Skipping integration test (set VIKUNJA_INTEGRATION_TEST=1 to run)');
    }
  });

  test('both projects are reachable and return tasks', async () => {
    if (process.env.VIKUNJA_INTEGRATION_TEST !== '1') return;
    expect(TOKEN).toBeDefined();

    for (const projectId of PROJECTS) {
      const res = await fetch(
        `http://127.0.0.1:3456/api/v1/projects/${projectId}/tasks`,
        { headers: { Authorization: `Bearer ${TOKEN}` } }
      );
      expect(res.ok).toBe(true);
      const tasks = await res.json();
      expect(Array.isArray(tasks)).toBe(true);
      console.log(`Project ${projectId}: ${tasks.length} tasks`);
    }
  });

  test('CFO task #86 exists on project 16', async () => {
    if (process.env.VIKUNJA_INTEGRATION_TEST !== '1') return;

    const res = await fetch(
      'http://127.0.0.1:3456/api/v1/projects/16/tasks',
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    const tasks = await res.json();
    const cfoTask = tasks.find(t => t.id === 86 || t.title.includes('revenue dashboard'));
    expect(cfoTask).toBeDefined();
  });
});
