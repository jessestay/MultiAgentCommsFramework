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

// Register the engine-tick task + workflow + cron trigger on a client.
// `deps` are passed through to the task fn (see runEngineTick).
async function registerEngineWorkflows(hatchet, deps) {
  const task = hatchet.task({
    name: ENGINE_TICK_TASK,
    fn: () => runEngineTick(deps),
    retries: TICK_RETRIES,
    backoff: TICK_BACKOFF,
  });
  const workflow = hatchet.workflow({
    name: ENGINE_TICK_WORKFLOW,
    tasks: [task],
  });
  await hatchet.cron.create(workflow, {
    name: ENGINE_TICK_CRON,
    expression: cronSchedule(),
    input: {},
  });
  console.log(`[hatchet] registered ${ENGINE_TICK_WORKFLOW} on cron "${cronSchedule()}"`);
  return { workflow, task };
}

// Register workflows, start the worker, fire one immediate tick (mirrors the
// native engine's 90s first-cycle), and wire graceful shutdown.
// `deps`: { runCycle, acquireLock, releaseLock?, holderId }. Returns the worker.
async function startEngineWorker(hatchet, deps) {
  const { workflow } = await registerEngineWorkflows(hatchet, deps);
  const worker = await hatchet.worker('engine-worker', { workflows: [workflow] });
  await worker.start();
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
  registerEngineWorkflows,
  startEngineWorker,
  ENGINE_TICK_WORKFLOW,
  ENGINE_TICK_TASK,
  ENGINE_TICK_CRON,
  DEFAULT_CRON,
  TICK_RETRIES,
  TICK_BACKOFF,
};
