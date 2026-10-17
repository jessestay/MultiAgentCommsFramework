// utils/checkpointStore.js — Phase A, US-A1/A2/X2 (Vikunja #789).
//
// Per-step conversation checkpointing: after every durability boundary
// (one completed LLM call, or one completed tool batch) the agent loop
// writes the full message array, step index, tool results, and token
// counters here, keyed by run ID. A fresh attempt on the same run loads
// the checkpoint and resumes mid-conversation instead of restarting from
// the assignment text (the Oct 15/16 Graham failure mode: attempts died
// and took every completed, already-paid-for step with them).
//
// The store is adapter-based: any async KV adapter with
// { get, set, delete, keys } works. createMemoryAdapter() is the
// in-memory implementation used by tests and short-lived processes; the
// production adapter persists the same serialized records in Postgres
// (the plan's Phase A storage) behind the identical shape.
//
// Records are stored SERIALIZED (JSON): a checkpoint is a snapshot, never
// a live reference — mutating the caller's arrays after a save cannot
// leak into the store, and a reader always gets an independent copy.
//
// Lifecycle (US-X2): a checkpoint's status is 'running' while its run is
// active; terminal statuses are 'done', 'cancelled', 'permanently_dead'.
// pruneCompleted() deletes terminal checkpoints past the retention window
// and ANY checkpoint past the absolute expiry, and reports the count.

const { compactHistory } = require('./historyCompaction');

const TERMINAL_STATUSES = ['done', 'cancelled', 'permanently_dead'];
const ckKey = (runId) => `checkpoint:${runId}`;
const qKey = (runId) => `quarantine:${runId}`;

function deepCopy(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function zeroTokens() {
  return { promptTokens: 0, completionTokens: 0 };
}

function normTokens(t) {
  if (!t || typeof t !== 'object') return zeroTokens();
  const out = {
    promptTokens: Number(t.promptTokens) || 0,
    completionTokens: Number(t.completionTokens) || 0,
  };
  // Phase D (#789): cached-token counters ride along LAZILY — present only
  // when the writer supplied them, so token records keep their exact
  // pre-Phase-D shape whenever no provider reported cache data.
  if (t.cachedTokens !== undefined) out.cachedTokens = Number(t.cachedTokens) || 0;
  if (t.cacheCreationTokens !== undefined) out.cacheCreationTokens = Number(t.cacheCreationTokens) || 0;
  return out;
}

// ─── Adapter ────────────────────────────────────────────────────────────────

function createMemoryAdapter() {
  const map = new Map();
  return {
    _map: map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async set(key, value) { map.set(key, value); },
    async delete(key) { map.delete(key); },
    async keys() { return [...map.keys()]; },
  };
}

// ─── Validators ─────────────────────────────────────────────────────────────

// Structural validation of a stored checkpoint record (US-A1).
function validateCheckpoint(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { valid: false, errors: ['checkpoint record must be an object'] };
  }
  const errors = [];
  if (typeof record.runId !== 'string' || record.runId.length === 0) {
    errors.push('runId must be a non-empty string');
  }
  if (!Array.isArray(record.messages)) {
    errors.push('messages must be an array');
  } else {
    record.messages.forEach((m, i) => {
      if (!m || typeof m !== 'object' || typeof m.role !== 'string' || m.role.length === 0) {
        errors.push(`messages[${i}] must be a message object with a role`);
      }
    });
  }
  if (typeof record.stepIndex !== 'number' || !Number.isFinite(record.stepIndex)) {
    errors.push('stepIndex must be a number');
  }
  return { valid: errors.length === 0, errors };
}

// Conversational validation of a message history (US-A2): non-empty, the
// first message is the user turn, and every tool result answers a tool
// call issued by the preceding assistant message. A history that fails
// this cannot be resumed — it would wedge or confuse the next attempt.
function validateHistory(messages) {
  if (!Array.isArray(messages)) {
    return { valid: false, errors: ['history must be an array of messages'] };
  }
  if (messages.length === 0) {
    return { valid: false, errors: ['history must not be empty'] };
  }
  const errors = [];
  if (!messages[0] || messages[0].role !== 'user') {
    errors.push('first message must be the user turn');
  }
  // Tool-call ids offered by the most recent assistant message.
  let pending = new Set();
  messages.forEach((m, i) => {
    if (!m || typeof m !== 'object' || typeof m.role !== 'string') {
      errors.push(`messages[${i}] is not a well-formed message`);
      return;
    }
    if (m.role === 'assistant') {
      pending = new Set(
        (Array.isArray(m.tool_calls) ? m.tool_calls : [])
          .map(tc => tc && tc.id)
          .filter(id => typeof id === 'string' && id.length > 0)
      );
    } else if (m.role === 'tool') {
      if (!m.tool_call_id || !pending.has(m.tool_call_id)) {
        errors.push(`messages[${i}] tool result '${m.tool_call_id}' matches no tool_call in the preceding assistant message`);
      }
    }
  });
  return { valid: errors.length === 0, errors };
}

// The state a fresh attempt needs to continue a run, as an independent
// deep copy — mutating the resume state must never corrupt the store.
function buildResumeState(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') return null;
  return {
    messages: deepCopy(Array.isArray(checkpoint.messages) ? checkpoint.messages : []),
    stepIndex: typeof checkpoint.stepIndex === 'number' ? checkpoint.stepIndex : 0,
    toolResults: deepCopy(Array.isArray(checkpoint.toolResults) ? checkpoint.toolResults : []),
    tokens: normTokens(checkpoint.tokens),
  };
}

