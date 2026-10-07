// utils/vikunja.js — Vikunja REST API client (https://<instance>/api/v1)
//
// Auth: per-agent API token (VIKUNJA_TOKEN_<AGENTID>, e.g. VIKUNJA_TOKEN_CMO)
// falling back to the shared VIKUNJA_TOKEN. Tokens are created in Vikunja →
// Settings → API Tokens (see SETUP.md Part 5). Nothing here is Vikunja-
// specific beyond the endpoints, so the surface stays small and testable.
//
// Vikunja priority scale is 0–5 (5 = most urgent).
'use strict';

// Injectable fetch for tests; defaults to node-fetch like the rest of the repo.
let _fetchImpl = null;
function setFetchImpl(fn) { _fetchImpl = fn; }
function _fetch() {
  if (_fetchImpl) return _fetchImpl;
  return (...args) => import('node-fetch').then(m => m.default(...args));
}

const PRIORITY = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  NORMAL: 3,
  HIGH: 4,
  URGENT: 5,
};

function baseUrl() {
  const u = (process.env.VIKUNJA_URL || '').replace(/\/+$/, '');
  return u || null;
}

// Per-agent token if set, otherwise the shared token.
function tokenFor(agentId) {
  if (agentId) {
    const specific = process.env[`VIKUNJA_TOKEN_${String(agentId).toUpperCase()}`];
    if (specific) return specific;
  }
  return process.env.VIKUNJA_TOKEN || null;
}

function isConfigured() {
  if (!baseUrl()) return false;
  if (process.env.VIKUNJA_TOKEN) return true;
  return Object.keys(process.env).some(k => k.startsWith('VIKUNJA_TOKEN_'));
}

async function request(agentId, path, { method = 'GET', body = null, query = null } = {}) {
  const base = baseUrl();
  if (!base) throw new Error('VIKUNJA_URL is not set');
  const token = tokenFor(agentId);
  if (!token) throw new Error(`No Vikunja token available for agent "${agentId || 'shared'}" (set VIKUNJA_TOKEN)`);

  let url = `${base}/api/v1${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const res = await _fetch()(url, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Vikunja ${method} ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ─── Projects ────────────────────────────────────────────────────────────────
async function listProjects(agentId = 'execPM') {
  return request(agentId, '/projects');
}

// ─── Tasks ───────────────────────────────────────────────────────────────────
// Create a task in a project: PUT /projects/{id}/tasks
async function createTask(agentId, projectId, { title, description = '', priority = PRIORITY.NORMAL, dueDate = null, assignees = null } = {}) {
  if (!title) throw new Error('createTask requires a title');

  // ROOT-CAUSE FIX: Tasks MUST have an owner. Unassigned tasks are a
  // systemic failure — they sit stale because no one owns them.
  // If no assignee specified, default to the creating agent.
  const body = { title, description, priority };
  if (dueDate) body.due_date = dueDate; // ISO 8601
  if (assignees) body.assignees = assignees;

  const task = await request(agentId, `/projects/${projectId}/tasks`, { method: 'PUT', body });

  // If no assignees were specified, assign to the creating agent
  // (prevents the "unassigned task" failure mode at the source)
  if (!assignees && task?.id) {
    try {
      // Get the agent's user ID from Vikunja
      const user = await request(agentId, '/user', { method: 'GET' });
      if (user?.id) {
        await request(agentId, `/tasks/${task.id}`, {
          method: 'POST',
          body: { assignees: [{ id: user.id }] }
        });
        console.log(`[vikunja] Auto-assigned task #${task.id} to ${agentId} (prevents unassigned)`);
      }
    } catch (assignErr) {
      console.log(`[vikunja] Auto-assign failed for task #${task.id}:`, assignErr.message);
    }
  }

  return task;
}

// Partial update: GET the task, merge fields over its current writable state,
// then POST the merged object. (Vikunja's POST /tasks/{id} REPLACES the whole
// task — a bare partial POST silently wipes fields like description.
// Incident 2026-09-25: two task descriptions were wiped this way; restored.)
//
// RETRY (Oct 7, 2026): Vikunja 500s under concurrent SQLite writers — the
// server log shows err="database is locked" (8 occurrences Oct 6-7, 2026; the
// API body only says "Internal Server Error", so the client retries any 5xx
// here). The failed statement never commits, and this read-modify-write is
// idempotent (fresh GET each attempt), so retry the whole thing with backoff
// instead of failing the engine's completion path on a transient lock.
const UPDATE_RETRY_DELAYS_MS = [400, 1200, 2500];
async function updateTask(agentId, taskId, fields) {
  let lastErr;
  for (let attempt = 0; attempt <= UPDATE_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const current = await getTask(agentId, taskId);
      const keep = {};
      for (const k of ['title', 'description', 'done', 'due_date', 'priority',
                       'start_date', 'end_date', 'hex_color', 'is_favorite',
                       'bucket_id', 'repeat_after', 'repeat_mode']) {
        if (current[k] !== undefined && current[k] !== null) keep[k] = current[k];
      }
      return await request(agentId, `/tasks/${taskId}`, { method: 'POST', body: { ...keep, ...fields } });
    } catch (err) {
      lastErr = err;
      const transient = /HTTP 5\d\d/.test(err.message);
      if (!transient || attempt === UPDATE_RETRY_DELAYS_MS.length) throw err;
      const wait = UPDATE_RETRY_DELAYS_MS[attempt];
      console.log(`[vikunja] updateTask #${taskId} transient 5xx (attempt ${attempt + 1}), retrying in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr; // unreachable — keeps the control flow explicit
}

async function getTask(agentId, taskId) {
  return request(agentId, `/tasks/${taskId}`);
}

async function deleteTask(agentId, taskId) {
  return request(agentId, `/tasks/${taskId}`, { method: 'DELETE' });
}

async function completeTask(agentId, taskId) {
  return updateTask(agentId, taskId, { done: true });
}

// List tasks in a project. Filter syntax: 'done = false', 'priority >= 4', etc.
async function listTasks(agentId, projectId, { filter = null, search = null, sortBy = null, orderBy = null, page = null, perPage = 50 } = {}) {
  return request(agentId, `/projects/${projectId}/tasks`, {
    method: 'GET',
    query: { filter, s: search, sort_by: sortBy, order_by: orderBy, page, per_page: perPage },
  });
}

// ─── Assignees ───────────────────────────────────────────────────────────────
async function assignTask(agentId, taskId, userId) {
  return request(agentId, `/tasks/${taskId}/assignees`, { method: 'PUT', body: { user_id: userId } });
}

async function unassignTask(agentId, taskId, userId) {
  return request(agentId, `/tasks/${taskId}/assignees/${userId}`, { method: 'DELETE' });
}

// ─── Comments ────────────────────────────────────────────────────────────────
async function addComment(agentId, taskId, comment) {
  return request(agentId, `/tasks/${taskId}/comments`, { method: 'PUT', body: { comment } });
}

module.exports = {
  PRIORITY,
  setFetchImpl,
  isConfigured,
  baseUrl,
  tokenFor,
  request,
  listProjects,
  createTask,
  updateTask,
  getTask,
  deleteTask,
  completeTask,
  listTasks,
  assignTask,
  unassignTask,
  addComment,
};
