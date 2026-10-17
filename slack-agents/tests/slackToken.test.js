// tests/slackToken.test.js — Slack token resolution for the standalone engine
//
// TDD contract for engine/slackToken.js.
// resolveSlackToken() never exposes the real credential: it returns either
// the SLACK_BOT_TOKEN env var or the opaque `hsurr:` surrogate for the
// stored custom.slack connector (swapped for the real token by the egress
// proxy on requests to slack.com). child_process is mocked — no real python
// or credential helper runs in these tests, and surrogate-looking values are
// opaque test fixtures, never real secrets.
'use strict';

// Env backup first; SLACK_BOT_TOKEN must not leak in from the ambient
// environment and affect other test files sharing the jest worker.
const FILE_ENV_BACKUP = { ...process.env };
delete process.env.SLACK_BOT_TOKEN;

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}));

const { execFileSync } = require('child_process');
const { resolveSlackToken } = require('../engine/slackToken');

// Restore the pre-existing environment after the run.
afterAll(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in FILE_ENV_BACKUP)) delete process.env[k];
  }
  Object.assign(process.env, FILE_ENV_BACKUP);
});

beforeEach(() => {
  execFileSync.mockReset();
  delete process.env.SLACK_BOT_TOKEN;
});

describe('resolveSlackToken', () => {
  test('prefers SLACK_BOT_TOKEN env and never shells out', () => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-env-token';
    execFileSync.mockReturnValue('hsurr:should-not-be-used\n');
    expect(resolveSlackToken()).toBe('xoxb-env-token');
    expect(execFileSync).not.toHaveBeenCalled();
  });

  test('falls back to the custom.slack surrogate when the env var is unset', () => {
    execFileSync.mockReturnValue('hsurr:opaque-test-surrogate\n');
    expect(resolveSlackToken()).toBe('hsurr:opaque-test-surrogate');
    expect(execFileSync).toHaveBeenCalledTimes(1);
    const [cmd, args] = execFileSync.mock.calls[0];
    expect(cmd).toBe('python3');
    expect(args.join(' ')).toMatch(/custom\.slack/);
  });

  test('treats an empty env var as unset and uses the surrogate', () => {
    process.env.SLACK_BOT_TOKEN = '';
    execFileSync.mockReturnValue('hsurr:opaque-test-surrogate');
    expect(resolveSlackToken()).toBe('hsurr:opaque-test-surrogate');
  });

  test('returns null when the surrogate helper throws', () => {
    execFileSync.mockImplementation(() => { throw new Error('authd unavailable'); });
    expect(resolveSlackToken()).toBeNull();
  });

  test('returns null when the helper prints a non-surrogate value', () => {
    execFileSync.mockReturnValue('not-a-surrogate');
    expect(resolveSlackToken()).toBeNull();
  });

  test('returns null when the helper prints nothing', () => {
    execFileSync.mockReturnValue('');
    expect(resolveSlackToken()).toBeNull();
  });

  test('trims whitespace around the surrogate', () => {
    execFileSync.mockReturnValue('  hsurr:opaque-test-surrogate  \n');
    expect(resolveSlackToken()).toBe('hsurr:opaque-test-surrogate');
  });
});
