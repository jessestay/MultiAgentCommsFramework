/**
 * engine/tests/autonomous-agent.test.js
 *
 * TDD for the autonomous agent interface (Oct 6, 2026).
 *
 * PROBLEM: Agents only act on Slack directives. CFO, CMO, CRO have active
 * Vikunja tasks but produce nothing unless someone posts [from: CEO → Role].
 * The CFO's hourly cron only fires when the Railway bot's init() runs, not
 * in the VM poller context.
 *
 * SOLUTION: Standard `runAutonomous()` method on each agent. The engine's
 * autonomousRunner.js calls it hourly, independent of Slack. Each agent
 * generates a verifiable artifact (file with timestamp, metrics, status).
 * The sprint demo check sees the artifact as a demo.
 *
 * BDD:
 * - Given an agent has active tasks, when runAutonomous() is called,
 *   then it generates a verifiable artifact at a stable path.
 * - Given the artifact exists with a recent timestamp,
 *   when the sprint demo check runs, then it counts as a demo.
 */
'use strict';

describe('Autonomous agent interface', () => {
  test('CFO exposes runAutonomous()', () => {
    const cfo = require('../../agents/cfo');
    expect(typeof cfo.runAutonomous).toBe('function');
  });

  test('CMO exposes runAutonomous()', () => {
    const cmo = require('../../agents/cmo');
    expect(typeof cmo.runAutonomous).toBe('function');
  });

  test('CRO exposes runAutonomous()', () => {
    const cro = require('../../agents/cro');
    expect(typeof cro.runAutonomous).toBe('function');
  });

  test('CFO runAutonomous generates dashboard artifact', async () => {
    const cfo = require('../../agents/cfo');
    const result = await cfo.runAutonomous();
    expect(result).toBeDefined();
    expect(result.artifactPath).toMatch(/revenue-dashboard/);
    // Artifact must exist on disk
    const fs = require('fs');
    expect(fs.existsSync(result.artifactPath)).toBe(true);
  });

  test('CMO runAutonomous generates market scan artifact', async () => {
    const cmo = require('../../agents/cmo');
    const result = await cmo.runAutonomous();
    expect(result).toBeDefined();
    expect(result.artifactPath).toMatch(/market-scan/);
    const fs = require('fs');
    expect(fs.existsSync(result.artifactPath)).toBe(true);
  });

  test('CRO runAutonomous generates research brief artifact', async () => {
    const cro = require('../../agents/cro');
    const result = await cro.runAutonomous();
    expect(result).toBeDefined();
    expect(result.artifactPath).toMatch(/research-brief/);
    const fs = require('fs');
    expect(fs.existsSync(result.artifactPath)).toBe(true);
  });
});
