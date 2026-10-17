// engine/directiveIntake.js — Phase B (Vikunja #789): the durable
// directive intake — the outbox between the poller and the engine.
//
// Topology constraint (see engine/phase-b-design-notes.md): Hatchet here
// is the EMBEDDED engine — a sidecar owned by the long-lived engine
// process, booted per start with its token in a /tmp handshake file. The
// directive poller is a short-lived cron process; it cannot attach to
// the engine's Hatchet instance, and booting its own embedded instance
// would create a second, empty workflow registry (split-brain). So the
// poller does what the Phase B stories actually require of it — it
// becomes a thin intake:
//
//   1. The poller REGISTERS each accepted directive here (durable,
//      file-backed, one JSON record per directive under the canonical
//      .state dir — survives process restarts and VM replacement).
//   2. The engine's directive dispatch loop (engine/directiveWorkflow.js)
//      picks up registered records, dispatches each as a directive-work
//      Hatchet run, and settles the record completed/failed with the
//      step's result.
//   3. The poller awaits the record (bounded wait) and finalizes exactly
//      as it always has — validation, posting, verifier queueing live in
//      the poller and are untouched by Phase B.
//
// The engine also stamps a heartbeat file here every dispatch-loop tick;
// the poller only takes the workflow path when the heartbeat is fresh,
// and only falls back to inline execution when no workflow run can have
// started (stale heartbeat, or registration itself failing). A record
// that was dispatched but never settles resolves to a poller-side
// timeout -> null -> the existing retry/dead-letter machinery — never a
// duplicate inline execution of work a workflow may still be running.
//
// Write discipline: the poller writes 'registered' records; the engine
// is the only writer of status transitions after that; the poller only
// reads. Every write is atomic (tmp + rename).
'use strict';

const fs = require('fs');
const path = require('path');
const { stateDir } = require('../utils/checkpointAdapters');

function resolveIntakeDir() {
  if (process.env.MACF_DIRECTIVE_INTAKE_DIR) return process.env.MACF_DIRECTIVE_INTAKE_DIR;
  return path.join(stateDir(), 'directive-intake');
}

function keyFor(channel, ts) {
  return `${channel}:${ts}`;
}

const HEARTBEAT_FILE = 'engine-heartbeat.json';

function createIntakeStore(dir) {
  const root = dir || resolveIntakeDir();
  fs.mkdirSync(root, { recursive: true });
  const fileFor = (key) => path.join(root, `${encodeURIComponent(key)}.json`);
  let seq = 0;

  async function writeRecord(key, record) {
    const target = fileFor(key);
    const tmp = `${target}.tmp-${process.pid}-${++seq}`;
    await fs.promises.writeFile(tmp, JSON.stringify(record, null, 2), 'utf8');
    await fs.promises.rename(tmp, target);
    // Cross-user handoff (Oct 16, 2026 deployment find): the poller runs
    // as root, the engine as macf. A record written under a restrictive
    // umask lands 660 root:root and the engine cannot read it — the
    // dispatch loop then skips it forever. Every state file in this
    // handoff is world-readable by design (same rule as the receipts and
    // circuit-breaker state files).
    await fs.promises.chmod(target, 0o644).catch(() => {});
    return record;
  }

  async function readRecord(key) {
    try {
      const raw = await fs.promises.readFile(fileFor(key), 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  return {
    dir: root,
    keyFor,

    // Idempotent: the FIRST registration of a channel:ts wins. A retry
    // cycle re-registering the same directive gets the existing record
    // (and its current status) back, never a duplicate.
    async register(record) {
      const key = keyFor(record.channel, record.ts);
      const existing = await readRecord(key);
      if (existing) return existing;
      const fresh = {
        key,
        channel: record.channel,
        ts: record.ts,
        msgTs: record.msgTs,
        agentId: record.agentId,
        text: record.text,
        checkpointRunId: record.checkpointRunId,
        // Phase F (Vikunja #789): two optional fields ride along.
        // kind distinguishes real directives from roadblock routings
        // (the finalize consumer treats roadblocks as fire-and-forget,
        // exactly like the poller's roadblock branch). requeues carries
        // the dead-letter requeue count so a record settled by the
        // engine finalizes with the same retry bookkeeping the poller
        // would have used. Absent = 'directive' / 0, as in Phase B.
        kind: record.kind || 'directive',
        requeues: record.requeues || 0,
        status: 'registered',
        registeredAt: new Date().toISOString(),
      };
      return writeRecord(key, fresh);
    },

    async get(key) {
      return readRecord(key);
    },

    async update(key, patch) {
      const current = await readRecord(key);
      if (!current) return null;
      return writeRecord(key, { ...current, ...patch, updatedAt: new Date().toISOString() });
    },

    async list(status) {
      const names = await fs.promises.readdir(root);
      const out = [];
      for (const name of names) {
        if (!name.endsWith('.json') || name === HEARTBEAT_FILE) continue;
        let rec;
        try { rec = JSON.parse(await fs.promises.readFile(path.join(root, name), 'utf8')); }
        catch (e) {
          // A record that cannot be READ (e.g. EACCES from a cross-user
          // permission mismatch) must be LOUD, not silently skipped —
          // the Oct 16, 2026 stall hid exactly here. Parse failures of
          // readable files stay silent (corrupt-record handling lives
          // in the checkpoint store).
          if (e && e.code && e.code !== 'ENOENT' && !(e instanceof SyntaxError)) {
            console.error(`[directiveIntake] cannot read intake record ${name}: ${e.code || e.message}`);
          }
          continue;
        }
        if (rec && (!status || rec.status === status)) out.push(rec);
      }
      return out;
    },

    // Engine liveness, stamped by the dispatch loop each tick. Sync on
    // purpose: both callers are hot paths that must not await.
    touchHeartbeat() {
      const target = path.join(root, HEARTBEAT_FILE);
      const tmp = `${target}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify({ at: Date.now() }), 'utf8');
      fs.renameSync(tmp, target);
      try { fs.chmodSync(target, 0o644); } catch { /* best effort */ }
    },

    heartbeatFresh(maxAgeMs) {
      try {
        const raw = fs.readFileSync(path.join(root, HEARTBEAT_FILE), 'utf8');
        const at = Number(JSON.parse(raw).at) || 0;
        return at > 0 && (Date.now() - at) <= maxAgeMs;
      } catch {
        return false;
      }
    },
  };
}

module.exports = { createIntakeStore, resolveIntakeDir, keyFor };
