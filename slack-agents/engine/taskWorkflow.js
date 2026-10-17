// engine/taskWorkflow.js — the task-work Hatchet workflow (M2, Vikunja #771).
//
// US-1/US-9 of EXECUTION-KERNEL-SPEC.md: every task the engine works
// runs as its own tracked workflow run instead of an opaque in-process
// call inside the 30-minute cycle. The run input is ONLY the task ID —
// the step re-reads the task from the system of record at execution
// time (workEngine.workTaskById), so a retried or resumed step always
// works the task's current state, never a stale snapshot.
//
// The workflow adds tracking + step-level retry around the existing
// lifecycle; it does not change what working a task means. Completion
// still goes through the single verifier (engine/completion.js) inside
// workTask — a workflow run can fail and retry, but it cannot mark
// anything done by itself.
//
// Enablement: registration happens at engine boot (runStandalone) and
// dispatch is gated on MACF_TASK_WORKFLOW=1 with an injected
// dispatcher; with the flag off the cycle works its candidate inline
// exactly as before.
'use strict';

const TASK_WORK_WORKFLOW = 'task-work';
const TASK_WORK_TASK = 'execute-task';
const TASK_WORK_RETRIES = 2;
const TASK_WORK_BACKOFF = { factor: 2, maxSeconds: 120 };

// The step body. deps: { workTaskById }.
async function runTaskWork(input, deps) {
  const taskId = input && input.taskId;
  if (!taskId) return { ran: false, reason: 'no taskId in workflow input' };
  return deps.workTaskById(taskId);
}

// Register the task-work workflow + its worker. Mirrors hatchet.js:
// worker.start() never resolves during normal operation, so it runs in
// the background after registration completes inside hatchet.worker().
async function registerTaskWorkflow(hatchet, deps) {
  const workflow = hatchet.workflow({ name: TASK_WORK_WORKFLOW });
  const task = workflow.task({
    name: TASK_WORK_TASK,
    fn: (input) => runTaskWork(input, deps),
    retries: TASK_WORK_RETRIES,
    backoff: TASK_WORK_BACKOFF,
  });
  const worker = await hatchet.worker('task-worker', { workflows: [workflow] });
  console.log('[hatchet] task-worker started — task-work workflow registered server-side');
  worker.start().catch((err) => {
    console.error('[hatchet] task-worker loop failed:', err && err.message ? err.message : err);
  });
  return { workflow, task, worker };
}

// A dispatcher maps a task ID to a started workflow run. The cycle
// calls this instead of workTask when the kernel flag is on; the
// returned runId is the correlation ID for the run (US-9).
function createTaskDispatcher(workflow) {
  return async (taskId) => {
    const input = { taskId };
    // Oct 16, 2026 (M2 acceptance, v3): the SDK's run-starter that returns a
    // WorkflowRunRef is runNoWait() (see the SDK's own examples:
    // `const ref = await workflow.runNoWait(input); const runId = await
    // ref.runId; await ref.output`). v1 used run() (resolves with the step
    // OUTPUT - no ID). v2 used runRef() - that is a by-ID LOOKUP, not a
    // starter: it built a ref around the input object and the ID getter
    // threw "Invalid workflowRunId" (the engine's inline fallback absorbed
    // it live at 02:30). runId and output are async GETTERS on the ref.
    if (workflow && typeof workflow.runNoWait === 'function') {
      const ref = await workflow.runNoWait(input);
      let runId = null;
      try { runId = await ref.runId; } catch (_) { /* fall through */ }
      if (!runId && ref.metadata && ref.metadata.id) runId = ref.metadata.id;
      const out = ref.output;
      if (typeof out === 'function') await out.call(ref);
      else if (out && typeof out.then === 'function') await out;
      return { runId: runId || null, taskId };
    }
    const out = await workflow.run(input);
    return { runId: (out && out.metadata && out.metadata.id) || null, taskId };
  };
}

module.exports = {
  runTaskWork,
  registerTaskWorkflow,
  createTaskDispatcher,
  TASK_WORK_WORKFLOW,
  TASK_WORK_TASK,
  TASK_WORK_RETRIES,
  TASK_WORK_BACKOFF,
};
