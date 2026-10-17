// engine/hatchet.js — Hatchet (embedded, free, MIT) as MACF's durable execution layer.
//
// The native engine (workEngine's in-process 30-min loop) keeps working as-is.
// When HATCHET_ENABLED=1, the cycle is instead driven by an embedded Hatchet
// engine: a durable `engine-tick` workflow on a cron schedule, with retries and
// crash-resume, so a cycle survives process restarts instead of being lost.
//
// Design notes:
//   - Locking is unchanged: every tick acquires the Vikunja heartbeat lock
//     FIRST (engine/lock.js) and skips when another instance holds it. VM and
//     desktop each run their own embedded Hatchet; the lock still arbitrates.
//   - Cycle internals are NOT rewritten: the tick invokes the existing
//     workEngine.runCycle(). Hatchet adds durability around it, not inside it.
//   - All lock functions are injected via `deps` (never hard-required here) so
//     the tick is unit-testable without Vikunja I/O.
//   - Unit tests mock `@hatchet-dev/typescript-sdk/v1/embedded` entirely; the
//     real embedded boot was smoke-tested separately (needs a non-root user,
//     because bundled Postgres initdb refuses root).
'use strict';

// Cron schedule is read from config at load time (config reads HATCHET_*
// env at require time) — see tests/hatchet.test.js.
const { HATCHET } = require('../config');

const ENGINE_TICK_WORKFLOW = 'engine-tick';
const ENGINE_TICK_TASK = 'engine-tick-task';
const ENGINE_TICK_CRON = 'engine-tick-cron';
const DEFAULT_CRON = '*/30 * * * *';
const TICK_RETRIES = 3;
const TICK_BACKOFF = { factor: 2, maxSeconds: 300 };

function cronSchedule() {
  return (HATCHET && HATCHET.CRON) || DEFAULT_CRON;
}

// Boot a full Hatchet engine in-process (bundled Postgres). No token, no
// account, no Docker, no cloud — $0 infra. Must run as a non-root user.
async function createHatchetClient() {
  const { HatchetEmbeddedClient } = require('@hatchet-dev/typescript-sdk/v1/embedded');
  const client = await HatchetEmbeddedClient.init();
  console.log('[hatchet] embedded engine ready');
  return client;
}

// One durable tick: acquire the Vikunja lock first, fail closed. Returns
// { ran: true } when the cycle executed, { ran: false, reason } otherwise.
// `deps`: { runCycle, acquireLock, holderId }.
async function runEngineTick(deps) {
  const { runCycle, acquireLock, holderId } = deps;
  let holdsLock = false;
  try {
    holdsLock = await acquireLock({ holderId });
  } catch (err) {
    console.error('[hatchet] lock check failed (fail closed):', err.message);
    return;
  }
  if (!holdsLock) {
    console.log('[hatchet] lock held elsewhere — tick skipped');
    return;
  }
  await runCycle();
}

// Idempotent cron-trigger ensure for the engine-tick workflow.
//
// BUG FIX (2026-09-25): in the v1 SDK, `hatchet.workflow()` only builds a
// LOCAL declaration — the workflow registers with the engine when the
// worker STARTS. The cron client resolves the workflow by NAME server-side,
// so crons.create BEFORE worker.start() resolves -> HTTP 400
// 'workflow not found' -> [standalone] fatal, process exits. Callers must
// therefore: declare -> create worker -> await worker.start() -> THEN call
// this.
//
// Idempotency: the embedded Postgres persists in ~/.hatchet-embedded across
// restarts, so a second boot must not fail re-creating the trigger. This
// lists existing triggers, skips creation when 'engine-tick-cron' already
// exists with the same expression (log it), and deletes + recreates when
// the expression differs. Returns the existing or newly created trigger.
async function ensureEngineCron(hatchet, workflow) {
  const expression = cronSchedule();
  const crons = hatchet.crons || hatchet.cron; // `crons` is canonical; `cron` is the legacy alias
  let existing;
  try {
    const listed = await crons.list({ workflow });
    existing = (listed && listed.rows || []).find((c) => c && c.name === ENGINE_TICK_CRON);
  } catch (err) {
    // Fresh engine / transient list failure: fall through to create, which
    // succeeds when no conflicting trigger exists.
    console.warn('[hatchet] cron list failed; attempting create:', err.message);
  }
  if (existing) {
    if (existing.cron === expression) {
      console.log(`[hatchet] cron trigger "${ENGINE_TICK_CRON}" already registered with expression "${expression}" — skipping`);
      return existing;
    }
    const cronId = (existing.metadata && existing.metadata.id) || existing;
    console.log(`[hatchet] cron trigger "${ENGINE_TICK_CRON}" expression changed ("${existing.cron}" -> "${expression}") — recreating`);
    await crons.delete(cronId);
  }
  const created = await crons.create(workflow, {
    name: ENGINE_TICK_CRON,
    expression,
    input: {},
  });
  console.log(`[hatchet] created cron trigger "${ENGINE_TICK_CRON}" with expression "${expression}"`);
  return created;
}

