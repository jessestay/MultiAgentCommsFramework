// engine/directiveTriggers.js — Phase F (Vikunja #789, US-F1.1): the
// directive-scan Hatchet workflow + its cron trigger.
//
// The engine-side intake cycle (engine/directiveScan.js runIntakeCycle)
// is driven by a Hatchet cron trigger — '* * * * *', every minute — on
// a dedicated `directive-scan` workflow. This is the same registration
// pattern as the engine-tick workflow (engine/hatchet.js): declare the
// workflow, create the worker, start it (which registers the workflow
// server-side), then ensure the cron trigger idempotently — the
// embedded Postgres persists across engine restarts, so an identical
// existing trigger is left alone and a changed expression is deleted +
// recreated.
//
// Gating: registration only happens when MACF_ENGINE_INTAKE=1 (checked
// by the caller in runStandalone via engineIntakeEnabled). With the
// flag off, nothing here is registered and the poller keeps its
// Phase B behavior — deployment is a flag flip, rollback is unsetting
// it.
'use strict';

const DIRECTIVE_SCAN_WORKFLOW = 'directive-scan';
const DIRECTIVE_SCAN_TASK = 'scan-directives';
const DIRECTIVE_SCAN_CRON = 'directive-scan-cron';
const DIRECTIVE_SCAN_EXPRESSION = '* * * * *';
const SCAN_RETRIES = 2;
const SCAN_BACKOFF = { factor: 2, maxSeconds: 60 };

function engineIntakeEnabled(env = process.env) {
  return env.MACF_ENGINE_INTAKE === '1';
}

// The scan task body. deps: { runCycle }. A missing cycle is a visible
// no-op ({ ran: false }), mirroring runTaskWork/runDirectiveWork —
// never a silent success, never a throw that hides the miswiring.
async function runDirectiveScan(input, deps) {
  if (!deps || typeof deps.runCycle !== 'function') {
    return { ran: false, reason: 'no intake cycle configured for directive-scan' };
  }
  return deps.runCycle();
}

// Idempotent cron-trigger ensure for the directive-scan workflow.
// Mirrors ensureEngineCron (engine/hatchet.js): call ONLY after the
// worker has started, because the cron client resolves the workflow by
// name server-side.
async function ensureDirectiveScanCron(hatchet, workflow) {
  const crons = hatchet.crons || hatchet.cron; // `crons` is canonical; `cron` is the legacy alias
  let existing;
  try {
    const listed = await crons.list({ workflow });
    existing = (listed && listed.rows || []).find((c) => c && c.name === DIRECTIVE_SCAN_CRON);
  } catch (err) {
    // Fresh engine / transient list failure: fall through to create.
    console.warn('[hatchet] directive-scan cron list failed; attempting create:', err.message);
  }
  if (existing) {
    if (existing.cron === DIRECTIVE_SCAN_EXPRESSION) {
      console.log(`[hatchet] cron trigger "${DIRECTIVE_SCAN_CRON}" already registered with expression "${DIRECTIVE_SCAN_EXPRESSION}" — skipping`);
      return existing;
    }
    const cronId = (existing.metadata && existing.metadata.id) || existing;
    console.log(`[hatchet] cron trigger "${DIRECTIVE_SCAN_CRON}" expression changed ("${existing.cron}" -> "${DIRECTIVE_SCAN_EXPRESSION}") — recreating`);
    await crons.delete(cronId);
  }
  const created = await crons.create(workflow, {
    name: DIRECTIVE_SCAN_CRON,
    expression: DIRECTIVE_SCAN_EXPRESSION,
    input: {},
  });
  console.log(`[hatchet] created cron trigger "${DIRECTIVE_SCAN_CRON}" with expression "${DIRECTIVE_SCAN_EXPRESSION}"`);
  return created;
}

// Register the directive-scan workflow + worker and ensure its cron
// trigger. Mirrors registerTaskWorkflow/registerDirectiveWorkflow.
// `deps` are passed through to the task fn (see runDirectiveScan).
async function registerDirectiveScanWorkflow(hatchet, deps) {
  const workflow = hatchet.workflow({ name: DIRECTIVE_SCAN_WORKFLOW });
  const task = workflow.task({
    name: DIRECTIVE_SCAN_TASK,
    fn: (input) => runDirectiveScan(input, deps),
    retries: SCAN_RETRIES,
    backoff: SCAN_BACKOFF,
  });
  const worker = await hatchet.worker('directive-scan-worker', { workflows: [workflow] });
  console.log('[hatchet] directive-scan-worker started — directive-scan workflow registered server-side');
  worker.start().catch((err) => {
    console.error('[hatchet] directive-scan-worker loop failed:', err && err.message ? err.message : err);
  });
  await ensureDirectiveScanCron(hatchet, workflow);
  return { workflow, task, worker };
}

module.exports = {
  DIRECTIVE_SCAN_WORKFLOW,
  DIRECTIVE_SCAN_TASK,
  DIRECTIVE_SCAN_CRON,
  DIRECTIVE_SCAN_EXPRESSION,
  engineIntakeEnabled,
  runDirectiveScan,
  ensureDirectiveScanCron,
  registerDirectiveScanWorkflow,
};
