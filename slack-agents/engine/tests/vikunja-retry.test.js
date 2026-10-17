/**
 * vikunja updateTask retry tests (TDD)
 *
 * Regression coverage for the Oct 7, 2026 incident: Vikunja 500'd task
 * completions under concurrent SQLite writers — the server log shows
 * err="database is locked" (8 occurrences Oct 6-7, 2026; the API body only
 * says "Internal Server Error", so the client retries any 5xx here).
 * updateTask (the idempotent read-modify-write behind completeTask) now
 * retries transient 5xx with backoff instead of failing the engine's
 * completion path on the first lock collision. The old code also logged
 * "task #N completed" unconditionally after a failed complete (fail-open);
 * workEngine.js now only logs success — a failed complete leaves the task
 * open so the next cycle retries it.
 */

const vikunja = require('../../utils/vikunja');

process.env.VIKUNJA_URL = 'http://127.0.0.1:3456';
process.env.VIKUNJA_TOKEN = 'test-token';

const TASK = { id: 631, title: 't', description: 'd', done: false };
const ok = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
const err500 = () => ({ ok: false, status: 500, text: async () => '{"message":"Internal Server Error"}' });
const err400 = () => ({ ok: false, status: 400, text: async () => '{"message":"Bad Request"}' });

function mockFetch(handler) {
  const calls = [];
  vikunja.setFetchImpl(async (url, opts) => {
    calls.push({ url, method: opts && opts.method });
    return handler(url, opts, calls);
  });
  return calls;
}

afterEach(() => vikunja.setFetchImpl(null));

describe('updateTask retry on transient 5xx', () => {
  test('retries 500s then succeeds (fresh GET per attempt)', async () => {
    let posts = 0;
    const calls = mockFetch((url, opts) => {
      if (opts.method === 'GET') return ok(TASK);
      posts++;
      return posts < 3 ? err500() : ok({ ...TASK, done: true });
    });
    const res = await vikunja.updateTask('execPM', 631, { done: true });
    expect(res.done).toBe(true);
    expect(posts).toBe(3);
    expect(calls.filter((c) => c.method === 'GET').length).toBe(3);
  }, 15000);

  test('throws after exhausting retries on persistent 500', async () => {
    const calls = mockFetch((url, opts) => (opts.method === 'GET' ? ok(TASK) : err500()));
    await expect(vikunja.updateTask('execPM', 631, { done: true })).rejects.toThrow('HTTP 500');
    expect(calls.filter((c) => c.method === 'POST').length).toBe(4); // 1 + 3 retries
  }, 15000);

  test('does not retry on 4xx', async () => {
    const calls = mockFetch((url, opts) => (opts.method === 'GET' ? ok(TASK) : err400()));
    await expect(vikunja.updateTask('execPM', 631, { done: true })).rejects.toThrow('HTTP 400');
    expect(calls.filter((c) => c.method === 'POST').length).toBe(1);
  });
});
