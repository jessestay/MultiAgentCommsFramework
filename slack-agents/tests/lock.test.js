// tests/lock.test.js — Vikunja-backed single-instance heartbeat lock
//
// TDD contract for engine/lock.js (implementation lands separately).
// The lock prevents two engine copies (e.g. VM standalone + desktop bot)
// from double-working the board: a single Vikunja task acts as the mutex,
// its description holding JSON {holder, heartbeat}.
//
// Module contract under test:
//   const { acquireLock, releaseLock, isLockTask } = require('../engine/lock');
//   acquireLock({ holderId, ttlMin = 10 }) -> Promise<boolean>
//   releaseLock({ holderId })              -> Promise<void>, never throws
//   isLockTask(task)                       -> boolean
// Lock task title (exact): '🔒 ENGINE LOCK — do not complete'
// holderId format: '<hostname>:<pid>' (callers supply it; tests use that shape).
'use strict';

// Env must be set BEFORE config loads — VIKUNJA.projectId is read at require time.
// The pre-existing environment is backed up first and restored in afterAll so
// other test files sharing the jest worker see a clean environment.
const FILE_ENV_BACKUP = { ...process.env };
process.env.VIKUNJA_URL = 'https://tasks.example.com';
process.env.VIKUNJA_TOKEN = 'tk_test';
process.env.VIKUNJA_PROJECT_ID = '2';

const lock = require('../engine/lock');
const vikunja = require('../utils/vikunja');

const LOCK_TITLE = '🔒 ENGINE LOCK — do not complete';
const ME = 'testhost:12345';
const OTHER = 'otherhost:99999';

// Restore the pre-existing environment after the run so other test files
// sharing the jest worker see a clean environment.
afterAll(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in FILE_ENV_BACKUP)) delete process.env[k];
  }
  Object.assign(process.env, FILE_ENV_BACKUP);
});

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

const freshHeartbeat = () => new Date(Date.now() - 2 * 60 * 1000).toISOString();
const staleHeartbeat = () => new Date(Date.now() - 30 * 60 * 1000).toISOString();

function lockTask(holder, heartbeat, extra = {}) {
  return {
    id: 999,
    title: LOCK_TITLE,
    description: JSON.stringify({ holder, heartbeat }),
    done: false,
    ...extra,
  };
}

// Mock Vikunja at the HTTP layer so the tests pin the wire contract, not which
// vikunja.* wrapper the implementation happens to call. Records every write.
function boardHandler(tasks, { envelope = false } = {}) {
  const writes = [];
  const listBody = envelope ? { tasks } : tasks;
  const handler = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (/\/projects\/2\/tasks/.test(url) && method === 'PUT') {
      const body = JSON.parse(opts.body);
      writes.push({ kind: 'create', body });
      return okJson({ id: 1001, title: body.title, description: body.description });
    }
    if (/\/projects\/2\/tasks/.test(url)) {
      return okJson(listBody);
    }
    const m = url.match(/\/tasks\/(\d+)$/);
    if (m && method === 'POST') {
      const body = JSON.parse(opts.body);
      writes.push({ kind: 'update', id: Number(m[1]), body });
      return okJson({ id: Number(m[1]) });
    }
    if (m) {
      return okJson(tasks.find(t => t.id === Number(m[1])) || {});
    }
    return okJson({});
  };
  return { handler, writes };
}

function parseHeartbeat(write) {
  return JSON.parse(write.body.description);
}

function expectFreshHeartbeat(desc, holderId) {
  expect(desc.holder).toBe(holderId);
  expect(typeof desc.heartbeat).toBe('string');
  expect(Date.now() - new Date(desc.heartbeat).getTime()).toBeLessThan(60_000);
}

beforeEach(() => {
  vikunja.setFetchImpl(null);
});

afterEach(() => {
  vikunja.setFetchImpl(null);
});

