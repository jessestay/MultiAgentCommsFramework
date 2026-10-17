// ics/bus.js — Investor Comms Service: the fan-out bus.
//
// One submission fans out in a single relay cycle to every registered
// surface. Pipeline:
//   1. validate            -> {accepted:false, reason:'validation', errors[]}
//   2. active-CEO check     -> {accepted:false, reason:'unauthorized'} (+ audit)
//   3. dedupe by idempotency_key -> returns the ORIGINAL record, never re-sends
//   4. lane routing         -> 'outcome' is queued for the digest;
//                             'immediate'/'approval' fan out to all surfaces
//   5. per-channel status   -> append-only audit (entries carry `message` so a
//                             crashed relay can be replayed)
//   6. Vikunja mirror       -> best-effort addComment; failure never blocks
//   7. dead letter          -> no channel reached a terminal state; the message
//                             is recorded, never lost silently
//
// replayIncomplete(ctx) re-sends only channels whose latest audit status is
// not terminal (delivered/stubbed) and whose adapter is still registered.
'use strict';

const { validateSubmission } = require('./schema');
const { isAuthorizedEngine } = require('./registry');
const digest = require('./digest');

const EMPTY_SURFACES = { listSurfaces: () => [], getSurface: () => undefined };

function mirrorComment(payload) {
  return `[investor-comms] ${payload.type} (priority ${payload.priority}) fanned out to investor surfaces — key ${payload.idempotency_key}\n${payload.subject}\n\n${payload.body}`;
}

function createBus({ config, audit, surfaces, vikunja } = {}) {
  const surf = surfaces || EMPTY_SURFACES;
  const digestQueue = [];

  function findDeliveryRecord(key) {
    const entries = audit.readAll()
      .filter((e) => e.kind === 'delivery' && e.idempotency_key === key);
    if (!entries.length) return null;
    return entries[entries.length - 1].record;
  }

  function snapshotRecord(record) {
    const entry = audit.append({
      kind: 'delivery',
      idempotency_key: record.idempotency_key,
      record,
    });
    audit.markSeen(record.idempotency_key, entry.id);
  }

  async function submit(payload, ctx) {
    // 1. validation runs before everything else
    const v = validateSubmission(payload);
    if (!v.ok) {
      return { accepted: false, reason: 'validation', errors: v.errors };
    }
    const key = payload.idempotency_key;

    // 2. only the active CEO engine may submit
    if (!isAuthorizedEngine(payload.engine_id, config)) {
      audit.append({
        kind: 'rejected',
        reason: 'unauthorized',
        idempotency_key: key,
        engine_id: payload.engine_id,
      });
      return { accepted: false, reason: 'unauthorized' };
    }

    // 3. dedupe: same key returns the original record, no re-send — even
    //    across a bus restart, because the seen-store and snapshots are on disk
    if (audit.hasSeen(key)) {
      const original = findDeliveryRecord(key);
      if (original) return { ...original, duplicate: true };
      return {
        accepted: true, duplicate: true, idempotency_key: key,
        delivered: false, queued: false, deadLetter: false, channels: {},
      };
    }

    const base = {
      accepted: true,
      idempotency_key: key,
      engine_id: payload.engine_id,
      type: payload.type,
      priority: payload.priority,
      subject: payload.subject,
      body: payload.body,
      vikunja_task_id: payload.vikunja_task_id ?? null,
      actions: payload.actions || [],
    };

    // 4a. outcome lane: queued for the morning digest, never fanned out
    if (payload.type === 'outcome') {
      const record = { ...base, delivered: false, queued: true, deadLetter: false, channels: {} };
      audit.append({
        kind: 'queued', idempotency_key: key,
        engine_id: payload.engine_id, subject: payload.subject,
      });
      digestQueue.push({ ...record });
      try {
        digest.queueOutcome(record);
      } catch (err) {
        // digest staging is best-effort; the queued audit entry is the record
        audit.append({ kind: 'mirror_failed', idempotency_key: key, detail: `digest staging failed: ${err && err.message}` });
      }
      snapshotRecord(record);
      return record;
    }

    // 4b. immediate/approval: fan out to every registered surface in one relay
    const message = {
      idempotency_key: key,
      engine_id: payload.engine_id,
      type: payload.type,
      priority: payload.priority,
      subject: payload.subject,
      body: payload.body,
      actions: payload.actions || [],
      vikunja_task_id: payload.vikunja_task_id ?? null,
    };

    const channels = {};
    for (const name of surf.listSurfaces()) {
      const adapter = surf.getSurface(name);
      if (!adapter) continue;
      let result;
      try {
        result = await adapter.send(ctx, message);
      } catch (err) {
        result = { status: 'failed', detail: err && err.message ? err.message : String(err) };
      }
      const status = (result && result.status) || 'failed';
      channels[name] = { status, detail: result && result.detail, attempts: 1 };
      audit.append({
        kind: 'channel_delivery',
        idempotency_key: key,
        channel: name,
        status,
        detail: result && result.detail,
        message,
      });
    }

    const attempted = Object.keys(channels).length;
    // Dead letter only when every attempted channel terminally failed. Zero
    // registered surfaces is not a failure — the relay completed with nothing
    // to send to (the queued/vikunja records still exist).
    const deadLetter = attempted > 0
      && Object.values(channels).every((c) => c.status === 'failed');
    const delivered = !deadLetter;

    const record = { ...base, delivered, queued: false, deadLetter, channels };

    if (deadLetter) {
      audit.append({
        kind: 'dead_letter',
        idempotency_key: key,
        engine_id: payload.engine_id,
        subject: payload.subject,
        channels: Object.keys(channels),
      });
    }

    // 6. best-effort Vikunja mirror — failure is logged, never blocks delivery
    if (payload.vikunja_task_id != null && vikunja && typeof vikunja.addComment === 'function') {
      try {
        await vikunja.addComment(payload.engine_id, payload.vikunja_task_id, mirrorComment(payload));
      } catch (err) {
        audit.append({
          kind: 'mirror_failed',
          idempotency_key: key,
          vikunja_task_id: payload.vikunja_task_id,
          detail: err && err.message ? err.message : String(err),
        });
      }
    }

    snapshotRecord(record);
    return record;
  }

  async function replayIncomplete(ctx) {
    const entries = audit.readAll().filter((e) => e.kind === 'channel_delivery');
    const latest = new Map(); // `${key} ${channel}` -> latest entry
    for (const e of entries) {
      if (!e.idempotency_key || !e.channel) continue;
      latest.set(`${e.idempotency_key} ${e.channel}`, e);
    }
    const results = [];
    for (const e of latest.values()) {
      if (e.status === 'delivered' || e.status === 'stubbed') continue; // terminal
      const adapter = surf.getSurface(e.channel);
      if (!adapter) continue; // surface uninstalled since the crash
      const message = e.message || {};
      let result;
      try {
        result = await adapter.send(ctx, message);
      } catch (err) {
        result = { status: 'failed', detail: err && err.message ? err.message : String(err) };
      }
      const status = (result && result.status) || 'failed';
      audit.append({
        kind: 'channel_delivery',
        idempotency_key: e.idempotency_key,
        channel: e.channel,
        status,
        detail: result && result.detail,
        message,
        replayed: true,
      });
      results.push({ idempotency_key: e.idempotency_key, channel: e.channel, status });
    }
    return results;
  }

  function getDigestQueue() {
    return digestQueue.map((r) => ({ ...r }));
  }

  return { submit, replayIncomplete, getDigestQueue };
}

module.exports = { createBus };
