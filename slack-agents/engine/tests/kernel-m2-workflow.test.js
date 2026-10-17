/**
 * engine/tests/kernel-m2-workflow.test.js
 *
 * M2 of the execution kernel (Vikunja #771) — every task runs as a
 * tracked workflow. Spec: EXECUTION-KERNEL-SPEC.md, US-1 + US-9.
 *
 * The engine previously worked tasks as opaque in-process calls inside
 * one big cycle: no per-task run record, no step-level retry, nothing
 * to inspect when a task vanished mid-flight. The task-work workflow
 * gives each task its own Hatchet run: the run input is just the task
 * ID (steps re-read the task from the system of record at execution
 * time), the step executes the existing workTask lifecycle, and Hatchet
 * retries the step on failure.
 *
 * BDD:
 * - Given a run input with a task ID, the step delegates to
 *   workTaskById with that ID.
 * - Given a run input without a task ID, the step is a no-op that
 *   reports it did not run (fail-closed, never guesses a task).
 * - Given the workflow registration, a task-work workflow exists with
 *   an execute-task step carrying retries.
 * - Given a dispatcher, dispatching task 42 starts a workflow run with
 *   input { taskId: 42 } and returns the run ID when the engine gives
 *   one.
 * - Given workTaskById, a missing or already-done task is skipped; an
 *   open task is worked.
 */
'use strict';

const tw = require('../taskWorkflow');
const workEngine = require('../workEngine');

describe('M2 task-work step: runTaskWork', () => {
  test('Given a task ID input, then it delegates to workTaskById', async () => {
    const calls = [];
    const deps = { workTaskById: async (id) => { calls.push(id); return { ran: true, taskId: id }; } };
    const out = await tw.runTaskWork({ taskId: 42 }, deps);
    expect(calls).toEqual([42]);
    expect(out).toEqual({ ran: true, taskId: 42 });
  });

  test('Given no task ID, then it does not run and says why', async () => {
    const deps = { workTaskById: async () => { throw new Error('must not be called'); } };
    const out = await tw.runTaskWork({}, deps);
    expect(out.ran).toBe(false);
    expect(out.reason).toMatch(/task/i);
  });
});

describe('M2 task-work workflow registration', () => {
  test('Given a hatchet client, then a task-work workflow with a retried execute-task step is registered', async () => {
    const captured = {};
    const fakeWorkflow = {
      task: (t) => { captured.task = t; return t; },
    };
    const fakeHatchet = {
      workflow: (opts) => { captured.workflowOpts = opts; return fakeWorkflow; },
      worker: async (name, opts) => {
        captured.workerName = name;
        captured.workerWorkflows = opts.workflows;
        return { start: () => new Promise(() => {}), stop: async () => {} };
      },
    };
    const deps = { workTaskById: async () => ({ ran: true }) };
    const out = await tw.registerTaskWorkflow(fakeHatchet, deps);
    expect(captured.workflowOpts.name).toBe('task-work');
    expect(captured.task.name).toBe('execute-task');
    expect(captured.task.retries).toBe(2);
    expect(captured.workerName).toBe('task-worker');
    expect(out.workflow).toBe(fakeWorkflow);
  });

  test('Given a dispatcher, then dispatching starts a run with the task ID and returns its run ID', async () => {
    const seen = [];
    const fakeWorkflow = {
      run: async (input) => { seen.push(input); return { metadata: { id: 'run-abc' } }; },
    };
    const dispatch = tw.createTaskDispatcher(fakeWorkflow);
    const out = await dispatch(42);
    expect(seen).toEqual([{ taskId: 42 }]);
    expect(out.runId).toBe('run-abc');
  });
});

describe('M2 workTaskById: the step body in the work engine', () => {
  test('Given a missing task, then it is skipped', async () => {
    const out = await workEngine.workTaskById(999, {
      getTask: async () => null,
      workTask: async () => { throw new Error('must not be called'); },
    });
    expect(out).toEqual({ ran: false, reason: 'not-found' });
  });

  test('Given an already-done task, then it is skipped', async () => {
    const out = await workEngine.workTaskById(5, {
      getTask: async () => ({ id: 5, done: true, title: 'x' }),
      workTask: async () => { throw new Error('must not be called'); },
    });
    expect(out).toEqual({ ran: false, reason: 'already-done' });
  });

  test('Given an open task, then it is worked', async () => {
    const worked = [];
    const out = await workEngine.workTaskById(6, {
      getTask: async () => ({ id: 6, done: false, title: 'Real work' }),
      workTask: async (t) => { worked.push(t.id); },
    });
    expect(worked).toEqual([6]);
    expect(out).toEqual({ ran: true, taskId: 6 });
  });
});

describe('M2 dispatcher run ID (Oct 16, 2026 live fix)', () => {
  const tw = require('../taskWorkflow');
  test('uses runNoWait: async runId getter + output promise getter', async () => {
    let outputAwaited = false;
    const fakeRef = {
      get runId() { return Promise.resolve('run-ref-1'); },
      get output() { return Promise.resolve().then(() => { outputAwaited = true; return { ran: true }; }); },
    };
    const seen = [];
    const fakeWorkflow = {
      runNoWait: async (input) => { seen.push(input); return fakeRef; },
      runRef: async () => { throw new Error('runRef is a by-ID lookup - must not be used to start runs'); },
      run: async () => { throw new Error('run() must not be used when runNoWait exists'); },
    };
    const out = await tw.createTaskDispatcher(fakeWorkflow)(7);
    expect(seen).toEqual([{ taskId: 7 }]);
    expect(out.runId).toBe('run-ref-1');
    expect(outputAwaited).toBe(true);
  });
  test('metadata.id fallback when the ref has no runId getter', async () => {
    const fakeWorkflow = { runNoWait: async () => ({ metadata: { id: 'run-meta-3' }, output: Promise.resolve({}) }) };
    const out = await tw.createTaskDispatcher(fakeWorkflow)(9);
    expect(out.runId).toBe('run-meta-3');
  });
});
