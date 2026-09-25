// tests/hatchet.test.js — Hatchet durable-execution layer for the 24/7 engine
//
// TDD contract for engine/hatchet.js.
//
// The engine's 30-minute work cycle moves from workEngine's internal
// setInterval to a durable Hatchet task + workflow + cron trigger, so a
// crash anywhere resumes the tick instead of silently stopping the team.
//
// Module contract under test:
//   - createHatchetClient(): HatchetEmbeddedClient.init() -> client; init
//     rejection propagates.
//   - registerEngineWorkflows(hatchet, deps): declares ONE durable task
//     'engine-tick-task' (retries: 3, backoff { factor, maxSeconds }), ONE
//     workflow 'engine-tick' wrapping it, creates + STARTS the
//     'engine-worker' (worker.start() registers the workflow server-side),
//     THEN ensures the cron trigger 'engine-tick-cron' with the expression
//     from config HATCHET.CRON. Returns { workflow, task, worker }.
//     BUG REGRESSION (2026-09-25): the v1 SDK resolves a cron's workflow by
//     name server-side; hatchet.workflow() only builds a LOCAL declaration.
//     Creating the cron BEFORE worker.start() resolves -> HTTP 400
//     'workflow not found' -> [standalone] fatal. So cron creation must
//     happen strictly after worker.start() resolves.
//   - ensureEngineCron(hatchet, workflow): idempotent cron ensure — lists
//     existing triggers; skips creation when 'engine-tick-cron' already
//     exists with the same expression (embedded Postgres persists across
//     restarts, so a second boot must not fail); deletes + recreates when
//     the expression differs.
//   - runEngineTick(deps): lock-first tick — acquireLock({ holderId }); skip
//     runCycle when the lock is not acquired.
//   - startEngineWorker(hatchet, deps): registers workflows (worker started
//     inside registration), performs ONE immediate tick, and wires SIGTERM /
//     SIGINT -> worker.stop() -> releaseLock({ holderId }) ->
//     client.stopEmbedded() -> process.exit(0). Returns the worker.
//   - Name constants: ENGINE_TICK_WORKFLOW, ENGINE_TICK_TASK, DEFAULT_CRON.
//
// Everything external is mocked — the embedded SDK entry point is stubbed
// with the REAL v1 call shape (task/workflow/crons.create/crons.list/
// crons.delete/worker), so no embedded Postgres ever boots in unit tests.
'use strict';

const FILE_ENV_BACKUP = { ...process.env };

jest.mock('@hatchet-dev/typescript-sdk/v1/embedded', () => ({
  HatchetEmbeddedClient: { init: jest.fn() },
}));

const { HatchetEmbeddedClient } = require('@hatchet-dev/typescript-sdk/v1/embedded');

// Restore the pre-existing environment after the run so other test files
// sharing the jest worker see a clean environment.
afterAll(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in FILE_ENV_BACKUP)) delete process.env[k];
  }
  Object.assign(process.env, FILE_ENV_BACKUP);
});

// Fake Hatchet client with the REAL v1 API shape:
//   workflow({name}) -> workflow.task({name, fn, retries, backoff}) /
//   crons.create(workflow, {name, expression, input}) /
//   crons.list({workflow}) / crons.delete(id) /
//   worker(name, opts) (async) / stopEmbedded().
// NOTE: hatchet.workflow() takes NO `tasks` option (see declaration.d.ts) —
// tasks attach via workflow.task(). A mock encoding workflow({name, tasks})
// would hide a real "tasks list cannot be nil" server rejection.
function makeClient() {
  const taskObj = { __kind: 'task' };
  const workflowObj = {
    __kind: 'workflow',
    task: jest.fn(() => taskObj),
  };
  const workerObj = {
    start: jest.fn().mockResolvedValue(),
    stop: jest.fn().mockResolvedValue(),
  };
  const client = {
    workflow: jest.fn(() => workflowObj),
    crons: {
      create: jest.fn().mockResolvedValue({ metadata: { id: 'cron-1' } }),
      list: jest.fn().mockResolvedValue({ rows: [] }),
      delete: jest.fn().mockResolvedValue(),
    },
    worker: jest.fn().mockResolvedValue(workerObj),
    stopEmbedded: jest.fn().mockResolvedValue(),
  };
  return { client, taskObj, workflowObj, workerObj };
}

