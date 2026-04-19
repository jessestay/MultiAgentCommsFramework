// tests/state.test.js — Tests per-agent memory isolation
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Use a temp dir for test isolation
const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-test-'));
process.env.RAILWAY_VOLUME_MOUNT_PATH = TEST_DIR;

// Re-require state AFTER setting env var so it picks up our test dir
// We need to clear the module cache first
delete require.cache[require.resolve('../utils/state')];
const state = require('../utils/state');

afterAll(() => {
  // Clean up temp test files
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('Per-agent memory isolation', () => {
  test('Agents have separate memory namespaces', () => {
    state.set('cmo', 'knownDonationAmount', 500);
    state.set('execPM', 'knownDonationAmount', 0);

    expect(state.get('cmo', 'knownDonationAmount')).toBe(500);
    expect(state.get('execPM', 'knownDonationAmount')).toBe(0);
  });

  test('Reading one agent\'s memory does not expose another\'s', () => {
    state.set('lawyer', 'openRisks', [{ description: 'IP issue', severity: 'high' }]);
    state.set('cfo', 'openRisks', []); // cfo has different default

    // Lawyer's risks should not appear when reading cfo
    const cfoState = state.get('cfo', 'openRisks');
    expect(cfoState).toEqual([]);

    const lawyerRisks = state.get('lawyer', 'openRisks');
    expect(lawyerRisks[0].description).toBe('IP issue');
  });

  test('Each agent writes to its own file', () => {
    state.set('cco', 'lastSuggestedDate', '2026-04-19');
    state.set('cro', 'lastProactivePost', '2026-04-19');

    const ccoFile = path.join(TEST_DIR, 'memory-cco.json');
    const croFile = path.join(TEST_DIR, 'memory-cro.json');

    expect(fs.existsSync(ccoFile)).toBe(true);
    expect(fs.existsSync(croFile)).toBe(true);

    const ccoData = JSON.parse(fs.readFileSync(ccoFile, 'utf8'));
    const croData = JSON.parse(fs.readFileSync(croFile, 'utf8'));

    // Each file contains only its agent's data
    expect(ccoData.lastSuggestedDate).toBe('2026-04-19');
    expect(ccoData.lastProactivePost).toBeUndefined();

    expect(croData.lastProactivePost).toBe('2026-04-19');
    expect(croData.lastSuggestedDate).toBeUndefined();
  });

  test('push() caps array length at maxLength', () => {
    for (let i = 0; i < 25; i++) {
      state.push('jobcoach', 'seenPostingIds', `job-${i}`, 20);
    }
    const ids = state.get('jobcoach', 'seenPostingIds');
    expect(ids.length).toBe(20); // capped at 20
    expect(ids[ids.length - 1]).toBe('job-24'); // most recent preserved
  });

  test('get() returns undefined for non-existent keys', () => {
    expect(state.get('cuxo', 'nonExistentKey')).toBeUndefined();
  });

  test('set() creates nested keys', () => {
    state.set('cmo', 'trackedMetric.mrr', 2500);
    expect(state.get('cmo', 'trackedMetric.mrr')).toBe(2500);
  });
});

describe('Shared channel activity (cross-agent)', () => {
  test('updateChannelActivity writes to shared state', () => {
    state.updateChannelActivity('marketing');
    const idle = state.getChannelIdleMinutes('marketing');
    expect(idle).toBeLessThan(1); // should be nearly 0 since we just updated
  });

  test('getChannelIdleMinutes returns Infinity for channels never updated', () => {
    const idle = state.getChannelIdleMinutes('nonexistent-channel-xyz');
    expect(idle).toBe(Infinity);
  });

  test('Shared state file is separate from agent memory files', () => {
    state.updateChannelActivity('exec-pm');
    const sharedFile = path.join(TEST_DIR, 'shared-channel-activity.json');
    expect(fs.existsSync(sharedFile)).toBe(true);

    const sharedData = JSON.parse(fs.readFileSync(sharedFile, 'utf8'));
    expect(sharedData['exec-pm']).toBeTruthy();
    // Agent memory files should not contain channel activity
    expect(sharedData['knownDonationAmount']).toBeUndefined();
  });
});

describe('State persistence (loadAll)', () => {
  test('loadAll initializes all 8 agent states without error', () => {
    // Clear in-memory cache by resetting module
    expect(() => state.loadAll()).not.toThrow();
  });
});