describe('acquireLock', () => {
  test('creates the lock task when none exists and acquires', async () => {
    const { handler, writes } = boardHandler([{ id: 1, title: 'Something else', done: false }]);
    mockFetch(handler);
    const ok = await lock.acquireLock({ holderId: ME });
    expect(ok).toBe(true);
    const creates = writes.filter(w => w.kind === 'create');
    expect(creates).toHaveLength(1);
    expect(creates[0].body.title).toBe(LOCK_TITLE);
    expectFreshHeartbeat(parseHeartbeat(creates[0]), ME);
    // Nothing existed to update — create only, no update writes.
    expect(writes.filter(w => w.kind === 'update')).toHaveLength(0);
  });

  test('acquires a stale lock held by someone else and writes a fresh heartbeat', async () => {
    const { handler, writes } = boardHandler([lockTask(OTHER, staleHeartbeat())]);
    mockFetch(handler);
    const ok = await lock.acquireLock({ holderId: ME, ttlMin: 10 });
    expect(ok).toBe(true);
    const updates = writes.filter(w => w.kind === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe(999);
    expectFreshHeartbeat(parseHeartbeat(updates[0]), ME);
  });

  test('refreshes its own lock even when the heartbeat is fresh (re-entrant)', async () => {
    const { handler, writes } = boardHandler([lockTask(ME, freshHeartbeat())]);
    mockFetch(handler);
    const ok = await lock.acquireLock({ holderId: ME, ttlMin: 10 });
    expect(ok).toBe(true);
    const updates = writes.filter(w => w.kind === 'update');
    expect(updates).toHaveLength(1);
    expectFreshHeartbeat(parseHeartbeat(updates[0]), ME);
  });

  test('stands down on a fresh lock held by someone else and writes nothing', async () => {
    const { handler, writes } = boardHandler([lockTask(OTHER, freshHeartbeat())]);
    mockFetch(handler);
    const ok = await lock.acquireLock({ holderId: ME, ttlMin: 10 });
    expect(ok).toBe(false);
    expect(writes).toHaveLength(0);
  });

  test('treats malformed description JSON as stale and acquires', async () => {
    const { handler, writes } = boardHandler([
      lockTask(OTHER, freshHeartbeat(), { description: 'not json{{{' }),
    ]);
    mockFetch(handler);
    expect(await lock.acquireLock({ holderId: ME })).toBe(true);
    expect(writes.filter(w => w.kind === 'update')).toHaveLength(1);
  });

  test('treats a missing description as stale and acquires', async () => {
    const t = lockTask(OTHER, freshHeartbeat());
    delete t.description;
    const { handler, writes } = boardHandler([t]);
    mockFetch(handler);
    expect(await lock.acquireLock({ holderId: ME })).toBe(true);
    expect(writes.filter(w => w.kind === 'update')).toHaveLength(1);
  });

  test('treats valid JSON with the wrong shape as stale and acquires', async () => {
    const { handler, writes } = boardHandler([
      lockTask(OTHER, freshHeartbeat(), { description: JSON.stringify({ foo: 1 }) }),
    ]);
    mockFetch(handler);
    expect(await lock.acquireLock({ holderId: ME })).toBe(true);
    expect(writes.filter(w => w.kind === 'update')).toHaveLength(1);
  });

  test('matches the lock task by exact title among other tasks', async () => {
    const { handler, writes } = boardHandler([
      { id: 1, title: 'Write the launch post', done: false },
      lockTask(OTHER, staleHeartbeat()),
      { id: 3, title: '🔒 ENGINE LOCK — do not complete (old copy?)', done: false },
    ]);
    mockFetch(handler);
    expect(await lock.acquireLock({ holderId: ME })).toBe(true);
    const updates = writes.filter(w => w.kind === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe(999); // the exact-title task, not the near-miss
  });

  test('handles the { tasks: [...] } list envelope', async () => {
    const { handler, writes } = boardHandler([lockTask(OTHER, staleHeartbeat())], { envelope: true });
    mockFetch(handler);
    expect(await lock.acquireLock({ holderId: ME })).toBe(true);
    expect(writes.filter(w => w.kind === 'update')).toHaveLength(1);
  });

  test('uses the default 10-minute TTL', async () => {
    const nineMin = new Date(Date.now() - 9 * 60 * 1000).toISOString();
    const h1 = boardHandler([lockTask(OTHER, nineMin)]);
    mockFetch(h1.handler);
    expect(await lock.acquireLock({ holderId: ME })).toBe(false); // 9 min < 10 → fresh

    const elevenMin = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const h2 = boardHandler([lockTask(OTHER, elevenMin)]);
    mockFetch(h2.handler);
    expect(await lock.acquireLock({ holderId: ME })).toBe(true); // 11 min > 10 → stale
  });

  test('returns false when Vikunja throws (fail closed)', async () => {
    mockFetch(() => { throw new Error('boom'); });
    await expect(lock.acquireLock({ holderId: ME })).resolves.toBe(false);
  });

  test('returns false on HTTP error from Vikunja (fail closed)', async () => {
    mockFetch(() => ({ ok: false, status: 500, text: async () => 'server exploded' }));
    await expect(lock.acquireLock({ holderId: ME })).resolves.toBe(false);
  });

  test('returns false when lock-task creation fails', async () => {
    mockFetch(async (url, opts) => {
      if (/\/projects\/2\/tasks/.test(url) && ((opts && opts.method) || 'GET') === 'GET') {
        return okJson([]);
      }
      throw new Error('create failed');
    });
    await expect(lock.acquireLock({ holderId: ME })).resolves.toBe(false);
  });
});

describe('releaseLock', () => {
  test('clears the lock when held by me', async () => {
    const { handler, writes } = boardHandler([lockTask(ME, freshHeartbeat())]);
    mockFetch(handler);
    await lock.releaseLock({ holderId: ME });
    const updates = writes.filter(w => w.kind === 'update');
    expect(updates).toHaveLength(1);
    const desc = parseHeartbeat(updates[0]);
    expect(desc.holder).toBeNull();
    expect(desc.released).toBe(true);
    expect(Date.now() - new Date(desc.heartbeat).getTime()).toBeLessThan(60_000);
  });

  test('does not touch a lock held by someone else', async () => {
    const { handler, writes } = boardHandler([lockTask(OTHER, freshHeartbeat())]);
    mockFetch(handler);
    await lock.releaseLock({ holderId: ME });
    expect(writes).toHaveLength(0);
  });

  test('no-ops when no lock task exists', async () => {
    const { handler, writes } = boardHandler([]);
    mockFetch(handler);
    await lock.releaseLock({ holderId: ME });
    expect(writes).toHaveLength(0);
  });

  test('does not clear when the description is malformed (holder unknown)', async () => {
    const { handler, writes } = boardHandler([
      lockTask(OTHER, freshHeartbeat(), { description: 'garbage' }),
    ]);
    mockFetch(handler);
    await lock.releaseLock({ holderId: ME });
    expect(writes).toHaveLength(0);
  });

  test('never throws when Vikunja errors', async () => {
    mockFetch(() => { throw new Error('boom'); });
    await expect(lock.releaseLock({ holderId: ME })).resolves.toBeUndefined();
  });
});

describe('isLockTask', () => {
  test('matches the exact lock title', () => {
    expect(lock.isLockTask({ title: LOCK_TITLE })).toBe(true);
  });

  test('is case-insensitive', () => {
    expect(lock.isLockTask({ title: '🔒 engine lock — do not complete' })).toBe(true);
  });

  test('matches lock-titled tasks generally', () => {
    expect(lock.isLockTask({ title: 'Engine Lock (stale copy)' })).toBe(true);
  });

  test('rejects ordinary tasks', () => {
    expect(lock.isLockTask({ title: 'Write the launch post' })).toBe(false);
  });

  test('ignores the description — title only', () => {
    expect(lock.isLockTask({ title: 'Something', description: 'about the engine lock' })).toBe(false);
  });

  test('handles a missing title without throwing', () => {
    expect(lock.isLockTask({})).toBe(false);
  });
});
