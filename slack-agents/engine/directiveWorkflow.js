// engine/directiveWorkflow.js — the directive-work Hatchet workflow
// (Phase B, Vikunja #789; completes the #771/M2 migration for the
// directive path).
//
// US-B1: every Slack directive starts as a Hatchet workflow run, and its
// run ID is recorded in the receipts ledger alongside the directive's
// channel and timestamp. US-B2: the agent loop inside the step is a
// Phase A checkpointed loop — the step runs the agent's handleDelegation
// inside a run context (engine/runContext.js) carrying a DETERMINISTIC
// checkpoint run ID derived from the directive's channel:ts and the
// durable checkpoint store (utils/checkpointAdapters.js), so a Hatchet
// step retry, a worker death, or a dead-letter requeue of the same
// directive all resume ONE checkpoint instead of restarting the
// conversation.
//
// Topology (engine/phase-b-design-notes.md): the workflow is registered
// and worked by the long-lived engine process (runStandalone), which
// owns the embedded Hatchet instance. The poller never talks to Hatchet:
// it registers directives in the durable intake (engine/directiveIntake)
// and the dispatch loop started here drains that intake into runs,
// settling each record with the step's result for the poller to
// finalize. Dispatch uses the SDK v3 run-starter (runNoWait), exactly
// like the M2 task dispatcher.
//
// Fail-closed throughout: a step input without a directive identity is a
// no-op that says why; a directive whose agent has no handler throws
// inside the step, so the failure is VISIBLE in the workflow record
// (US-B1.3) instead of a silent drop; completion of the underlying work
// still rests on the existing verifier paths — this module executes
// delegations, it marks nothing done.
'use strict';

const { runWithRunContext } = require('./runContext');

const DIRECTIVE_WORK_WORKFLOW = 'directive-work';
const DIRECTIVE_WORK_TASK = 'execute-directive';
const DIRECTIVE_WORK_RETRIES = 2;
const DIRECTIVE_WORK_BACKOFF = { factor: 2, maxSeconds: 120 };
// A record stuck in a pre-dispatch state longer than this after an
// engine restart is re-dispatched by the loop (its original run, if any,
// died with the previous engine process; the checkpoint run ID makes
// the re-run a resume, not a restart).
const STALE_DISPATCH_MS = 10 * 60 * 1000;

// The checkpoint run ID for a directive. Deterministic on purpose: the
// identity of a directive IS its channel:ts, so every attempt — Hatchet
// retry, worker replacement, poller requeue — addresses the same
// checkpoint.
function directiveRunId(channel, ts) {
  return `directive:${channel}:${ts}`;
}

// The step body. deps: { executeDirective }.
async function runDirectiveWork(input, deps) {
  if (!input || !input.channel || !input.ts) {
    return { ran: false, reason: 'no directive channel/ts in workflow input' };
  }
  return deps.executeDirective(input);
}

