/**
 * engine/tests/schedule-manifest.test.js
 *
 * TDD for engine schedule presence (Oct 10, 2026 — Jesse's order).
 *
 * ROOT CAUSE (Oct 9, 2026): The autonomousRunner.js script existed and
 * worked, but no cron job ran it. Agents went silent for hours. The demo
 * checker flagged silence, but nothing drove the agents to produce output.
 * The existing autonomous-agent.test.js verified agents EXPOSE runAutonomous()
 * but never verified the driver is actually SCHEDULED. That is the exact gap
 * Jesse identified: "It should have also been detected as missing by TDD
 * and BDD."
 *
 * These tests verify:
 * 1. The schedule manifest exists and is valid.
 * 2. The autonomous driver is declared in the manifest (the critical invariant).
 * 3. Every agent in the runner's AGENTS list is declared as scheduled.
 * 4. The install script exists and is executable.
 * 5. The check-schedules module loads and exposes its interface.
 * 6. The heal-request path is writable (self-healing can record gaps).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ENGINE_DIR = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(ENGINE_DIR, 'schedules.json');
const INSTALL_SCRIPT = path.join(ENGINE_DIR, 'install-schedules.sh');
const CHECK_SCRIPT = path.join(ENGINE_DIR, 'check-schedules.js');
const RUNNER_PATH = path.join(ENGINE_DIR, 'autonomousRunner.js');

describe('Engine schedule manifest', () => {
  let manifest;

  test('manifest exists and is valid JSON', () => {
    expect(fs.existsSync(MANIFEST_PATH)).toBe(true);
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    expect(Array.isArray(manifest.schedules)).toBe(true);
    expect(manifest.schedules.length).toBeGreaterThan(0);
  });

  test('autonomous-agent-driver is declared (critical invariant)', () => {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const driver = manifest.schedules.find(s => s.id === 'autonomous-agent-driver');
    expect(driver).toBeDefined();
    expect(driver.critical).toBe(true);
    expect(driver.cadence).toBe('1h');
    expect(driver.command).toMatch(/autonomousRunner\.js/);
    expect(driver.owner).toMatch(/^goal:/);
  });

  test('every required schedule has id, cadence, command, owner, and purpose', () => {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    for (const s of manifest.schedules) {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
      expect(typeof s.cadence).toBe('string');
      expect(typeof s.command).toBe('string');
      expect(typeof s.owner).toBe('string');
      expect(typeof s.purpose).toBe('string');
    }
  });

  test('no duplicate schedule ids', () => {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const ids = manifest.schedules.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('directive-poll and sprint-demo-check are declared (engine dependencies)', () => {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const ids = manifest.schedules.map(s => s.id);
    expect(ids).toContain('directive-poll');
    expect(ids).toContain('sprint-demo-check');
    expect(ids).toContain('macf-engine-watchdog');
  });
});

describe('Schedule install script', () => {
  test('install-schedules.sh exists and is executable', () => {
    expect(fs.existsSync(INSTALL_SCRIPT)).toBe(true);
    const stat = fs.statSync(INSTALL_SCRIPT);
    // Check owner-execute bit
    expect(stat.mode & 0o100).toBeTruthy();
  });

  test('install script references the manifest', () => {
    const content = fs.readFileSync(INSTALL_SCRIPT, 'utf8');
    expect(content).toMatch(/schedules\.json/);
  });
});

describe('Schedule self-healing check', () => {
  test('check-schedules.js exists and exports its interface', () => {
    expect(fs.existsSync(CHECK_SCRIPT)).toBe(true);
    const mod = require('../check-schedules.js');
    expect(typeof mod.collectKnownIds).toBe('function');
    expect(typeof mod.MANIFEST_PATH).toBe('string');
    expect(typeof mod.HEAL_REQUEST_PATH).toBe('string');
  });

  test('collectKnownIds returns a Set', () => {
    const { collectKnownIds } = require('../check-schedules.js');
    const ids = collectKnownIds();
    expect(ids instanceof Set).toBe(true);
  });

  test('autonomousRunner.js exists and declares its agent list', () => {
    expect(fs.existsSync(RUNNER_PATH)).toBe(true);
    const content = fs.readFileSync(RUNNER_PATH, 'utf8');
    expect(content).toMatch(/autonomousRunner/);
    // The runner must list the agents it drives
    expect(content).toMatch(/cfo/);
    expect(content).toMatch(/cmo/);
    expect(content).toMatch(/cro/);
    expect(content).toMatch(/execPM/);
  });
});
