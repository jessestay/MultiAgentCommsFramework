// engine/lock.js — Vikunja-backed single-instance heartbeat lock.
//
// The engine can run in two places (VM standalone now, desktop bot later).
// Both must never work the board at the same time — that would double-post
// to Slack and double-ping Jesse. This lock uses a dedicated Vikunja task as
// the shared mutex: whoever holds a fresh heartbeat runs; everyone else
// stands down. Fail closed: any doubt → do NOT assume the lock.
'use strict';

const os = require('os');
const { VIKUNJA } = require('../config');
const vikunja = require('../utils/vikunja');

const LOCK_TITLE = '🔒 ENGINE LOCK — do not complete';
const DEFAULT_TTL_MIN = 10;

function holderId() {
  return `${os.hostname()}:${process.pid}`;
}

function parseHeartbeat(task) {
  try {
    const data = JSON.parse(task.description || '');
    if (data && typeof data.heartbeat === 'string') return data;
  } catch (_) { /* malformed → stale */ }
  return null;
}

function isFresh(heartbeatISO, ttlMin) {
  const ts = new Date(heartbeatISO).getTime();
  if (!Number.isFinite(ts)) return false;
  return (Date.now() - ts) < ttlMin * 60_000;
}

async function findLockTask() {
  const raw = await vikunja.listTasks('execPM', VIKUNJA.projectId, {
    filter: 'done = false', perPage: 50,
  });
  const list = Array.isArray(raw) ? raw : (raw && raw.tasks) || [];
  return list.find(t => isLockTask(t)) || null;
}

function isLockTask(task) {
  return /engine lock/i.test(task && task.title || '');
}

function heartbeatBody(holder, extra = {}) {
  return JSON.stringify({ holder, heartbeat: new Date().toISOString(), ...extra });
}

// Try to acquire the lock. Returns true when this process now holds it.
//
// Options: { holderId, ttlMin = 10 }. holderId defaults to
// '<hostname>:<pid>' for this process — callers (e.g. the work engine)
// should pass it explicitly so the holder is visible at the call site.
async function acquireLock(opts = {}) {
  const { holderId: holderOpt, ttlMin = DEFAULT_TTL_MIN } = opts;
  const holder = holderOpt || holderId();
  try {
    let task = await findLockTask();
    if (!task) {
      task = await vikunja.createTask('execPM', VIKUNJA.projectId, {
        title: LOCK_TITLE,
        description: heartbeatBody(holder),
        priority: vikunja.PRIORITY ? vikunja.PRIORITY.LOW : 0,
      });
      console.log(`[lock] created lock task #${task && task.id}, acquired by ${holder}`);
      return true;
    }
    const hb = parseHeartbeat(task);
    const fresh = hb && isFresh(hb.heartbeat, ttlMin);
    if (fresh && hb.holder && hb.holder !== holder) {
      console.log(`[lock] held by ${hb.holder} (fresh) — standing down`);
      return false;
    }
    await vikunja.updateTask('execPM', task.id, { description: heartbeatBody(holder) });
    console.log(`[lock] acquired by ${holder} (previous: ${hb ? hb.holder : 'none/stale'})`);
    return true;
  } catch (err) {
    console.error('[lock] acquire failed (fail closed):', err.message);
    return false;
  }
}

// Best-effort release. Never throws. Options: { holderId }.
async function releaseLock(opts = {}) {
  const holder = opts.holderId || holderId();
  try {
    const task = await findLockTask();
    if (!task) return;
    const hb = parseHeartbeat(task);
    if (hb && hb.holder === holder) {
      await vikunja.updateTask('execPM', task.id, {
        description: heartbeatBody(null, { released: true }),
      });
      console.log(`[lock] released by ${holder}`);
    }
  } catch (err) {
    console.error('[lock] release failed:', err.message);
  }
}

module.exports = { acquireLock, releaseLock, isLockTask, holderId, LOCK_TITLE, DEFAULT_TTL_MIN };
