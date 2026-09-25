// tests/vikunja.test.js — Vikunja API client
'use strict';

const vikunja = require('../utils/vikunja');

const ENV_BACKUP = { ...process.env };

function mockFetch(handler) {
  const calls = [];
  vikunja.setFetchImpl(async (url, opts) => {
    calls.push({ url, opts });
    return handler(url, opts);
  });
  return calls;
}

function okJson(body) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  process.env = { ...ENV_BACKUP };
  delete process.env.VIKUNJA_URL;
  delete process.env.VIKUNJA_TOKEN;
  Object.keys(process.env).filter(k => k.startsWith('VIKUNJA_TOKEN_')).forEach(k => delete process.env[k]);
  vikunja.setFetchImpl(null);
});

afterAll(() => { process.env = ENV_BACKUP; });

describe('isConfigured / tokenFor', () => {
  test('not configured without URL and token', () => {
    expect(vikunja.isConfigured()).toBe(false);
  });

  test('not configured with URL but no token', () => {
    process.env.VIKUNJA_URL = 'https://tasks.example.com';
    expect(vikunja.isConfigured()).toBe(false);
  });

  test('configured with URL + shared token', () => {
    process.env.VIKUNJA_URL = 'https://tasks.example.com';
    process.env.VIKUNJA_TOKEN = 'tk_shared';
    expect(vikunja.isConfigured()).toBe(true);
  });

  test('per-agent token takes precedence over shared token', () => {
    process.env.VIKUNJA_TOKEN = 'tk_shared';
    process.env.VIKUNJA_TOKEN_CMO = 'tk_cmo';
    expect(vikunja.tokenFor('cmo')).toBe('tk_cmo');
    expect(vikunja.tokenFor('cco')).toBe('tk_shared');
  });

  test('baseUrl strips trailing slashes', () => {
    process.env.VIKUNJA_URL = 'https://tasks.example.com///';
    expect(vikunja.baseUrl()).toBe('https://tasks.example.com');
  });
});

describe('request', () => {
  test('builds URL, method, and auth headers', async () => {
    process.env.VIKUNJA_URL = 'https://tasks.example.com';
    process.env.VIKUNJA_TOKEN = 'tk_abc';
    const calls = mockFetch(() => okJson({ id: 1 }));
    const res = await vikunja.request('cmo', '/projects', { method: 'GET' });
    expect(res).toEqual({ id: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://tasks.example.com/api/v1/projects');
    expect(calls[0].opts.method).toBe('GET');
    expect(calls[0].opts.headers['Authorization']).toBe('Bearer tk_abc');
  });

  test('throws without VIKUNJA_URL', async () => {
    process.env.VIKUNJA_TOKEN = 'tk_abc';
    await expect(vikunja.request('cmo', '/projects')).rejects.toThrow('VIKUNJA_URL');
  });

  test('throws on HTTP error with status', async () => {
    process.env.VIKUNJA_URL = 'https://tasks.example.com';
    process.env.VIKUNJA_TOKEN = 'tk_abc';
    mockFetch(() => ({ ok: false, status: 403, text: async () => 'forbidden' }));
    await expect(vikunja.request('cmo', '/projects')).rejects.toThrow('403');
  });
});

describe('task endpoints', () => {
  beforeEach(() => {
    process.env.VIKUNJA_URL = 'https://tasks.example.com';
    process.env.VIKUNJA_TOKEN = 'tk_abc';
  });

  test('createTask PUTs to /projects/{id}/tasks', async () => {
    const calls = mockFetch(() => okJson({ id: 42, title: 'Do the thing' }));
    const task = await vikunja.createTask('execPM', 7, { title: 'Do the thing', priority: 4 });
    expect(task.id).toBe(42);
    expect(calls[0].url).toBe('https://tasks.example.com/api/v1/projects/7/tasks');
    expect(calls[0].opts.method).toBe('PUT');
    const body = JSON.parse(calls[0].opts.body);
    expect(body.title).toBe('Do the thing');
    expect(body.priority).toBe(4);
  });

  test('assignTask PUTs user_id to /tasks/{id}/assignees', async () => {
    const calls = mockFetch(() => okJson({}));
    await vikunja.assignTask('execPM', 42, 9);
    expect(calls[0].url).toBe('https://tasks.example.com/api/v1/tasks/42/assignees');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ user_id: 9 });
  });

  test('completeTask GETs then POSTs merged task (partial POST would wipe fields)', async () => {
    const calls = mockFetch((url, opts) =>
      (!opts.method || opts.method === 'GET')
        ? okJson({ id: 42, title: 'T', description: 'keep me', done: false, priority: 2 })
        : okJson({ id: 42, done: true }));
    await vikunja.completeTask('execPM', 42);
    expect(calls[0].url).toBe('https://tasks.example.com/api/v1/tasks/42');
    expect(calls[0].opts.method || 'GET').toBe('GET');
    expect(calls[1].opts.method).toBe('POST');
    const body = JSON.parse(calls[1].opts.body);
    expect(body.done).toBe(true);
    expect(body.description).toBe('keep me'); // must not be wiped
    expect(body.title).toBe('T');
  });

  test('listTasks passes filter and sort params', async () => {
    const calls = mockFetch(() => okJson([]));
    await vikunja.listTasks('execPM', 7, { filter: 'done = false', sortBy: 'priority', orderBy: 'desc' });
    expect(calls[0].url).toContain('/api/v1/projects/7/tasks?');
    expect(calls[0].url).toContain('filter=done+%3D+false');
    expect(calls[0].url).toContain('sort_by=priority');
  });
});

describe('PRIORITY', () => {
  test('scale is 0-5 with URGENT highest', () => {
    expect(vikunja.PRIORITY.NONE).toBe(0);
    expect(vikunja.PRIORITY.URGENT).toBe(5);
    expect(vikunja.PRIORITY.HIGH).toBeGreaterThan(vikunja.PRIORITY.NORMAL);
  });
});
