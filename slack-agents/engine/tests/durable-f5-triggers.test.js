// durable-f5-triggers — Phase F (Vikunja #789, US-F1.1): work starts
// from Hatchet triggers, not polling.
//
// The engine-side intake cycle (durable-f1) is driven by a Hatchet cron
// trigger on a dedicated `directive-scan` workflow — the same
// registration pattern as the engine-tick workflow (engine/hatchet.js):
// declare -> create worker -> start worker (registers the workflow
// server-side) -> ensure the cron trigger idempotently (the embedded
// Postgres persists across restarts, so re-creating an identical
// trigger must be a no-op, and a changed expression is recreated).
//
// Criteria encoded here:
//   F5-a  registration creates the cron trigger with the scan
//         expression after the worker starts, exactly once.
//   F5-b  re-registration with the same expression is a no-op
//         (idempotent across engine restarts).
//   F5-c  a changed expression deletes + recreates the trigger.
//   F5-d  the scan task body runs the injected intake cycle; a missing
//         cycle is a visible no-op ({ ran: false }), never a throw.
//   F5-e  the feature flag helper: engine intake is on only when
//         MACF_ENGINE_INTAKE=1 (default off — deployment is reversible).
'use strict';

function impl(rel, name) {
  try { return require(rel); }
  catch (e) { throw new Error(`missing implementation ${name}: ${e.message}`); }
}

function fakeHatchet(existingCrons = []) {
  const calls = { cronCreate: [], cronDelete: [], workerStarted: false };
  const workflow = {
    name: 'directive-scan',
    task: jest.fn((def) => ({ ...def })),
  };
  const worker = {
    start: jest.fn(async () => { calls.workerStarted = true; }),
  };
  const hatchet = {
    workflow: jest.fn(() => workflow),
    worker: jest.fn(async () => worker),
    crons: {
      list: jest.fn(async () => ({ rows: existingCrons })),
      create: jest.fn(async (wf, def) => { calls.cronCreate.push(def); return { name: def.name, cron: def.expression }; }),
      delete: jest.fn(async (id) => { calls.cronDelete.push(id); }),
    },
  };
  return { hatchet, workflow, worker, calls };
}

describe('US-F1.1 directive-scan Hatchet trigger', () => {
  test('F5-a: registration starts the worker and creates the cron trigger once', async () => {
    const trig = impl('../directiveTriggers', 'engine/directiveTriggers');
    const { hatchet, calls } = fakeHatchet();
    const out = await trig.registerDirectiveScanWorkflow(hatchet, { runCycle: async () => ({}) });
    expect(out.workflow).toBeTruthy();
    expect(calls.workerStarted).toBe(true);
    expect(calls.cronCreate).toHaveLength(1);
    expect(calls.cronCreate[0]).toMatchObject({
      name: trig.DIRECTIVE_SCAN_CRON,
      expression: trig.DIRECTIVE_SCAN_EXPRESSION,
    });
    expect(trig.DIRECTIVE_SCAN_EXPRESSION).toBe('* * * * *');
  });

  test('F5-b: re-registration with the same expression does not recreate the trigger', async () => {
    const trig = impl('../directiveTriggers', 'engine/directiveTriggers');
    const existing = [{ name: trig.DIRECTIVE_SCAN_CRON, cron: trig.DIRECTIVE_SCAN_EXPRESSION, metadata: { id: 'cron-1' } }];
    const { hatchet, calls } = fakeHatchet(existing);
    await trig.registerDirectiveScanWorkflow(hatchet, { runCycle: async () => ({}) });
    expect(calls.cronCreate).toHaveLength(0);
    expect(calls.cronDelete).toHaveLength(0);
  });

  test('F5-c: a changed expression recreates the trigger', async () => {
    const trig = impl('../directiveTriggers', 'engine/directiveTriggers');
    const existing = [{ name: trig.DIRECTIVE_SCAN_CRON, cron: '*/5 * * * *', metadata: { id: 'cron-9' } }];
    const { hatchet, calls } = fakeHatchet(existing);
    await trig.registerDirectiveScanWorkflow(hatchet, { runCycle: async () => ({}) });
    expect(calls.cronDelete).toEqual(['cron-9']);
    expect(calls.cronCreate).toHaveLength(1);
  });

  test('F5-d: the scan task body runs the injected cycle; missing cycle is a visible no-op', async () => {
    const trig = impl('../directiveTriggers', 'engine/directiveTriggers');
    let ran = 0;
    const out = await trig.runDirectiveScan({}, { runCycle: async () => { ran++; return { scanned: 1 }; } });
    expect(ran).toBe(1);
    expect(out).toEqual({ scanned: 1 });
    const noop = await trig.runDirectiveScan({}, {});
    expect(noop).toEqual({ ran: false, reason: expect.any(String) });
  });

  test('F5-e: engine intake flag is on only at MACF_ENGINE_INTAKE=1', () => {
    const trig = impl('../directiveTriggers', 'engine/directiveTriggers');
    expect(trig.engineIntakeEnabled({ MACF_ENGINE_INTAKE: '1' })).toBe(true);
    expect(trig.engineIntakeEnabled({ MACF_ENGINE_INTAKE: '0' })).toBe(false);
    expect(trig.engineIntakeEnabled({})).toBe(false);
  });
});
