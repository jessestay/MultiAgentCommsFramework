// tests/hatchet.test.js — Hatchet durable-execution layer for the 24/7 engine
//
// TDD contract for engine/hatchet.js (implementation lands separately).
// The engine's 30-minute work cycle moves from workEngine's internal
// setInterval to a durable Hatchet task + workflow + cron trigger, so a
// crash anywhere resumes the tick instead of silently stopping the team.
//
// Module contract under test:
//   - createHatchetClient(): HatchetEmbeddedClient.init() -> client; init
//     rejection propagates.
//   - registerEngineWorkflows(hatchet, deps): registers ONE durable task
//     'engine-tick-task' (retries: 3, backoff { factor, maxSeconds }), ONE
//     workflow 'engine-tick' wrapping it, and a cron trigger
//     'engine-tick-cron' with the expression from config HATCHET.CRON.
//     Returns { workflow, task }.
//   - runEngineTick(deps): lock-first tick — acquireLock({ holderId }); skip
//     runCycle when the lock is not acquired.
//   - startEngineWorker(hatchet, deps): registers workflows, creates/starts
//     the 'engine-worker', performs ONE immediate tick, and wires SIGTERM /
//     SIGINT -> worker.stop() -> releaseLock({ holderId }) ->
//     client.stopEmbedded() -> process.exit(0). Returns the worker.
//   - Name constants: ENGINE_TICK_WORKFLOW, ENGINE_TICK_TASK, DEFAULT_CRON.
//
// Everything external is mocked — the embedded SDK entry point is stubbed
// with the REAL v1 call shape (task/workflow/cron.create/worker), so no
// embedded Postgres ever boots in unit tests.
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
//   task({name, fn, retries, backoff}) / workflow({name, tasks}) /
//   cron.create(workflow, {name, expression, input}) / worker(name, opts)
//   (async) / stopEmbedded().
function makeClient() {
  const taskObj = { __kind: 'task' };
  const workflowObj = { __kind: 'workflow' };
  const workerObj = {
    start: jest.fn().mockResolvedValue(),
    stop: jest.fn().mockResolvedValue(),
  };
  const client = {
    task: jest.fn(() => taskObj),
    workflow: jest.fn(() => workflowObj),
    cron: { create: jest.fn().mockResolvedValue({ id: 'cron-1' }) },
    worker: jest.fn().mockResolvedValue(workerObj),
    stopEmbedded: jest.fn().mockResolvedValue(),
  };
  return { client, taskObj, workflowObj, workerObj };
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
    const { client } = makeClient();
    await h.registerEngineWorkflows(client, makeDeps());
    expect(client.task).toHaveBeenCalledTimes(1);
    const opts = client.task.mock.calls[0][0];
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
    expect(opts.tasks).toEqual([taskObj]);
    expect(ret.workflow).toBe(workflowObj);
    expect(ret.task).toBe(taskObj);
  });

  test('creates a cron trigger with the default expression', async () => {
    const h = loadHatchetFresh();
    const { client, workflowObj } = makeClient();
    await h.registerEngineWorkflows(client, makeDeps());
    expect(client.cron.create).toHaveBeenCalledTimes(1);
    expect(client.cron.create).toHaveBeenCalledWith(
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
    expect(client.cron.create).toHaveBeenCalledWith(
      workflowObj,
      expect.objectContaining({ expression: '17 3 * * *' })
    );
  });

  test('the registered task fn is the lock-first tick', async () => {
    const h = loadHatchetFresh();
    const { client } = makeClient();
    const deps = makeDeps();
    await h.registerEngineWorkflows(client, deps);
    const fn = client.task.mock.calls[0][0].fn;
    // lock acquired -> runCycle exactly once, after the lock call
    await fn();
    expect(deps.acquireLock).toHaveBeenCalledWith({ holderId: 'test-holder:42' });
    expect(deps.runCycle).toHaveBeenCalledTimes(1);
    expect(deps.acquireLock.mock.invocationCallOrder[0])
      .toBeLessThan(deps.runCycle.mock.invocationCallOrder[0]);
  });

  test('the registered task fn skips runCycle when the lock is held elsewhere', async () => {
    const h = loadHatchetFresh();
    const { client } = makeClient();
    const deps = makeDeps({ acquireLock: jest.fn().mockResolvedValue(false) });
    await h.registerEngineWorkflows(client, deps);
    const fn = client.task.mock.calls[0][0].fn;
    await expect(fn()).resolves.toBeUndefined();
    expect(deps.acquireLock).toHaveBeenCalledTimes(1);
    expect(deps.runCycle).not.toHaveBeenCalled();
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
    expect(client.task).toHaveBeenCalledTimes(1);
    expect(client.cron.create).toHaveBeenCalledTimes(1);
    expect(client.worker).toHaveBeenCalledWith('engine-worker', { workflows: [workflowObj] });
    expect(workerObj.start).toHaveBeenCalledTimes(1);
    expect(worker).toBe(workerObj);
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
