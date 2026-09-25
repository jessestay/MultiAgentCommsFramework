// tests/runStandaloneHatchet.test.js — HATCHET_ENABLED gating in the standalone entrypoint
//
// TDD contract for the runStandalone.js flag gating (implementation lands
// separately). When HATCHET_ENABLED=1, main() must route startup through
// ../engine/hatchet (createHatchetClient + startEngineWorker with injected
// deps) and must NOT call workEngine.init; one immediate tick runs at
// startup. When the flag is off (default), behavior is unchanged and the
// hatchet module is never touched.
'use strict';

// Env must be set BEFORE config loads — VIKUNJA.projectId is read at require
// time (utils/tasks.isEnabled() needs it for the happy path). The pre-existing
// environment is backed up first and restored in afterAll so other test files
// sharing the jest worker see a clean environment.
const FILE_ENV_BACKUP = { ...process.env };
process.env.VIKUNJA_PROJECT_ID = '2';

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../engine/workEngine', () => ({
  init: jest.fn(),
  stop: jest.fn(),
  runCycle: jest.fn(() => Promise.resolve()),
}));
jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn(),
}));
// Token resolution (env → custom.slack surrogate) is a separate unit with its
// own tests; here it is stubbed so the entrypoint tests stay deterministic.
jest.mock('../engine/slackToken', () => ({
  resolveSlackToken: jest.fn(),
}));
jest.mock('../engine/lock', () => ({
  acquireLock: jest.fn(),
  releaseLock: jest.fn(() => Promise.resolve()),
  holderId: jest.fn(() => 'test-holder:42'),
}));
// The hatchet module under test in tests/hatchet.test.js; here it is a
// stand-in faithful to the documented contract: startEngineWorker performs
// one immediate tick at startup (lock-first), which is what makes the
// "exactly one tick" behavior observable through main().
jest.mock('../engine/hatchet', () => {
  const api = {
    createHatchetClient: jest.fn(),
    startEngineWorker: jest.fn(),
    runEngineTick: jest.fn(),
  };
  api.startEngineWorker.mockImplementation(async (client, deps) => {
    await api.runEngineTick(deps);
    return { start: jest.fn(), stop: jest.fn() };
  });
  api.runEngineTick.mockImplementation(async (deps) => {
    const holder = typeof deps.holderId === 'function' ? deps.holderId() : deps.holderId;
    const locked = await deps.acquireLock({ holderId: holder });
    if (locked) await deps.runCycle();
  });
  return api;
}, { virtual: true });

const workEngine = require('../engine/workEngine');
const hatchet = require('../engine/hatchet');
const { WebClient } = require('@slack/web-api');
const { resolveSlackToken } = require('../engine/slackToken');
const { acquireLock, releaseLock } = require('../engine/lock');

const ENV_BACKUP = { ...process.env };

// Restore the pre-existing environment after the run so other test files
// sharing the jest worker see a clean environment.
afterAll(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in FILE_ENV_BACKUP)) delete process.env[k];
  }
  Object.assign(process.env, FILE_ENV_BACKUP);
});

// Fresh module registry per load so the require.main guard and top-level
// dotenv.config() run exactly as they would on a real require, and config
// re-reads HATCHET_* env at require time.
function loadFresh() {
  let mod;
  jest.isolateModules(() => {
    mod = require('../engine/runStandalone');
  });
  return mod;
}

function stripVikunjaEnv() {
  delete process.env.VIKUNJA_URL;
  delete process.env.VIKUNJA_TOKEN;
  Object.keys(process.env).filter(k => k.startsWith('VIKUNJA_TOKEN_')).forEach(k => delete process.env[k]);
}

const FAKE_CLIENT = { id: 'fake-hatchet-client' };

let exitSpy;
let errSpy;
let logSpy;
let sigBefore;