// The production step executor. Loads the target agent and runs its
// delegation inside the run context, under the same hang envelope the
// poller used inline (300s default). A missing agent or handler throws —
// Hatchet records the step failure and retries; the failure is visible
// in the run record rather than swallowed (US-B1.3).
function createStepExecutor({ getAgent, checkpointStore, timeoutMs = 300000 } = {}) {
  if (typeof getAgent !== 'function') throw new Error('createStepExecutor requires a getAgent function');
  return async function executeDirective(input) {
    const agent = getAgent(input.agentId);
    if (!agent || typeof agent.handleDelegation !== 'function') {
      throw new Error(`no handler for agent ${input.agentId} — directive ${input.channel}:${input.ts} cannot execute`);
    }
    const runId = directiveRunId(input.channel, input.ts);
    let timer = null;
    try {
      return await runWithRunContext({ runId, checkpointStore }, () => Promise.race([
        agent.handleDelegation(input.text, new Set(), input.channel, input.ts),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Agent ${input.agentId} timed out after ${Math.round(timeoutMs / 1000)}s`)),
            timeoutMs
          );
        }),
      ]));
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

// Agent loader for the engine process: mirrors the poller's wiring
// (agents initialized with the Slack client, sub-delegation relay wired
// once) so a step-side delegation behaves exactly like an inline one.
function createAgentLoader({ client, agentIds } = {}) {
  const ids = agentIds || ['execPM', 'cmo', 'cco', 'cfo', 'cro', 'cto', 'cuxo', 'jobcoach', 'lawyer', 'facebook', 'hr'];
  let loaded = null;
  function loadAll() {
    if (loaded) return loaded;
    loaded = {};
    for (const id of ids) {
      try {
        loaded[id] = require(`../agents/${id}.js`);
        if (client && typeof loaded[id].init === 'function') {
          try { loaded[id].init({ client }); } catch { /* already inited */ }
        }
      } catch (e) {
        console.error(`[directiveWorkflow] failed to load agent ${id}:`, e.message);
      }
    }
    try {
      const delegation = require('../utils/delegation');
      const { DELEGATION_TARGETS } = require('../config');
      delegation.init(loaded, DELEGATION_TARGETS);
    } catch (e) {
      console.error('[directiveWorkflow] delegation relay wiring failed:', e.message);
    }
    return loaded;
  }
  return function getAgent(id) {
    const all = loadAll();
    return all[id] || null;
  };
}

// Register the directive-work workflow + its worker. Mirrors
// registerTaskWorkflow (engine/taskWorkflow.js).
async function registerDirectiveWorkflow(hatchet, deps) {
  const workflow = hatchet.workflow({ name: DIRECTIVE_WORK_WORKFLOW });
  const task = workflow.task({
    name: DIRECTIVE_WORK_TASK,
    fn: (input) => runDirectiveWork(input, deps),
    retries: DIRECTIVE_WORK_RETRIES,
    backoff: DIRECTIVE_WORK_BACKOFF,
  });
  const worker = await hatchet.worker('directive-worker', { workflows: [workflow] });
  console.log('[hatchet] directive-worker started — directive-work workflow registered server-side');
  worker.start().catch((err) => {
    console.error('[hatchet] directive-worker loop failed:', err && err.message ? err.message : err);
  });
  return { workflow, task, worker };
}

// The default run recorder: the workflow run ID lands in the receipts
// ledger (US-B1.1) as an external receipt whose artifact carries the
// directive's channel, its Slack ts, and the checkpoint run ID — the
// head of the US-B2.2 receipt chain. Ledger failures never break
// dispatch (the run itself is the primary record), so this is
// best-effort by design and logs its own failure.
function recordRunReceipt({ agentId, hatchetRunId, channel, ts, checkpointRunId }) {
  try {
    require('./receipts').recordExternalReceipt({
      agentId,
      kind: 'directive_workflow_run',
      ref: hatchetRunId,
      extra: { channel, directiveTs: ts, checkpointRunId },
    });
  } catch (e) {
    console.error('[directiveWorkflow] failed to record run receipt:', e.message);
  }
}

// A dispatcher maps an intake record to a started workflow run. The
// returned `done` promise resolves after the run's output has settled
// the intake record (completed with the step result, or failed with the
// error) — the poller observes the record, never the dispatcher.
function createDirectiveDispatcher(workflow, { intake, recordRun } = {}) {
  const record = typeof recordRun === 'function' ? recordRun : recordRunReceipt;
  return async function dispatchDirective(rec) {
    const checkpointRunId = rec.checkpointRunId || directiveRunId(rec.channel, rec.ts);
    const input = {
      channel: rec.channel,
      ts: rec.ts,
      msgTs: rec.msgTs,
      agentId: rec.agentId,
      text: rec.text,
      checkpointRunId,
    };
    let hatchetRunId = null;
    let outputPromise;
    // SDK v3 (see taskWorkflow.js): runNoWait() is the run-starter that
    // returns a WorkflowRunRef; runId/output are async getters on it.
    if (workflow && typeof workflow.runNoWait === 'function') {
      const ref = await workflow.runNoWait(input);
      try { hatchetRunId = await ref.runId; } catch { /* fall through */ }
      if (!hatchetRunId && ref.metadata && ref.metadata.id) hatchetRunId = ref.metadata.id;
      const out = ref.output;
      outputPromise = Promise.resolve(typeof out === 'function' ? out.call(ref) : out);
      // Attach a handler NOW: the intake update below awaits real I/O,
      // and a step that fails in that window must not surface as an
      // unhandled rejection. The `done` chain still observes the outcome.
      outputPromise.catch(() => {});
    } else {
      // Legacy starter (pre-v3 SDK shape): run() resolves with the step
      // output itself, so the run ID can only ride along on its metadata.
      outputPromise = Promise.resolve(workflow.run(input));
      outputPromise.then(
        (outVal) => { if (!hatchetRunId && outVal && outVal.metadata && outVal.metadata.id) hatchetRunId = outVal.metadata.id; },
        () => { /* rejection settles the record below */ }
      );
    }
    if (intake) {
      await intake.update(rec.key, { status: 'dispatched', hatchetRunId, dispatchedAt: new Date().toISOString() });
    }
    record({ agentId: rec.agentId, hatchetRunId, channel: rec.channel, ts: rec.ts, checkpointRunId });
    const done = Promise.resolve(outputPromise).then(
      async (output) => {
        if (!intake) return;
        if (output && output.ran === false) {
          await intake.update(rec.key, { status: 'failed', error: output.reason || 'workflow reported it did not run' });
        } else {
          await intake.update(rec.key, { status: 'completed', result: output === undefined ? null : output, completedAt: new Date().toISOString() });
        }
      },
      async (err) => {
        if (!intake) return;
        await intake.update(rec.key, { status: 'failed', error: String((err && err.message) || err) });
      }
    );
    return { hatchetRunId, checkpointRunId, done };
  };
}

// The engine-side dispatch loop: heartbeat + drain the intake into
// workflow runs. Started by runStandalone when MACF_DIRECTIVE_WORKFLOW=1.
// drainOnce is exported on the returned handle for tests and for the
// engine's own diagnostics; the interval is the production driver.
function startDirectiveDispatchLoop({ workflow, intake, intervalMs = 5000, staleMs = STALE_DISPATCH_MS } = {}) {
  if (!workflow || !intake) throw new Error('startDirectiveDispatchLoop requires { workflow, intake }');
  const dispatch = createDirectiveDispatcher(workflow, { intake });
  let draining = false;

  async function drainOnce(now = Date.now()) {
    intake.touchHeartbeat();
    if (draining) return 0;
    draining = true;
    try {
      let picked = 0;
      const fresh = await intake.list('registered');
      for (const rec of fresh) {
        await intake.update(rec.key, { status: 'dispatching', dispatchClaimedAt: new Date(now).toISOString() });
        // Floating on purpose: dispatch() settles the record when the
        // run output settles; the loop must not serialize on run length.
        dispatch(rec).catch(async (e) => {
          try { await intake.update(rec.key, { status: 'failed', error: `dispatch failed: ${e.message}` }); } catch { /* record gone */ }
        });
        picked++;
      }
      // Engine-restart recovery: a record claimed/dispatched before the
      // previous engine died can never settle (its run died with that
      // engine). Re-dispatch it — the deterministic checkpoint run ID
      // makes the new run resume the same conversation.
      for (const status of ['dispatching', 'dispatched']) {
        const stuck = await intake.list(status);
        for (const rec of stuck) {
          const claimedAt = Date.parse(rec.dispatchClaimedAt || rec.dispatchedAt || rec.registeredAt || '') || 0;
          if (claimedAt && now - claimedAt > staleMs) {
            await intake.update(rec.key, { status: 'registered', redispatchAfterStale: new Date(now).toISOString() });
            picked++;
          }
        }
      }
      return picked;
    } finally {
      draining = false;
    }
  }

  const timer = setInterval(() => { drainOnce().catch(e => console.error('[directiveWorkflow] dispatch loop tick failed:', e.message)); }, intervalMs);
  drainOnce().catch(e => console.error('[directiveWorkflow] initial dispatch drain failed:', e.message));
  return { stop: () => clearInterval(timer), drainOnce };
}

module.exports = {
  DIRECTIVE_WORK_WORKFLOW,
  DIRECTIVE_WORK_TASK,
  DIRECTIVE_WORK_RETRIES,
  DIRECTIVE_WORK_BACKOFF,
  directiveRunId,
  runDirectiveWork,
  createStepExecutor,
  createAgentLoader,
  registerDirectiveWorkflow,
  createDirectiveDispatcher,
  startDirectiveDispatchLoop,
  recordRunReceipt,
};
