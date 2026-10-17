// tests/runStandalone.test.js — standalone engine entrypoint wiring
//
// TDD contract for engine/runStandalone.js (implementation lands separately).
// Runs the 24/7 engine NOW on any machine without the Slack Socket bot.
//
// Module contract under test:
//   - require() has NO side effects (guard: if (require.main === module)).
//   - exports { main } for programmatic use.
//   - main(): dotenv loaded; builds a Slack WebClient from SLACK_BOT_TOKEN
//     (no Socket Mode, no app.start()); calls workEngine.init({ client }).
//   - main(): missing SLACK_BOT_TOKEN or unconfigured Vikunja -> process
//     exits non-zero with a clear message; engine never starts.
//   - SIGTERM / SIGINT -> workEngine.stop(), then process exits 0.
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
}));
jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn(),
}));
// Token resolution (env → custom.slack surrogate) is a separate unit with its
// own tests; here it is stubbed so the entrypoint tests stay deterministic.
jest.mock('../engine/slackToken', () => ({
  resolveSlackToken: jest.fn(),
}));
// Lock release does real Vikunja I/O — stub it; shutdown wiring (not lock
// semantics) is what's under test here.
jest.mock('../engine/lock', () => ({
  releaseLock: jest.fn(() => Promise.resolve()),
}));

const workEngine = require('../engine/workEngine');
const { WebClient } = require('@slack/web-api');
const { resolveSlackToken } = require('../engine/slackToken');
const { releaseLock } = require('../engine/lock');

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
// dotenv.config() run exactly as they would on a real require.
function loadFresh() {
  let mod;
  jest.isolateModules(() => {
    mod = require('../engine/runStandalone');
  });
  return mod;
}

let exitSpy;
let errSpy;
let logSpy;
let sigBefore;

function outputText() {
  const err = errSpy.mock.calls.map(c => c.join(' ')).join('\n');
  const out = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
  return `${err}\n${out}`;
}

function stripVikunjaEnv() {
  delete process.env.VIKUNJA_URL;
  delete process.env.VIKUNJA_TOKEN;
  Object.keys(process.env).filter(k => k.startsWith('VIKUNJA_TOKEN_')).forEach(k => delete process.env[k]);
}

beforeEach(() => {
  process.env = { ...ENV_BACKUP };
  delete process.env.SLACK_BOT_TOKEN;
  stripVikunjaEnv();
  jest.clearAllMocks();
  // Re-arm the token stub default: no token available (each test opts in).
  resolveSlackToken.mockReset().mockReturnValue(null);
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

describe('module loading', () => {
  test('exports main for programmatic use', () => {
    const mod = loadFresh();
    expect(typeof mod.main).toBe('function');
  });

  test('requiring the module has no side effects', () => {
    loadFresh();
    expect(WebClient).not.toHaveBeenCalled();
    expect(workEngine.init).not.toHaveBeenCalled();
    expect(workEngine.stop).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('main() precondition checks', () => {
  test('exits non-zero with a clear message when no Slack token is available', () => {
    resolveSlackToken.mockReturnValue(null);
    const mod = loadFresh();
    mod.main();
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy.mock.calls[0][0]).not.toBe(0);
    expect(outputText()).toMatch(/SLACK_BOT_TOKEN/i);
    expect(WebClient).not.toHaveBeenCalled();
    expect(workEngine.init).not.toHaveBeenCalled();
  });

  test('treats an empty resolved token as missing', () => {
    resolveSlackToken.mockReturnValue('');
    const mod = loadFresh();
    mod.main();
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy.mock.calls[0][0]).not.toBe(0);
    expect(workEngine.init).not.toHaveBeenCalled();
  });

  test('exits non-zero with a clear message when Vikunja is not configured', () => {
    resolveSlackToken.mockReturnValue('xoxb-test-token');
    const mod = loadFresh();
    mod.main();
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy.mock.calls[0][0]).not.toBe(0);
    expect(outputText()).toMatch(/vikunja/i);
    expect(WebClient).not.toHaveBeenCalled();
    expect(workEngine.init).not.toHaveBeenCalled();
  });
});

describe('main() happy path', () => {
  beforeEach(() => {
    resolveSlackToken.mockReturnValue('xoxb-test-token');
    process.env.VIKUNJA_URL = 'https://tasks.example.com';
    process.env.VIKUNJA_TOKEN = 'tk_test';
  });

  test('builds a WebClient from the resolved token and inits the engine with it', () => {
    const mod = loadFresh();
    mod.main();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(WebClient).toHaveBeenCalledTimes(1);
    expect(WebClient.mock.calls[0][0]).toBe('xoxb-test-token');
    expect(workEngine.init).toHaveBeenCalledTimes(1);
    const arg = workEngine.init.mock.calls[0][0];
    expect(arg.client).toBe(WebClient.mock.instances[0]);
  });

  test('uses the custom.slack surrogate when the env token is unset', () => {
    resolveSlackToken.mockReturnValue('hsurr:opaque-test-surrogate');
    const mod = loadFresh();
    mod.main();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(WebClient).toHaveBeenCalledTimes(1);
    expect(WebClient.mock.calls[0][0]).toBe('hsurr:opaque-test-surrogate');
    expect(workEngine.init).toHaveBeenCalledTimes(1);
  });

  test('SIGTERM stops the engine, releases the lock, and exits 0', async () => {
    loadFresh().main();
    process.emit('SIGTERM');
    // shutdown() releases the lock asynchronously before exiting.
    await new Promise(r => setImmediate(r));
    expect(workEngine.stop).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test('SIGINT stops the engine, releases the lock, and exits 0', async () => {
    loadFresh().main();
    process.emit('SIGINT');
    // shutdown() releases the lock asynchronously before exiting.
    await new Promise(r => setImmediate(r));
    expect(workEngine.stop).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

describe('require.main guard (child process)', () => {
  test('running the file directly without a token exits non-zero', (done) => {
    const { execFile } = require('child_process');
    const path = require('path');
    // process.execPath (absolute node binary): the child's PATH is broken
    // below to disable the surrogate fetch, and execFile resolves the binary
    // through the child's PATH — a bare 'node' would fail to spawn at all.
    execFile(process.execPath, ['engine/runStandalone.js'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        // dotenv must NOT fill the token from the real .env: an existing
        // (even empty) var wins, so blank it explicitly...
        SLACK_BOT_TOKEN: '',
        // ...and the custom.slack surrogate fallback must be unavailable, or
        // the child could resolve a real token and start the engine. Breaking
        // PATH makes the python3 surrogate fetch deterministically fail, so
        // the child exercises the no-token exit hermetically.
        PATH: '/nonexistent-path-for-runstandalone-test',
      },
      timeout: 15000,
    }, (err, stdout, stderr) => {
      try {
        expect(err).toBeTruthy();
        expect(err.code).not.toBe(0);
        expect(`${stdout}\n${stderr}`).toMatch(/SLACK_BOT_TOKEN/i);
        done();
      } catch (e) {
        done(e);
      }
    });
  }, 20000);
});