// An existing cron row as the real SDK returns it (CronWorkflows contract:
// name, cron (expression), metadata.id).
function existingCronRow(overrides = {}) {
  return {
    metadata: { id: 'cron-existing' },
    name: 'engine-tick-cron',
    cron: '*/30 * * * *',
    workflowName: 'engine-tick',
    ...overrides,
  };
}

// deps are INJECTED — hatchet.js must not hard-require engine/lock.js.
function makeDeps(overrides = {}) {
  return {
    runCycle: jest.fn().mockResolvedValue(),
    acquireLock: jest.fn().mockResolvedValue(true),
    releaseLock: jest.fn().mockResolvedValue(),
    holderId: 'test-holder:42',
    ...overrides,
  };
}

function loadHatchetFresh() {
  let mod;
  jest.isolateModules(() => {
    mod = require('../engine/hatchet');
  });
  return mod;
}

beforeEach(() => {
  process.env = { ...FILE_ENV_BACKUP };
  delete process.env.HATCHET_CRON;
  jest.clearAllMocks();
  HatchetEmbeddedClient.init.mockReset();
});

describe('name constants', () => {
  test('exports the engine-tick names and default cron', () => {
    const h = loadHatchetFresh();
    expect(h.ENGINE_TICK_WORKFLOW).toBe('engine-tick');
    expect(h.ENGINE_TICK_TASK).toBe('engine-tick-task');
    expect(h.DEFAULT_CRON).toBe('*/30 * * * *');
  });
});

describe('createHatchetClient()', () => {
  test('calls HatchetEmbeddedClient.init() and returns the client', async () => {
    const h = loadHatchetFresh();
    const { client } = makeClient();
    HatchetEmbeddedClient.init.mockResolvedValue(client);
    const got = await h.createHatchetClient();
    expect(HatchetEmbeddedClient.init).toHaveBeenCalledTimes(1);
    expect(got).toBe(client);
  });

  test('propagates an init failure (no swallowing)', async () => {
    const h = loadHatchetFresh();
    const boom = new Error('sidecar failed to start');
    HatchetEmbeddedClient.init.mockRejectedValue(boom);
    await expect(h.createHatchetClient()).rejects.toBe(boom);
  });
});

