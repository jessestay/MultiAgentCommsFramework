// tests/engineKeepalive.test.js — 24/7 engine keepalive timers must stay ref'd
//
// Regression contract: the process must stay alive between engine cycles.
//   - engine/workEngine.js init(): the 30-min cycle interval must be ref'd
//     (timer.hasRef() === true).
//   - engine/runStandalone.js main(): the no-op keepalive interval must be
//     ref'd for the same reason.
// Both currently call .unref() under a "keep the process alive" comment,
// which does the opposite: an unref'd timer lets the event loop drain, so
// the process can exit after the first cycle. These tests assert the
// POSITIVE behavior (ref'd), so they FAIL while .unref() is present and
// PASS once it is removed.
//
// Uses REAL timers throughout — fake timers don't model hasRef the same way.
'use strict';

// Env before requires: config reads VIKUNJA_PROJECT_ID and workEngine reads
// WORK_ENGINE_ENABLED at require time. The pre-existing environment is
// backed up first and restored in afterAll so other test files sharing the
// jest worker see a clean environment.
const FILE_ENV_BACKUP = { ...process.env };
process.env.VIKUNJA_PROJECT_ID = '2';
process.env.WORK_ENGINE_ENABLED = '1';

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../engine/workEngine', () => ({
  init: jest.fn(),
  stop: jest.fn(),
}));
jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn(),
}));
// Token resolution (env → custom.slack surrogate) is a separate unit with its
// own tests; here it is stubbed so the entrypoint tests stay deterministic.
jest.mock('../engine/slackToken', () => ({
  resolveSlackToken: jest.fn(),
}));
// Lock release does real Vikunja I/O — stub it; keepalive wiring (not lock
// semantics) is what's under test here.
jest.mock('../engine/lock', () => ({
  releaseLock: jest.fn(() => Promise.resolve()),
}));

// The mocked engine above serves the runStandalone tests; this describe
// needs the REAL engine, so it bypasses the mock explicitly.
const realWorkEngine = jest.requireActual('../engine/workEngine');
const workEngineMock = require('../engine/workEngine');
const { WebClient } = require('@slack/web-api');
const { resolveSlackToken } = require('../engine/slackToken');

const ENV_BACKUP = { ...process.env };

afterAll(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in FILE_ENV_BACKUP)) delete process.env[k];
  }
  Object.assign(process.env, FILE_ENV_BACKUP);
});

function stripVikunjaEnv() {
  delete process.env.VIKUNJA_URL;
  delete process.env.VIKUNJA_TOKEN;
  Object.keys(process.env).filter(k => k.startsWith('VIKUNJA_TOKEN_')).forEach(k => delete process.env[k]);
}

describe('workEngine.init() cycle interval', () => {
  let setIntervalSpy;
  let setTimeoutSpy;

  beforeEach(() => {
    setIntervalSpy = jest.spyOn(global, 'setInterval');
    setTimeoutSpy = jest.spyOn(global, 'setTimeout');
  });

  afterEach(() => {
    // Engine must be fully torn down: the 30-min cycle interval AND the
    // 90s first-cycle timeout are real timers that would otherwise keep
    // the jest worker alive.
    realWorkEngine.stop();
    for (const r of setTimeoutSpy.mock.results) {
      if (r.value) clearTimeout(r.value);
    }
    setIntervalSpy.mockRestore();
    setTimeoutSpy.mockRestore();
  });

  test('the cycle interval stays ref\'d so the process stays alive', () => {
    realWorkEngine.init({ client: {} });

    const cycleTimer = setIntervalSpy.mock.results[0].value;
    expect(cycleTimer).toBeDefined();
    // BUG (unfixed): init() calls timer.unref(), so hasRef() is false and
    // the event loop can drain after the first cycle, killing the service.
    expect(cycleTimer.hasRef()).toBe(true);
  });
});

describe('runStandalone.main() keepalive interval', () => {
  let exitSpy;
  let errSpy;
  let logSpy;
  let setIntervalSpy;
  let sigBefore;

  // Fresh module registry per load so the require.main guard and top-level
  // dotenv.config() run exactly as they would on a real require.
  function loadFresh() {
    let mod;
    jest.isolateModules(() => {
      mod = require('../engine/runStandalone');
    });
    return mod;
  }

  beforeEach(() => {
    process.env = { ...ENV_BACKUP };
    delete process.env.SLACK_BOT_TOKEN;
    stripVikunjaEnv();
    jest.clearAllMocks();
    // Happy-path env: token resolves, Vikunja configured, native path only.
    resolveSlackToken.mockReset().mockReturnValue('xoxb-test-token');
    process.env.VIKUNJA_URL = 'https://tasks.example.com';
    process.env.VIKUNJA_TOKEN = 'tk_test';
    delete process.env.HATCHET_ENABLED;
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    setIntervalSpy = jest.spyOn(global, 'setInterval');
    sigBefore = {
      SIGTERM: process.listeners('SIGTERM'),
      SIGINT: process.listeners('SIGINT'),
    };
  });

  afterEach(() => {
    // Clear every real timer this main() created so the suite doesn't hang.
    for (const r of setIntervalSpy.mock.results) {
      if (r.value) clearInterval(r.value);
    }
    setIntervalSpy.mockRestore();
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

  test('the keepalive interval stays ref\'d so the process stays alive', async () => {
    const mod = loadFresh();
    await mod.main();

    // Sanity: the engine actually started (happy path, no early exit).
    expect(exitSpy).not.toHaveBeenCalled();
    expect(WebClient).toHaveBeenCalledTimes(1);
    expect(workEngineMock.init).toHaveBeenCalledTimes(1);

    // The keepalive is the no-op-callback interval main() creates after
    // starting the engine. workEngine is mocked here, so no other real
    // interval is created on this path — still, match by callback shape.
    const keepalive = setIntervalSpy.mock.calls
      .map((call, i) => ({ cb: call[0], timer: setIntervalSpy.mock.results[i].value }))
      .find(({ cb }) => String(cb).replace(/\s+/g, '') === '()=>{}');
    expect(keepalive).toBeDefined();
    // BUG (unfixed): main() calls .unref() on the keepalive, so hasRef() is
    // false and it keeps nothing alive.
    expect(keepalive.timer.hasRef()).toBe(true);
  });
});