// ─── Store ──────────────────────────────────────────────────────────────────

function createCheckpointStore(adapter) {
  if (!adapter || typeof adapter.get !== 'function' || typeof adapter.set !== 'function') {
    throw new Error('createCheckpointStore requires a KV adapter { get, set, delete, keys }');
  }

  async function readRaw(runId) {
    const raw = await adapter.get(ckKey(runId));
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch {
      // Unparseable stored bytes: hand back a shape validation will
      // reject, so the caller quarantines instead of wedging.
      return { runId, _unparseable: true };
    }
  }

  async function saveCheckpoint(runId, payload = {}) {
    const existing = await readRaw(runId);
    const updatedAt = typeof payload.at === 'number' ? payload.at : Date.now();
    const stepIndex = typeof payload.stepIndex === 'number'
      ? payload.stepIndex
      : (existing && typeof existing.stepIndex === 'number' ? existing.stepIndex : 0);
    // Monotonic guard: a stale writer must never regress a checkpoint to
    // an earlier step — the newest step's state is the resumable truth.
    if (existing && typeof existing.stepIndex === 'number' && stepIndex < existing.stepIndex) {
      return deepCopy(existing);
    }
    const rawMessages = Array.isArray(payload.messages)
      ? payload.messages
      : (existing && Array.isArray(existing.messages) ? existing.messages : []);
    // US-A4: histories are compacted before they are stored (identity
    // below the threshold, so short histories are stored verbatim).
    const { messages } = compactHistory(rawMessages);
    const record = {
      runId,
      stepIndex,
      messages: deepCopy(messages),
      toolResults: payload.toolResults !== undefined
        ? deepCopy(payload.toolResults)
        : (existing && Array.isArray(existing.toolResults) ? deepCopy(existing.toolResults) : []),
      tokens: payload.tokens !== undefined
        ? normTokens(payload.tokens)
        : (existing ? normTokens(existing.tokens) : zeroTokens()),
      status: payload.status || (existing && existing.status) || 'running',
      createdAt: existing && typeof existing.createdAt === 'number' ? existing.createdAt : updatedAt,
      updatedAt,
    };
    if (payload.response !== undefined) record.response = payload.response;
    else if (existing && existing.response !== undefined) record.response = existing.response;
    await adapter.set(ckKey(runId), JSON.stringify(record));
    return deepCopy(record);
  }

  async function loadCheckpoint(runId) {
    const rec = await readRaw(runId);
    return rec ? deepCopy(rec) : null;
  }

  // Same record as loadCheckpoint — the store keeps exactly one (latest)
  // checkpoint per run, guarded monotonic on stepIndex.
  async function latestCheckpoint(runId) {
    return loadCheckpoint(runId);
  }

  // Move a run's checkpoint out of the active set and record why
  // (US-A2.4): a corrupt checkpoint must neither wedge the task nor
  // vanish without a trace.
  async function quarantineCheckpoint(runId, reason) {
    const rec = await readRaw(runId);
    if (rec === null || rec === undefined) return null;
    const entry = {
      runId,
      reason: reason || 'invalid checkpoint',
      record: deepCopy(rec),
      quarantinedAt: Date.now(),
    };
    let list = [];
    const rawQ = await adapter.get(qKey(runId));
    if (rawQ !== null && rawQ !== undefined) {
      try {
        const parsed = typeof rawQ === 'string' ? JSON.parse(rawQ) : rawQ;
        list = Array.isArray(parsed) ? parsed : [parsed];
      } catch { list = []; }
    }
    list.push(entry);
    await adapter.set(qKey(runId), JSON.stringify(list));
    await adapter.delete(ckKey(runId));
    return deepCopy(entry);
  }

  async function getQuarantined(runId) {
    const rawQ = await adapter.get(qKey(runId));
    if (rawQ === null || rawQ === undefined) return [];
    try {
      const parsed = typeof rawQ === 'string' ? JSON.parse(rawQ) : rawQ;
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch { return []; }
  }

  // US-X2 pruning: terminal checkpoints older than the retention window
  // are deleted; ANY checkpoint older than the absolute expiry is
  // deleted; active checkpoints inside the absolute expiry are never
  // touched. Reports exactly how many were removed.
  async function pruneCompleted({ now = Date.now(), retentionMs, absoluteExpiryMs } = {}) {
    let removed = 0;
    const keys = await adapter.keys();
    for (const key of keys) {
      if (!key.startsWith('checkpoint:')) continue;
      const raw = await adapter.get(key);
      if (raw === null || raw === undefined) continue;
      let rec;
      try { rec = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { continue; }
      if (!rec || typeof rec !== 'object') continue;
      const updatedAt = typeof rec.updatedAt === 'number' ? rec.updatedAt : 0;
      const age = now - updatedAt;
      const pastAbsolute = typeof absoluteExpiryMs === 'number' && age > absoluteExpiryMs;
      const pastRetention = typeof retentionMs === 'number' && age > retentionMs;
      if (pastAbsolute || (TERMINAL_STATUSES.includes(rec.status) && pastRetention)) {
        await adapter.delete(key);
        removed++;
      }
    }
    return { removed };
  }

  return {
    saveCheckpoint,
    loadCheckpoint,
    latestCheckpoint,
    quarantineCheckpoint,
    getQuarantined,
    pruneCompleted,
  };
}

module.exports = {
  createCheckpointStore,
  createMemoryAdapter,
  validateCheckpoint,
  validateHistory,
  buildResumeState,
  TERMINAL_STATUSES,
};