describe('registerEngineWorkflows()', () => {
  test('registers ONE durable task with retries: 3 and backoff { factor, maxSeconds }', async () => {
    const h = loadHatchetFresh();
    const { client, workflowObj } = makeClient();
    await h.registerEngineWorkflows(client, makeDeps());
    expect(client.workflow).toHaveBeenCalledTimes(1);
    expect(workflowObj.task).toHaveBeenCalledTimes(1);
    const opts = workflowObj.task.mock.calls[0][0];
    expect(opts.name).toBe('engine-tick-task');
    expect(opts.retries).toBe(3);
    expect(opts.backoff).toEqual({ factor: 2, maxSeconds: 300 });
    expect(typeof opts.fn).toBe('function');
  });

  test('registers ONE workflow wrapping the task', async () => {
    const h = loadHatchetFresh();
    const { client, taskObj, workflowObj } = makeClient();
    const ret = await h.registerEngineWorkflows(client, makeDeps());
    expect(client.workflow).toHaveBeenCalledTimes(1);
    const opts = client.workflow.mock.calls[0][0];
    expect(opts.name).toBe('engine-tick');
    // v1 API: tasks attach via workflow.task(), never a `tasks` constructor opt
    expect(opts.tasks).toBeUndefined();
    expect(workflowObj.task).toHaveBeenCalledTimes(1);
    expect(ret.workflow).toBe(workflowObj);
    expect(ret.task).toBe(taskObj);
  });

  test('creates the engine-worker with the workflow and starts it', async () => {
    const h = loadHatchetFresh();
    const { client, workflowObj, workerObj } = makeClient();
    const ret = await h.registerEngineWorkflows(client, makeDeps());
    expect(client.worker).toHaveBeenCalledTimes(1);
    expect(client.worker).toHaveBeenCalledWith('engine-worker', { workflows: [workflowObj] });
    expect(workerObj.start).toHaveBeenCalledTimes(1);
    expect(ret.worker).toBe(workerObj);
  });

  // REGRESSION (2026-09-25): the v1 SDK resolves the cron's workflow by
  // name server-side; hatchet.workflow() is a local declaration only, so
  // crons.create BEFORE worker.start() resolves -> HTTP 400 'workflow not
  // found' -> [standalone] fatal. The cron trigger must be created strictly
  // after worker.start() resolves.
  test('REGRESSION: cron trigger is created only AFTER worker.start() resolves', async () => {
    const h = loadHatchetFresh();
    const { client, workerObj } = makeClient();
    await h.registerEngineWorkflows(client, makeDeps());
    expect(client.crons.create).toHaveBeenCalledTimes(1);
    expect(workerObj.start.mock.invocationCallOrder[0])
      .toBeLessThan(client.crons.create.mock.invocationCallOrder[0]);
  });

  test('creates a cron trigger with the default expression', async () => {
    const h = loadHatchetFresh();
    const { client, workflowObj } = makeClient();
    await h.registerEngineWorkflows(client, makeDeps());
    expect(client.crons.create).toHaveBeenCalledTimes(1);
    expect(client.crons.create).toHaveBeenCalledWith(
      workflowObj,
      expect.objectContaining({
        name: 'engine-tick-cron',
        expression: '*/30 * * * *',
      })
    );
  });

  test('cron expression comes from config HATCHET.CRON (env override)', async () => {
    process.env.HATCHET_CRON = '17 3 * * *';
    const h = loadHatchetFresh(); // config re-reads env inside the isolated registry
    const { client, workflowObj } = makeClient();
    await h.registerEngineWorkflows(client, makeDeps());
    expect(client.crons.create).toHaveBeenCalledWith(
      workflowObj,
      expect.objectContaining({ expression: '17 3 * * *' })
    );
  });

  test('REGRESSION: duplicate boot with the same expression skips cron creation', async () => {
    const h = loadHatchetFresh();
    const { client, workerObj } = makeClient();
    // Embedded Postgres persists — engine-tick-cron already exists from the
    // first boot with the same expression.
    client.crons.list.mockResolvedValue({ rows: [existingCronRow()] });
    const ret = await h.registerEngineWorkflows(client, makeDeps());
    // Workflow registration still happens (server-side upsert by name)...
    expect(workerObj.start).toHaveBeenCalledTimes(1);
    // ...but the existing trigger is reused, never recreated.
    expect(client.crons.list).toHaveBeenCalledTimes(1);
    expect(client.crons.delete).not.toHaveBeenCalled();
    expect(client.crons.create).not.toHaveBeenCalled();
    expect(ret.workflow).toBeDefined();
  });

  test('REGRESSION: duplicate boot with a changed expression deletes + recreates', async () => {
    const h = loadHatchetFresh();
    const { client, workflowObj } = makeClient();
    client.crons.list.mockResolvedValue({
      rows: [existingCronRow({ cron: '0 * * * *' })],
    });
    await h.registerEngineWorkflows(client, makeDeps());
    expect(client.crons.delete).toHaveBeenCalledTimes(1);
    expect(client.crons.delete).toHaveBeenCalledWith('cron-existing');
    expect(client.crons.create).toHaveBeenCalledTimes(1);
    expect(client.crons.create).toHaveBeenCalledWith(
      workflowObj,
      expect.objectContaining({ expression: '*/30 * * * *' })
    );
  });

  test('the registered task fn is the lock-first tick', async () => {
    const h = loadHatchetFresh();
    const { client, workflowObj } = makeClient();
    const deps = makeDeps();
    await h.registerEngineWorkflows(client, deps);
    const fn = workflowObj.task.mock.calls[0][0].fn;
    // lock acquired -> runCycle exactly once, after the lock call
    await fn();
    expect(deps.acquireLock).toHaveBeenCalledWith({ holderId: 'test-holder:42' });
    expect(deps.runCycle).toHaveBeenCalledTimes(1);
    expect(deps.acquireLock.mock.invocationCallOrder[0])
      .toBeLessThan(deps.runCycle.mock.invocationCallOrder[0]);
  });

  test('the registered task fn skips runCycle when the lock is held elsewhere', async () => {
    const h = loadHatchetFresh();
    const { client, workflowObj } = makeClient();
    const deps = makeDeps({ acquireLock: jest.fn().mockResolvedValue(false) });
    await h.registerEngineWorkflows(client, deps);
    const fn = workflowObj.task.mock.calls[0][0].fn;
    await expect(fn()).resolves.toBeUndefined();
    expect(deps.acquireLock).toHaveBeenCalledTimes(1);
    expect(deps.runCycle).not.toHaveBeenCalled();
  });
});