beforeEach(() => {
  process.env = { ...ENV_BACKUP };
  delete process.env.HATCHET_ENABLED;
  delete process.env.HATCHET_CRON;
  delete process.env.SLACK_BOT_TOKEN;
  stripVikunjaEnv();
  // Happy-path preconditions for main().
  resolveSlackToken.mockReset().mockReturnValue('xoxb-test-token');
  process.env.VIKUNJA_URL = 'https://tasks.example.com';
  process.env.VIKUNJA_TOKEN = 'tk_test';
  acquireLock.mockReset().mockResolvedValue(true);
  jest.clearAllMocks();
  exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  sigBefore = {
    SIGTERM: process.listeners('SIGTERM'),
    SIGINT: process.listeners('SIGINT'),
  };
});

afterEach(() => {
  exitSpy.mockRestore();
  errSpy.mockRestore();
  logSpy.mockRestore();
  // Remove only the signal listeners this test's main() added.
  for (const sig of ['SIGTERM', 'SIGINT']) {
    for (const listener of process.listeners(sig)) {
      if (!sigBefore[sig].includes(listener)) process.removeListener(sig, listener);
    }
  }
  process.env = ENV_BACKUP;
});

describe('HATCHET_ENABLED=1', () => {
  beforeEach(() => {
    process.env.HATCHET_ENABLED = '1';
    hatchet.createHatchetClient.mockResolvedValue(FAKE_CLIENT);
  });

  test('routes startup through Hatchet and never calls workEngine.init', async () => {
    const mod = loadFresh();
    await mod.main();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(hatchet.createHatchetClient).toHaveBeenCalledTimes(1);
    expect(hatchet.startEngineWorker).toHaveBeenCalledTimes(1);
    expect(hatchet.startEngineWorker.mock.calls[0][0]).toBe(FAKE_CLIENT);
    const deps = hatchet.startEngineWorker.mock.calls[0][1];
    expect(deps.runCycle).toBe(workEngine.runCycle);
    expect(deps.acquireLock).toBe(acquireLock);
    expect(deps.releaseLock).toBe(releaseLock);
    expect(workEngine.init).not.toHaveBeenCalled();
    expect(workEngine.stop).not.toHaveBeenCalled();
  });

  test('performs exactly one immediate tick at startup', async () => {
    await loadFresh().main();
    expect(workEngine.runCycle).toHaveBeenCalledTimes(1);
  });

  test('skips the immediate tick when the lock is held elsewhere', async () => {
    acquireLock.mockResolvedValue(false);
    await loadFresh().main();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(hatchet.startEngineWorker).toHaveBeenCalledTimes(1);
    expect(workEngine.runCycle).not.toHaveBeenCalled();
  });

  test('no Slack token exits non-zero and never creates a Hatchet client', async () => {
    resolveSlackToken.mockReturnValue(null);
    const mod = loadFresh();
    await mod.main();
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy.mock.calls[0][0]).not.toBe(0);
    expect(hatchet.createHatchetClient).not.toHaveBeenCalled();
    expect(hatchet.startEngineWorker).not.toHaveBeenCalled();
    expect(workEngine.init).not.toHaveBeenCalled();
  });

  test('unconfigured Vikunja exits non-zero and never creates a Hatchet client', async () => {
    stripVikunjaEnv();
    const mod = loadFresh();
    await mod.main();
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy.mock.calls[0][0]).not.toBe(0);
    expect(hatchet.createHatchetClient).not.toHaveBeenCalled();
    expect(hatchet.startEngineWorker).not.toHaveBeenCalled();
    expect(workEngine.init).not.toHaveBeenCalled();
  });
});

describe('flag off (default)', () => {
  test('keeps the workEngine.init path and never touches the hatchet module', async () => {
    const mod = loadFresh();
    await mod.main();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(workEngine.init).toHaveBeenCalledTimes(1);
    expect(hatchet.createHatchetClient).not.toHaveBeenCalled();
    expect(hatchet.startEngineWorker).not.toHaveBeenCalled();
    expect(hatchet.runEngineTick).not.toHaveBeenCalled();
    expect(workEngine.runCycle).not.toHaveBeenCalled();
  });
});
