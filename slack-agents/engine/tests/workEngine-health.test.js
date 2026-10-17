/**
 * engine/tests/workEngine-health.test.js
 *
 * TDD for the Oct 7, 2026 root-cause fix: the sprint demo gate was blind
 * because .agent-health.json was only ever updated by directivePoll.js.
 * The work engine completed tasks every 30 min but never recorded its work,
 * so checkRecentDemos() reported "0 demos" while the engine was working.
 *
 * BDD scenarios:
 * - Given the work engine completes a task, when updateAgentHealth is called
 *   with completed=true, then the agent's health entry shows incremented
 *   directivesCompleted and a fresh lastActivity.
 * - Given the work engine works a task but leaves it open, when
 *   updateAgentHealth is called with completed=false, then lastActivity
 *   updates but directivesCompleted does not increment.
 * - Given no health file exists, when updateAgentHealth is called, then
 *   a valid entry is created (not a crash).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('workEngine agent health sync', () => {
  let workEngine;
  let tmpDir;
  let healthPath;
  let realPath;

  beforeEach(() => {
    // Redirect the health file to a temp dir so we never touch the real one.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'we-health-'));
    healthPath = path.join(tmpDir, '.agent-health.json');
    realPath = path.join(__dirname, '..', '.agent-health.json');

    jest.resetModules();
    // Patch the module's AGENT_HEALTH_PATH by pre-creating the real path
    // target: simplest is to temporarily swap the file location via fs.
    // Instead, we monkey-patch fs.readFileSync/writeFileSync for that path.
    const origRead = fs.readFileSync;
    const origWrite = fs.writeFileSync;
    jest.spyOn(fs, 'readFileSync').mockImplementation((p, ...a) => {
      if (String(p) === realPath) return origRead.call(fs, healthPath, ...a);
      return origRead.call(fs, p, ...a);
    });
    jest.spyOn(fs, 'writeFileSync').mockImplementation((p, ...a) => {
      if (String(p) === realPath) return origWrite.call(fs, healthPath, ...a);
      return origWrite.call(fs, p, ...a);
    });

    workEngine = require('../workEngine');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('completed=true increments directivesCompleted and sets lastActivity', () => {
    const before = Date.now();
    workEngine.updateAgentHealth('cto', true);
    const health = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
    expect(health.cto).toBeDefined();
    expect(health.cto.directivesCompleted).toBe(1);
    expect(health.cto.consecutiveFailures).toBe(0);
    expect(health.cto.status).toBe('healthy');
    expect(new Date(health.cto.lastActivity).getTime()).toBeGreaterThanOrEqual(before);
  });

  test('completed=false updates lastActivity without incrementing completions', () => {
    workEngine.updateAgentHealth('cmo', true);
    workEngine.updateAgentHealth('cmo', false);
    const health = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
    expect(health.cmo.directivesCompleted).toBe(1);
    expect(health.cmo.lastActivity).not.toBeNull();
  });

  test('creates a valid entry when no health file exists', () => {
    expect(fs.existsSync(healthPath)).toBe(false);
    workEngine.updateAgentHealth('cfo', true);
    expect(fs.existsSync(healthPath)).toBe(true);
    const health = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
    expect(health.cfo.agentId).toBe('cfo');
  });

  test('preserves other agents entries', () => {
    workEngine.updateAgentHealth('cto', true);
    workEngine.updateAgentHealth('cmo', true);
    const health = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
    expect(health.cto.directivesCompleted).toBe(1);
    expect(health.cmo.directivesCompleted).toBe(1);
  });
});
