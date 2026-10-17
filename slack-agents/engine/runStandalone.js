// engine/runStandalone.js — run the 24/7 work engine NOW, without the Socket bot.
//
// Usage: node engine/runStandalone.js
// Uses only the Slack Web API (chat.postMessage etc.) — no Socket Mode
// connection, so it never fights the desktop bot for the Socket slot.
// The Vikunja heartbeat lock (lock.js) guarantees only one engine copy
// works the board at a time.
'use strict';

require('dotenv').config();

const { WebClient } = require('@slack/web-api');
const { resolveSlackToken } = require('./slackToken');
const workEngine = require('./workEngine');
const tasks = require('../utils/tasks');
const { HATCHET } = require('../config');
const { releaseLock } = require('./lock');

function main() {
  return mainAsync().catch((err) => {
    console.error('[standalone] fatal:', err && err.message);
    process.exit(1);
  });
}

async function mainAsync() {
  const token = resolveSlackToken();
  if (!token) {
    console.error('[standalone] no Slack token available (SLACK_BOT_TOKEN unset and custom.slack surrogate unavailable). Exiting.');
    process.exit(1);
    return; // exit() may be stubbed in tests — never start the engine below
  }
  if (!tasks.isEnabled()) {
    console.error('[standalone] Vikunja is not configured (VIKUNJA_URL/VIKUNJA_TOKEN) — nothing to work from. Exiting.');
    process.exit(1);
    return; // exit() may be stubbed in tests — never start the engine below
  }

  // Hatchet mode: the durable engine-tick workflow drives the cycle. The
  // worker owns the process lifecycle (including SIGTERM/SIGINT and the
  // immediate first tick), so none of the native wiring below runs.
  // HATCHET is read at module load (top-level require) so tests can
  // re-require with fresh env via jest.isolateModules.
  if (HATCHET.ENABLED) {
    console.log('[standalone] HATCHET_ENABLED=1 — booting embedded Hatchet engine');
    const hatchet = require('./hatchet');
    const lock = require('./lock');
    const client = await hatchet.createHatchetClient();
    // The work engine needs its Slack client even in Hatchet mode — without
    // init(), every tick skips with "no Slack client yet". (Bug found live
    // 2026-09-25: Hatchet engine ran but all cycles were no-ops.)
    const slackClient = new WebClient(token);
    // Hatchet's engine-tick cron owns cycle scheduling — the native 30-min
    // interval must stay OFF or runCycle gets double-driven (Oct 12, 2026).
    workEngine.init({ client: slackClient, startTimer: false });
    // M2 (Vikunja #771): register the task-work workflow alongside
    // engine-tick. Dispatch is separately gated on MACF_TASK_WORKFLOW=1:
    // registering the workflow is inert until the flag flips, at which
    // point the cycle dispatches each candidate as a tracked run.
    try {
      const taskWorkflow = require('./taskWorkflow');
      const { workflow } = await taskWorkflow.registerTaskWorkflow(client, {
        workTaskById: workEngine.workTaskById,
      });
      if (process.env.MACF_TASK_WORKFLOW === '1') {
        workEngine.setTaskDispatcher(taskWorkflow.createTaskDispatcher(workflow));
        console.log('[standalone] MACF_TASK_WORKFLOW=1 — candidates dispatch as task-work runs');
      } else {
        console.log('[standalone] task-work workflow registered (dispatch off; set MACF_TASK_WORKFLOW=1 to enable)');
      }
    } catch (err) {
      console.error('[standalone] task-work registration failed (engine continues inline):', err.message);
    }
    // Phase B (Vikunja #789): register the directive-work workflow
    // alongside task-work. The engine owns the embedded Hatchet instance,
    // so the worker lives here; the poller only registers directives in
    // the durable intake (engine/directiveIntake.js). The dispatch loop
    // is separately gated on MACF_DIRECTIVE_WORKFLOW=1 — registering the
    // workflow is inert until the flag flips, at which point the loop
    // drains the intake into tracked runs whose steps execute agent
    // delegations with Phase A checkpointing (durable store + run
    // context). Registration failure never stops the engine: the poller
    // keeps its fail-closed inline path.
    let directiveIntakeStore = null;
    let directiveAgentLoader = null;
    try {
      const directiveWorkflow = require('./directiveWorkflow');
      const { createDurableCheckpointStore } = require('../utils/checkpointAdapters');
      directiveAgentLoader = directiveWorkflow.createAgentLoader({ client: slackClient });
      const { workflow } = await directiveWorkflow.registerDirectiveWorkflow(client, {
        executeDirective: directiveWorkflow.createStepExecutor({
          getAgent: directiveAgentLoader,
          checkpointStore: createDurableCheckpointStore(),
        }),
      });
      if (process.env.MACF_DIRECTIVE_WORKFLOW === '1') {
        const { createIntakeStore, resolveIntakeDir } = require('./directiveIntake');
        directiveIntakeStore = createIntakeStore(resolveIntakeDir());
        directiveWorkflow.startDirectiveDispatchLoop({
          workflow,
          intake: directiveIntakeStore,
        });
        console.log('[standalone] MACF_DIRECTIVE_WORKFLOW=1 — directives dispatch as directive-work runs');
      } else {
        console.log('[standalone] directive-work workflow registered (dispatch off; set MACF_DIRECTIVE_WORKFLOW=1 to enable)');
      }
    } catch (err) {
      console.error('[standalone] directive-work registration failed (poller continues inline):', err.message);
    }
    // Phase F (Vikunja #789): the engine-side intake — the directive
    // scan + finalize cycle moves from the cron poller into this
    // process, driven by a Hatchet cron trigger (directive-scan,
    // every minute). Gated on MACF_ENGINE_INTAKE=1 AND the Phase B
    // workflow path (the cycle's registrations are only meaningful
    // when the dispatch loop is draining the same intake). With the
    // flag on, the cron poller becomes fallback-only: it stands down
    // on a fresh engine heartbeat and resumes full duty only when the
    // heartbeat goes stale. With the flag off, nothing here registers
    // and the system is exactly Phase B. Registration failure never
    // stops the engine (and the poller fallback covers the gap).
    try {
      const directiveTriggers = require('./directiveTriggers');
      if (directiveTriggers.engineIntakeEnabled() && process.env.MACF_DIRECTIVE_WORKFLOW === '1' && directiveIntakeStore) {
        const directiveFinalize = require('./directiveFinalize');
        directiveFinalize.init({
          getAgent: directiveAgentLoader,
          agentIds: ['execPM', 'cmo', 'cco', 'cfo', 'cro', 'cto', 'cuxo', 'jobcoach', 'lawyer', 'facebook', 'hr'],
        });
        const { createDirectiveScanner, runIntakeCycle, DEFAULT_CHANNELS } = require('./directiveScan');
        const { loadPollState, savePollState } = require('./directiveState');
        const { createRetirementTracker } = require('./directiveRetirement');
        const retirement = createRetirementTracker();
        const scanner = createDirectiveScanner({
          client: slackClient,
          intake: directiveIntakeStore,
          channels: DEFAULT_CHANNELS,
          retirement,
        });
        await directiveTriggers.registerDirectiveScanWorkflow(client, {
          runCycle: () => runIntakeCycle({
            client: slackClient,
            intake: directiveIntakeStore,
            scanner,
            finalize: directiveFinalize,
            loadState: () => loadPollState(),
            saveState: (s) => savePollState(s),
            retirement,
          }),
        });
        console.log('[standalone] MACF_ENGINE_INTAKE=1 — engine-side directive intake active (directive-scan cron); poller is fallback-only');
      } else if (directiveTriggers.engineIntakeEnabled()) {
        console.log('[standalone] MACF_ENGINE_INTAKE=1 set but the Phase B workflow path is off — engine intake NOT started (poller remains primary)');
      }
    } catch (err) {
      console.error('[standalone] directive-scan registration failed (poller remains primary):', err.message);
    }
    await hatchet.startEngineWorker(client, {
      runCycle: workEngine.runCycle,
      acquireLock: lock.acquireLock,
      releaseLock: lock.releaseLock,
      holderId: lock.holderId(),
    });
    return;
  }

  const client = new WebClient(token);
  console.log('[standalone] starting 24/7 work engine (Web API mode, no Socket)');
  workEngine.init({ client });

  const shutdown = (signal) => {
    console.log(`[standalone] ${signal} — shutting down`);
    workEngine.stop();
    releaseLock().finally(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Keep the process alive: this no-op interval stays ref'd so the event
  // loop never drains, even if the engine's own interval is stopped.
  // (Never unref() it — an unref'd timer keeps nothing alive.)
  setInterval(() => {}, 1_000_000);
}

if (require.main === module) {
  main();
}

module.exports = { main };