// Register the engine-tick task + workflow, start the engine worker, and
// ensure the cron trigger — in THAT order (see ensureEngineCron).
// `deps` are passed through to the task fn (see runEngineTick).
// Returns { workflow, task, worker }.
async function registerEngineWorkflows(hatchet, deps) {
  // v1 SDK API shape (see @hatchet-dev/typescript-sdk/v1/declaration.d.ts):
  // `hatchet.workflow()` takes NO `tasks` option — its options are name /
  // description / concurrency / onCrons / onEvents etc. Tasks attach via
  // `workflow.task({...})`. Passing a bogus `tasks` key is silently ignored
  // and the server then rejects PutWorkflow with "tasks list cannot be nil"
  // (seen live 2026-09-25).
  const workflow = hatchet.workflow({ name: ENGINE_TICK_WORKFLOW });
  const task = workflow.task({
    name: ENGINE_TICK_TASK,
    fn: () => runEngineTick(deps),
    retries: TICK_RETRIES,
    backoff: TICK_BACKOFF,
  });
  // worker.start() registers the workflow server-side; the cron trigger can
  // only resolve it by name AFTER this (see ensureEngineCron).
  const worker = await hatchet.worker('engine-worker', { workflows: [workflow] });
  // NOTE (2026-09-25, found live): the v1 SDK's worker.start() "resolves when
  // the worker is stopped or killed" — it runs the blocking action-listener
  // loop and never resolves during normal operation. Awaiting it hangs the
  // boot forever (the worker IS healthy and listening; the cron + immediate
  // tick below simply never run). Registration (PutWorkflow) already completed
  // inside hatchet.worker() — Worker.create awaits registerWorkflows — so run
  // start() in the background and proceed.
  console.log('[hatchet] engine-worker started — workflow registered server-side');
  worker.start().catch((err) => {
    console.error('[hatchet] worker loop failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  });
  await ensureEngineCron(hatchet, workflow);
  console.log(`[hatchet] registered ${ENGINE_TICK_WORKFLOW} on cron "${cronSchedule()}"`);
  return { workflow, task, worker };
}

// Register workflows, start the worker, fire one immediate tick (mirrors the
// native engine's 90s first-cycle), and wire graceful shutdown.
// `deps`: { runCycle, acquireLock, releaseLock?, holderId }. Returns the worker.
async function startEngineWorker(hatchet, deps) {
  const { worker } = await registerEngineWorkflows(hatchet, deps);
  console.log('[hatchet] worker started');

  // Immediate tick on boot; cron drives the rest.
  try {
    await runEngineTick(deps);
  } catch (err) {
    console.error('[hatchet] immediate tick failed:', err.message);
  }

  const shutdown = async (signal) => {
    console.log(`[hatchet] ${signal} — shutting down`);
    try {
      await worker.stop();
    } catch (err) {
      console.error('[hatchet] worker.stop failed:', err.message);
    }
    if (deps.releaseLock) {
      try {
        await deps.releaseLock({ holderId: deps.holderId });
      } catch (err) {
        console.error('[hatchet] lock release failed:', err.message);
      }
    }
    try {
      await hatchet.stopEmbedded();
    } catch (err) {
      console.error('[hatchet] stopEmbedded failed:', err.message);
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return worker;
}

module.exports = {
  createHatchetClient,
  runEngineTick,
  ensureEngineCron,
  registerEngineWorkflows,
  startEngineWorker,
  ENGINE_TICK_WORKFLOW,
  ENGINE_TICK_TASK,
  ENGINE_TICK_CRON,
  DEFAULT_CRON,
  TICK_RETRIES,
  TICK_BACKOFF,
};
