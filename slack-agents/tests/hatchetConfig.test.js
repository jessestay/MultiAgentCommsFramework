// tests/hatchetConfig.test.js — HATCHET feature-flag config
//
// TDD contract for the config.js addition (implementation lands separately):
//   HATCHET = { ENABLED: process.env.HATCHET_ENABLED === '1',
//               CRON: process.env.HATCHET_CRON || '*/30 * * * *' }
// Read at require time, mirroring the existing VIKUNJA config style.
'use strict';

const FILE_ENV_BACKUP = { ...process.env };

// Restore the pre-existing environment after the run so other test files
// sharing the jest worker see a clean environment.
afterAll(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in FILE_ENV_BACKUP)) delete process.env[k];
  }
  Object.assign(process.env, FILE_ENV_BACKUP);
});

function loadConfigFresh() {
  let cfg;
  jest.isolateModules(() => {
    cfg = require('../config');
  });
  return cfg;
}

beforeEach(() => {
  process.env = { ...FILE_ENV_BACKUP };
  delete process.env.HATCHET_ENABLED;
  delete process.env.HATCHET_CRON;
});

describe('HATCHET config', () => {
  test('defaults: ENABLED is false, CRON is every 30 minutes', () => {
    const cfg = loadConfigFresh();
    expect(cfg.HATCHET.ENABLED).toBe(false);
    expect(cfg.HATCHET.CRON).toBe('*/30 * * * *');
  });

  test('HATCHET_ENABLED=1 turns the flag on', () => {
    process.env.HATCHET_ENABLED = '1';
    expect(loadConfigFresh().HATCHET.ENABLED).toBe(true);
  });

  test('any other HATCHET_ENABLED value keeps it off', () => {
    process.env.HATCHET_ENABLED = '0';
    expect(loadConfigFresh().HATCHET.ENABLED).toBe(false);
    process.env.HATCHET_ENABLED = 'true';
    expect(loadConfigFresh().HATCHET.ENABLED).toBe(false);
  });

  test('HATCHET_CRON overrides the default schedule', () => {
    process.env.HATCHET_CRON = '0 * * * *';
    expect(loadConfigFresh().HATCHET.CRON).toBe('0 * * * *');
  });
});