describe('ensureEngineCron()', () => {
  test('creates the trigger when none exists', async () => {
    const h = loadHatchetFresh();
    const { client, workflowObj } = makeClient();
    const got = await h.ensureEngineCron(client, workflowObj);
    expect(client.crons.list).toHaveBeenCalledTimes(1);
    expect(client.crons.create).toHaveBeenCalledTimes(1);
    expect(client.crons.create).toHaveBeenCalledWith(
      workflowObj,
      expect.objectContaining({
        name: 'engine-tick-cron',
        expression: '*/30 * * * *',
      })
    );
    expect(got).toEqual({ metadata: { id: 'cron-1' } });
  });

  test('skips creation when the trigger already exists with the same expression', async () => {
    const h = loadHatchetFresh();
    const { client, workflowObj } = makeClient();
    client.crons.list.mockResolvedValue({ rows: [existingCronRow()] });
    const got = await h.ensureEngineCron(client, workflowObj);
    expect(client.crons.create).not.toHaveBeenCalled();
    expect(client.crons.delete).not.toHaveBeenCalled();
    expect(got).toEqual(existingCronRow());
  });

  test('ignores other cron triggers on the same workflow', async () => {
    const h = loadHatchetFresh();
    const { client, workflowObj } = makeClient();
    client.crons.list.mockResolvedValue({
      rows: [existingCronRow({ name: 'something-else', cron: '0 * * * *' })],
    });
    await h.ensureEngineCron(client, workflowObj);
    expect(client.crons.create).toHaveBeenCalledTimes(1);
  });

  test('deletes + recreates when the expression changed', async () => {
    const h = loadHatchetFresh();
    const { client, workflowObj } = makeClient();
    client.crons.list.mockResolvedValue({
      rows: [existingCronRow({ cron: '0 * * * *' })],
    });
    await h.ensureEngineCron(client, workflowObj);
    expect(client.crons.delete).toHaveBeenCalledTimes(1);
    expect(client.crons.delete).toHaveBeenCalledWith('cron-existing');
    expect(client.crons.create).toHaveBeenCalledTimes(1);
  });

  test('a list failure falls through to create (fresh-engine resilience)', async () => {
    const h = loadHatchetFresh();
    const { client, workflowObj } = makeClient();
    client.crons.list.mockRejectedValue(new Error('connection reset'));
    await h.ensureEngineCron(client, workflowObj);
    expect(client.crons.create).toHaveBeenCalledTimes(1);
  });
});

describe('runEngineTick()', () => {
  test('acquires the lock first, then runs the cycle exactly once', async () => {
    const h = loadHatchetFresh();
    const deps = makeDeps();
    await h.runEngineTick(deps);
    expect(deps.acquireLock).toHaveBeenCalledWith({ holderId: 'test-holder:42' });
    expect(deps.runCycle).toHaveBeenCalledTimes(1);
    expect(deps.acquireLock.mock.invocationCallOrder[0])
      .toBeLessThan(deps.runCycle.mock.invocationCallOrder[0]);
  });

  test('resolves without running the cycle when the lock is not acquired', async () => {
    const h = loadHatchetFresh();
    const deps = makeDeps({ acquireLock: jest.fn().mockResolvedValue(false) });
    await expect(h.runEngineTick(deps)).resolves.toBeUndefined();
    expect(deps.runCycle).not.toHaveBeenCalled();
  });

  test('fail closed: a lock error never triggers runCycle and never throws', async () => {
    const h = loadHatchetFresh();
    const deps = makeDeps({ acquireLock: jest.fn().mockRejectedValue(new Error('vikunja down')) });
    await expect(h.runEngineTick(deps)).resolves.toBeUndefined();
    expect(deps.runCycle).not.toHaveBeenCalled();
  });
});

