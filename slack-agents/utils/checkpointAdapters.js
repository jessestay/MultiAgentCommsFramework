// utils/checkpointAdapters.js — Phase B (Vikunja #789): the durable
// checkpoint store adapter.
//
// Phase A shipped createCheckpointStore with an in-memory adapter; this
// module supplies the production adapter behind the identical
// { get, set, delete, keys } shape: one JSON file per key under a
// directory in the canonical state tree.
//
// WHY FILES, NOT THE HATCHET EMBEDDED POSTGRES (the plan's first choice):
// the embedded Postgres is owned by the engine process's Hatchet sidecar
// — it boots per engine start, listens on a sidecar-chosen port, and its
// credentials travel in a per-boot handshake file under /tmp. The other
// writer of checkpoints, the directive poller, is a short-lived cron
// process with no supported way to discover or attach to that instance.
// The acceptance bar for Phase B storage is durability across process
// restarts AND VM replacement: the canonical .state directory
// (~/workspace/macf/slack-agents/.state — see utils/state.js and
// engine/receipts.js, whose resolution this mirrors) survives both and
// is swept into the nightly Drive backup. The circuit breaker state
// already proves this pattern in production (.state/circuit-breaker.json,
// atomic tmp+rename writes). Because the store is adapter-shaped, a
// Postgres adapter can replace this one later without any call-site
// change; see engine/phase-b-design-notes.md.
//
// Writes are atomic (tmp file + rename in the same directory), so a
// process killed mid-write leaves either the old or the new record,
// never a torn one. The checkpoint store's monotonic stepIndex guard
// covers concurrent writers of the same run.
'use strict';

const fs = require('fs');
const path = require('path');
const { createCheckpointStore } = require('./checkpointStore');

// Same resolution as engine/receipts.js stateDir(): env overrides win;
// the canonical live-state dir is canonical for every user when it
// exists; HOME-based fallback only for bare local dev.
function stateDir() {
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) return process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (process.env.MACF_STATE_DIR) return process.env.MACF_STATE_DIR;
  const canonical = '/home/hatch/workspace/macf/slack-agents/.state';
  try { if (fs.existsSync(canonical)) return canonical; } catch { /* fall through */ }
  return path.join(process.env.HOME || '/home/hatch', 'workspace', 'macf', 'slack-agents', '.state');
}

function resolveCheckpointDir() {
  if (process.env.MACF_CHECKPOINT_DIR) return process.env.MACF_CHECKPOINT_DIR;
  return path.join(stateDir(), 'checkpoints');
}

function createFileAdapter({ dir } = {}) {
  const root = dir || resolveCheckpointDir();
  fs.mkdirSync(root, { recursive: true });
  const fileFor = (key) => path.join(root, `${encodeURIComponent(key)}.json`);
  let seq = 0;
  return {
    _dir: root,
    async get(key) {
      try {
        return await fs.promises.readFile(fileFor(key), 'utf8');
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
    async set(key, value) {
      const target = fileFor(key);
      const tmp = `${target}.tmp-${process.pid}-${++seq}`;
      await fs.promises.writeFile(tmp, String(value), 'utf8');
      await fs.promises.rename(tmp, target);
      // Cross-user handoff (Oct 16, 2026): checkpoints are written by
      // whichever process runs the delegation (poller as root, engine as
      // macf) and read back by the other on resume. World-readable by
      // design, like every other .state file.
      await fs.promises.chmod(target, 0o644).catch(() => {});
    },
    async delete(key) {
      try { await fs.promises.unlink(fileFor(key)); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    },
    async keys() {
      const names = await fs.promises.readdir(root);
      return names
        .filter(n => n.endsWith('.json'))
        .map(n => decodeURIComponent(n.slice(0, -'.json'.length)));
    },
  };
}

function createDurableCheckpointStore({ dir } = {}) {
  return createCheckpointStore(createFileAdapter({ dir: dir || resolveCheckpointDir() }));
}

module.exports = { createFileAdapter, createDurableCheckpointStore, resolveCheckpointDir, stateDir };
