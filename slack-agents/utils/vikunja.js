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
async function createTask(agentId, projectId, { title, description = '', priority = PRIORITY.NORMAL, dueDate = null } = {}) {
  if (!title) throw new Error('createTask requires a title');
  const body = { title, description, priority };
  if (dueDate) body.due_date = dueDate; // ISO 8601
  return request(agentId, `/projects/${projectId}/tasks`, { method: 'PUT', body });
}

// Partial update: GET the task, merge fields over its current writable state,
// then POST the merged object. (Vikunja's POST /tasks/{id} REPLACES the whole
// task — a bare partial POST silently wipes fields like description.
// Incident 2026-09-25: two task descriptions were wiped this way; restored.)
async function updateTask(agentId, taskId, fields) {
  const current = await getTask(agentId, taskId);
  const keep = {};
  for (const k of ['title', 'description', 'done', 'due_date', 'priority',
                   'start_date', 'end_date', 'hex_color', 'is_favorite',
                   'bucket_id', 'repeat_after', 'repeat_mode']) {
    if (current[k] !== undefined && current[k] !== null) keep[k] = current[k];
  }
  return request(agentId, `/tasks/${taskId}`, { method: 'POST', body: { ...keep, ...fields } });
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