describe('startEngineWorker()', () => {
  let sigBefore;
  let exitSpy;

  beforeEach(() => {
    sigBefore = {
      SIGTERM: process.listeners('SIGTERM'),
      SIGINT: process.listeners('SIGINT'),
    };
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    // Remove only the signal listeners startEngineWorker added.
    for (const sig of ['SIGTERM', 'SIGINT']) {
      for (const listener of process.listeners(sig)) {
        if (!sigBefore[sig].includes(listener)) process.removeListener(sig, listener);
      }
    }
  });

  // Capture the handlers startEngineWorker wires, then detach them so the
  // test process stays clean; invoke the captured fns directly.
  async function captureHandlers(h, client, deps) {
    const onSpy = jest.spyOn(process, 'on');
    let worker;
    let calls;
    try {
      worker = await h.startEngineWorker(client, deps);
    } finally {
      // Snapshot the calls BEFORE mockRestore: mockRestore() also clears
      // mock.calls, so reading them after restoring always yields [].
      calls = onSpy.mock.calls.slice();
      onSpy.mockRestore();
    }
    const handlers = {};
    for (const [sig, fn] of calls) {
      if ((sig === 'SIGTERM' || sig === 'SIGINT') && typeof fn === 'function') handlers[sig] = fn;
    }
    for (const sig of Object.keys(handlers)) process.removeListener(sig, handlers[sig]);
    return { worker, handlers };
  }

  test('registers workflows, creates and starts the engine worker', async () => {
    const h = loadHatchetFresh();
    const { client, workflowObj, workerObj } = makeClient();
    const deps = makeDeps();
    const { worker } = await captureHandlers(h, client, deps);
    expect(workflowObj.task).toHaveBeenCalledTimes(1);
    expect(client.crons.create).toHaveBeenCalledTimes(1);
    expect(client.worker).toHaveBeenCalledWith('engine-worker', { workflows: [workflowObj] });
    expect(workerObj.start).toHaveBeenCalledTimes(1);
    expect(worker).toBe(workerObj);
  });

  test('cron creation still happens strictly after worker.start() resolves', async () => {
    const h = loadHatchetFresh();
    const { client, workerObj } = makeClient();
    const deps = makeDeps();
    await captureHandlers(h, client, deps);
    expect(workerObj.start.mock.invocationCallOrder[0])
      .toBeLessThan(client.crons.create.mock.invocationCallOrder[0]);
  });

  test('performs exactly one immediate tick on startup', async () => {
    const h = loadHatchetFresh();
    const { client } = makeClient();
    const deps = makeDeps();
    await captureHandlers(h, client, deps);
    expect(deps.acquireLock).toHaveBeenCalledTimes(1);
    expect(deps.runCycle).toHaveBeenCalledTimes(1);
  });

  test('immediate tick is skipped when the lock is held elsewhere', async () => {
    const h = loadHatchetFresh();
    const { client } = makeClient();
    const deps = makeDeps({ acquireLock: jest.fn().mockResolvedValue(false) });
    await captureHandlers(h, client, deps);
    expect(deps.runCycle).not.toHaveBeenCalled();
  });

  test('SIGTERM stops the worker, releases the lock, stops embedded, exits 0', async () => {
    const h = loadHatchetFresh();
    const { client, workerObj } = makeClient();
    const deps = makeDeps();
    const { handlers } = await captureHandlers(h, client, deps);
    expect(typeof handlers.SIGTERM).toBe('function');
    await handlers.SIGTERM();
    expect(workerObj.stop).toHaveBeenCalledTimes(1);
    expect(deps.releaseLock).toHaveBeenCalledWith({ holderId: 'test-holder:42' });
    expect(client.stopEmbedded).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
    // shutdown order: worker first, then the embedded engine, then exit
    expect(workerObj.stop.mock.invocationCallOrder[0])
      .toBeLessThan(client.stopEmbedded.mock.invocationCallOrder[0]);
    expect(client.stopEmbedded.mock.invocationCallOrder[0])
      .toBeLessThan(exitSpy.mock.invocationCallOrder[0]);
  });

  test('SIGINT shuts down the same way', async () => {
    const h = loadHatchetFresh();
    const { client, workerObj } = makeClient();
    const deps = makeDeps();
    const { handlers } = await captureHandlers(h, client, deps);
    expect(typeof handlers.SIGINT).toBe('function');
    await handlers.SIGINT();
    expect(workerObj.stop).toHaveBeenCalledTimes(1);
    expect(deps.releaseLock).toHaveBeenCalledWith({ holderId: 'test-holder:42' });
    expect(client.stopEmbedded).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test('shutdown works when deps.releaseLock is not provided', async () => {
    const h = loadHatchetFresh();
    const { client, workerObj } = makeClient();
    const deps = makeDeps();
    delete deps.releaseLock;
    const { handlers } = await captureHandlers(h, client, deps);
    await expect(handlers.SIGTERM()).resolves.toBeUndefined();
    expect(workerObj.stop).toHaveBeenCalledTimes(1);
    expect(client.stopEmbedded).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
