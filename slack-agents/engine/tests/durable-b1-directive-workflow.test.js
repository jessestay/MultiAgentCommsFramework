// durable-b1-directive-workflow.test.js — Phase B, US-B1 (Vikunja #789).
//
// TDD RED PHASE (Oct 16, 2026): written from the US-B1 acceptance criteria
// BEFORE the implementation. Contract:
//
//   * engine/directiveWorkflow.js exports:
//       DIRECTIVE_WORK_WORKFLOW = 'directive-work', DIRECTIVE_WORK_TASK =
//       'execute-directive', DIRECTIVE_WORK_RETRIES = 2
//       directiveRunId(channel, ts) -> `directive:${channel}:${ts}`
//         (deterministic: retries/resumes of one directive share ONE
//         checkpoint, because the run ID derives from the directive's
//         channel:ts, never from a random per-attempt value)
//       runDirectiveWork(input, deps) — the step body; input carries
//         { channel, ts, msgTs, agentId, text }; delegates to
//         deps.executeDirective(input); missing channel/ts -> { ran:false }
//         (fail-closed, mirrors runTaskWork).
//       createStepExecutor({ getAgent, checkpointStore, timeoutMs }) ->
//         executeDirective(input): loads the agent via getAgent(agentId);
//         a missing agent or missing handleDelegation THROWS a visible
//         'no handler' error (US-B1.3 — never a silent drop); otherwise
//         runs agent.handleDelegation(text, new Set(), channel, ts) inside
//         the run context (engine/runContext.js) with the deterministic
//         runId + the durable checkpoint store, under the timeout race.
//       registerDirectiveWorkflow(hatchet, deps) — mirrors
//         registerTaskWorkflow: workflow + retried step + worker.
//       createDirectiveDispatcher(workflow, { intake, recordRun }) ->
//         dispatch(record): starts the run via workflow.runNoWait (SDK v3
//         pattern), records the run in the receipts ledger via recordRun
//         ({ agentId, hatchetRunId, channel, ts, checkpointRunId }),
//         marks the intake record dispatched, and settles the record
//         completed (with the step output as result) or failed (with the
//         error) when the run output settles. Returns
//         { hatchetRunId, checkpointRunId, done } where done resolves
//         after the intake record is settled.
//   * engine/directiveIntake.js exports createIntakeStore(dir) and
//     resolveIntakeDir(): a durable, file-backed intake/result store.
//     register(record) is idempotent per channel:ts key; get(key);
//     update(key, patch); list(status); touchHeartbeat();
//     heartbeatFresh(maxAgeMs); keyFor(channel, ts); dir.
//     A NEW store instance over the same dir sees prior records
//     (durability across process restarts — the store lives under the
//     canonical .state dir in production, never /tmp or /home/macf).
//   * utils/checkpointAdapters.js exports createFileAdapter({ dir }),
//     createDurableCheckpointStore({ dir }) and resolveCheckpointDir():
//     Phase A's { get, set, delete, keys } shape persisted as files, so a
//     checkpoint written by one process instance is loadable by a NEW
//     store instance over the same dir (restart durability).
//   * engine/runContext.js exports runWithRunContext(ctx, fn) and
//     currentRunContext(): the propagation channel that lets the step
//     executor hand { runId, checkpointStore } to generateWithTools
//     without changing any agent's handleDelegation signature.
//   * engine/directivePoll.js: executeDelegation(item, opts) is THE
//     delegation entry point. With MACF_DIRECTIVE_WORKFLOW=1 and a fresh
//     engine heartbeat it registers the directive and consumes the
//     workflow result from the intake store (the agent is NOT executed
//     in the poller process); a failed workflow record resolves to null
//     (existing retry semantics) and the agent is NOT re-executed inline
//     (no double-run). It falls back to inline execution only when no
//     workflow run can have started: heartbeat stale, flag off, or
//     registration itself throws. The inline path runs the agent inside
//     the same run context (deterministic runId + durable store), so
//     even the fallback is checkpointed. US-B1.2 coverage: directivePoll
//     contains exactly ONE direct .handleDelegation( call site (the
//     inline fallback); every other route goes through executeDelegation.
//
// jest notes (AGENTS.md): jest.mock is file-wide. Slack is never touched:
// executeDelegation is exercised directly with agent doubles, and the
// intake store is a temp dir.

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-durable-b1-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');
delete process.env.MACF_DIRECTIVE_WORKFLOW;

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

function impl(rel) {
  try { return require(rel); } catch (e) {
    throw new Error(`RED PHASE (TDD): implementation module not built yet: ${rel} — ${e.code || e.message}`);
  }
}

const CH = 'C0ASH4TF604';
const TS = '1792141325.279499';
const RUN_ID = `directive:${CH}:${TS}`;

// ─── US-B1.1: deterministic checkpoint run ID ───────────────────────────────

describe('US-B1 — directive identity', () => {
  test('B1.1a: the checkpoint run ID derives deterministically from channel:ts', () => {
    const dw = impl('../directiveWorkflow');
    expect(dw.directiveRunId(CH, TS)).toBe(RUN_ID);
    expect(dw.directiveRunId(CH, TS)).toBe(dw.directiveRunId(CH, TS));
    expect(dw.directiveRunId(CH, '1792141999.000001')).not.toBe(RUN_ID);
    expect(dw.directiveRunId('C0ASDH1HC1Y', TS)).not.toBe(RUN_ID);
  });
});

// ─── Storage durability (Phase B storage acceptance bar) ────────────────────

describe('Phase B durable stores — restart durability', () => {
  test('B1.0a: a checkpoint written by one store instance loads in a NEW instance over the same dir', async () => {
    const adapters = impl('../../utils/checkpointAdapters');
    const dir = path.join(TMP, 'checkpoints-a');
    const a = adapters.createDurableCheckpointStore({ dir });
    await a.saveCheckpoint(RUN_ID, {
      messages: [{ role: 'user', content: 'Task: persist me' }],
      stepIndex: 3, status: 'running',
    });
    // Simulated process restart: a brand-new store + adapter, same dir.
    const b = adapters.createDurableCheckpointStore({ dir });
    const loaded = await b.loadCheckpoint(RUN_ID);
    expect(loaded).not.toBeNull();
    expect(loaded.stepIndex).toBe(3);
    expect(loaded.messages[0].content).toContain('persist me');
  });

  test('B1.0b: the production checkpoint dir resolves under the state dir, never /tmp or a user home', () => {
    const adapters = impl('../../utils/checkpointAdapters');
    const dir = adapters.resolveCheckpointDir();
    expect(dir.startsWith(TMP)).toBe(true); // MACF_STATE_DIR=TMP in this suite
    expect(dir).toContain('checkpoints');
  });

  test('B1.0c: intake records survive a new store instance; register is idempotent per channel:ts', async () => {
    const intakeMod = impl('../directiveIntake');
    const dir = path.join(TMP, 'intake-a');
    const a = intakeMod.createIntakeStore(dir);
    const rec = await a.register({ channel: CH, ts: TS, msgTs: parseFloat(TS), agentId: 'cto', text: '[from: CEO → CTO] do it', checkpointRunId: RUN_ID });
    expect(rec.status).toBe('registered');
    const again = await a.register({ channel: CH, ts: TS, msgTs: parseFloat(TS), agentId: 'cto', text: 'duplicate registration attempt', checkpointRunId: RUN_ID });
    expect(again.text).toBe('[from: CEO → CTO] do it'); // first registration wins
    const b = intakeMod.createIntakeStore(dir);
    const seen = await b.get(intakeMod.keyFor ? b.keyFor(CH, TS) : `${CH}:${TS}`);
    expect(seen).not.toBeNull();
    expect(seen.agentId).toBe('cto');
    await b.update(`${CH}:${TS}`, { status: 'completed', result: { response: 'done' } });
    const c = intakeMod.createIntakeStore(dir);
    const settled = await c.get(`${CH}:${TS}`);
    expect(settled.status).toBe('completed');
    expect(settled.result).toEqual({ response: 'done' });
  });
});

// ─── US-B1.1: dispatch creates a run; run ID lands in the receipts ledger ───

describe('US-B1.1 — dispatch as a Hatchet workflow run', () => {
  test('the step body delegates to deps.executeDirective and fails closed on missing identity', async () => {
    const dw = impl('../directiveWorkflow');
    const seen = [];
    const out = await dw.runDirectiveWork(
      { channel: CH, ts: TS, msgTs: parseFloat(TS), agentId: 'cto', text: 'x' },
      { executeDirective: async (input) => { seen.push(input); return { response: 'ok' }; } }
    );
    expect(seen).toHaveLength(1);
    expect(out).toEqual({ response: 'ok' });
    const noop = await dw.runDirectiveWork({}, { executeDirective: async () => { throw new Error('must not run'); } });
    expect(noop.ran).toBe(false);
    expect(noop.reason).toMatch(/directive|channel|ts/i);
  });

  test('registration: a directive-work workflow with a retried execute-directive step and its own worker', async () => {
    const dw = impl('../directiveWorkflow');
    const captured = {};
    const fakeWorkflow = { task: (t) => { captured.task = t; return t; } };
    const fakeHatchet = {
      workflow: (opts) => { captured.workflowOpts = opts; return fakeWorkflow; },
      worker: async (name, opts) => {
        captured.workerName = name;
        captured.workerWorkflows = opts.workflows;
        return { start: () => new Promise(() => {}), stop: async () => {} };
      },
    };
    const out = await dw.registerDirectiveWorkflow(fakeHatchet, { executeDirective: async () => ({ ran: true }) });
    expect(captured.workflowOpts.name).toBe('directive-work');
    expect(captured.task.name).toBe('execute-directive');
    expect(captured.task.retries).toBe(2);
    expect(captured.workerName).toBe('directive-worker');
    expect(out.workflow).toBe(fakeWorkflow);
  });

  test('dispatch starts a run (runNoWait), records the run ID in the receipts ledger with channel + ts, and settles the record completed', async () => {
    const dw = impl('../directiveWorkflow');
    const intakeMod = impl('../directiveIntake');
    const receipts = require('../receipts');
    const intake = intakeMod.createIntakeStore(path.join(TMP, 'intake-b'));
    await intake.register({ channel: CH, ts: TS, msgTs: parseFloat(TS), agentId: 'cto', text: '[from: CEO → CTO] design it', checkpointRunId: RUN_ID });

    const started = [];
    const fakeWorkflow = {
      runNoWait: async (input) => {
        started.push(input);
        return { runId: Promise.resolve('hatchet-run-b1'), output: Promise.resolve({ response: 'agent result' }) };
      },
    };
    const dispatcher = dw.createDirectiveDispatcher(fakeWorkflow, { intake });
    const record = await intake.get(`${CH}:${TS}`);
    const out = await dispatcher(record);
    expect(out.hatchetRunId).toBe('hatchet-run-b1');
    expect(out.checkpointRunId).toBe(RUN_ID);
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ channel: CH, ts: TS, agentId: 'cto', checkpointRunId: RUN_ID });

    await out.done;
    const settled = await intake.get(`${CH}:${TS}`);
    expect(settled.status).toBe('completed');
    expect(settled.hatchetRunId).toBe('hatchet-run-b1');
    expect(settled.result).toEqual({ response: 'agent result' });

    // The ledger carries the run, tied to the directive's channel + ts.
    const ledger = receipts.readAllReceipts();
    const runReceipt = ledger.find(r => r.tool === 'external:directive_workflow_run');
    expect(runReceipt).toBeTruthy();
    expect(runReceipt.agentId).toBe('cto');
    expect(runReceipt.artifacts[0].ref).toBe('hatchet-run-b1');
    expect(runReceipt.artifacts[0].channel).toBe(CH);
    expect(String(runReceipt.artifacts[0].directiveTs)).toBe(TS);
    expect(runReceipt.artifacts[0].checkpointRunId).toBe(RUN_ID);
  });
});

// ─── US-B1.3: an unhandled agent fails visibly ───────────────────────────────

describe('US-B1.3 — unhandled agent fails visibly in the workflow record', () => {
  test('the step executor throws a visible no-handler error instead of dropping the directive', async () => {
    const dw = impl('../directiveWorkflow');
    const adapters = impl('../../utils/checkpointAdapters');
    const store = adapters.createDurableCheckpointStore({ dir: path.join(TMP, 'checkpoints-b13') });
    const exec = dw.createStepExecutor({ getAgent: () => ({}), checkpointStore: store });
    await expect(exec({ channel: CH, ts: TS, msgTs: parseFloat(TS), agentId: 'ghost', text: 'x' }))
      .rejects.toThrow(/no handler/i);
    const execNull = dw.createStepExecutor({ getAgent: () => null, checkpointStore: store });
    await expect(execNull({ channel: CH, ts: TS, msgTs: parseFloat(TS), agentId: 'ghost', text: 'x' }))
      .rejects.toThrow(/no handler/i);
  });

  test('a failed step settles the intake record failed with the error — never silently completed', async () => {
    const dw = impl('../directiveWorkflow');
    const intakeMod = impl('../directiveIntake');
    const intake = intakeMod.createIntakeStore(path.join(TMP, 'intake-b13'));
    await intake.register({ channel: CH, ts: TS, msgTs: parseFloat(TS), agentId: 'ghost', text: 'x', checkpointRunId: RUN_ID });
    const fakeWorkflow = {
      // ref.output is an async GETTER on the real SDK's WorkflowRunRef —
      // the rejection must be created when the dispatcher reads it, not
      // eagerly (an eager Promise.reject escapes as unhandled).
      runNoWait: async () => ({
        runId: Promise.resolve('hatchet-run-fail'),
        get output() { return Promise.reject(new Error('no handler for agent ghost')); },
      }),
    };
    const dispatcher = dw.createDirectiveDispatcher(fakeWorkflow, { intake });
    const out = await dispatcher(await intake.get(`${CH}:${TS}`));
    await out.done;
    const settled = await intake.get(`${CH}:${TS}`);
    expect(settled.status).toBe('failed');
    expect(String(settled.error)).toMatch(/no handler/i);
  });
});

// ─── US-B1.1/B1.2: the poller consumes the workflow path; fallback is safe ──

describe('US-B1 — poller intake + fail-closed fallback', () => {
  const poll = require('../directivePoll');
  const intakeMod = () => impl('../directiveIntake');

  function makeItem(agent) {
    return {
      channel: CH, m: { ts: TS }, msgTs: parseFloat(TS),
      text: '[from: CEO → CTO] design the thing', agentId: 'cto', agent,
    };
  }

  beforeEach(() => { delete process.env.MACF_DIRECTIVE_WORKFLOW; });

  test('workflow mode + completed record: the poller consumes the workflow result and never executes the agent inline', async () => {
    const intake = intakeMod().createIntakeStore(path.join(TMP, 'intake-poll-a'));
    poll.__setIntakeStoreForTest(intake);
    intake.touchHeartbeat();
    await intake.register({ channel: CH, ts: TS, msgTs: parseFloat(TS), agentId: 'cto', text: 'x', checkpointRunId: RUN_ID });
    await intake.update(`${CH}:${TS}`, { status: 'completed', hatchetRunId: 'hatchet-run-poll', result: { response: 'workflow result' } });
    process.env.MACF_DIRECTIVE_WORKFLOW = '1';
    const agent = { handleDelegation: jest.fn(async () => ({ response: 'INLINE — must not happen' })) };
    const out = await poll.executeDelegation(makeItem(agent), { timeoutMs: 2000, pollMs: 5 });
    expect(out).toEqual({ response: 'workflow result' });
    expect(agent.handleDelegation).not.toHaveBeenCalled();
  });

  test('workflow mode + failed record: resolves null for the retry machinery and does NOT re-execute inline', async () => {
    const intake = intakeMod().createIntakeStore(path.join(TMP, 'intake-poll-b'));
    poll.__setIntakeStoreForTest(intake);
    intake.touchHeartbeat();
    await intake.register({ channel: CH, ts: TS, msgTs: parseFloat(TS), agentId: 'cto', text: 'x', checkpointRunId: RUN_ID });
    await intake.update(`${CH}:${TS}`, { status: 'failed', error: 'step exploded' });
    process.env.MACF_DIRECTIVE_WORKFLOW = '1';
    const agent = { handleDelegation: jest.fn(async () => ({ response: 'INLINE — must not happen' })) };
    const out = await poll.executeDelegation(makeItem(agent), { timeoutMs: 2000, pollMs: 5 });
    expect(out).toBeNull();
    expect(agent.handleDelegation).not.toHaveBeenCalled();
  });

  test('workflow mode + stale heartbeat: falls back to inline execution (no run can have started)', async () => {
    const intake = intakeMod().createIntakeStore(path.join(TMP, 'intake-poll-c'));
    poll.__setIntakeStoreForTest(intake);
    // No touchHeartbeat: the engine is considered down.
    process.env.MACF_DIRECTIVE_WORKFLOW = '1';
    const agent = { handleDelegation: jest.fn(async () => ({ response: 'inline result' })) };
    const out = await poll.executeDelegation(makeItem(agent), { timeoutMs: 2000, pollMs: 5 });
    expect(out).toEqual({ response: 'inline result' });
    expect(agent.handleDelegation).toHaveBeenCalledTimes(1);
  });

  test('flag off: inline execution, exactly as today, and no intake record is created', async () => {
    const intake = intakeMod().createIntakeStore(path.join(TMP, 'intake-poll-d'));
    poll.__setIntakeStoreForTest(intake);
    intake.touchHeartbeat();
    const agent = { handleDelegation: jest.fn(async () => ({ response: 'inline result' })) };
    const out = await poll.executeDelegation(makeItem(agent), { timeoutMs: 2000, pollMs: 5 });
    expect(out).toEqual({ response: 'inline result' });
    expect(await intake.get(`${CH}:${TS}`)).toBeNull();
  });

  test('the inline fallback runs the agent inside the run context with the deterministic run ID + a checkpoint store', async () => {
    const rc = impl('../runContext');
    const intake = intakeMod().createIntakeStore(path.join(TMP, 'intake-poll-e'));
    poll.__setIntakeStoreForTest(intake);
    let seenCtx = null;
    const agent = {
      handleDelegation: jest.fn(async () => { seenCtx = rc.currentRunContext(); return { response: 'ok' }; }),
    };
    const out = await poll.executeDelegation(makeItem(agent), { timeoutMs: 2000, pollMs: 5 });
    expect(out).toEqual({ response: 'ok' });
    expect(seenCtx).not.toBeNull();
    expect(seenCtx.runId).toBe(RUN_ID);
    expect(seenCtx.checkpointStore).toBeTruthy();
    expect(typeof seenCtx.checkpointStore.saveCheckpoint).toBe('function');
  });
});

// ─── US-B1.2: coverage inventory — zero directive-path executions outside ───

describe('US-B1.2 — coverage inventory', () => {
  test('directivePoll has exactly one direct handleDelegation call site (the inline fallback); the step executor is the only other sanctioned site', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'directivePoll.js'), 'utf8');
    const sites = src.match(/\.handleDelegation\(/g) || [];
    expect(sites).toHaveLength(1);
    // The one site sits inside the inline executor, behind the workflow path.
    const idxExec = src.indexOf('async function executeInline');
    const idxCall = src.indexOf('.handleDelegation(');
    expect(idxExec).toBeGreaterThan(-1);
    expect(idxCall).toBeGreaterThan(idxExec);
    // Both execution routes funnel through executeDelegation.
    expect(src).toContain('async function executeDelegation');
    expect(src).toContain('executeViaWorkflow');

    const dwSrc = fs.readFileSync(path.join(__dirname, '..', 'directiveWorkflow.js'), 'utf8');
    expect((dwSrc.match(/\.handleDelegation\(/g) || []).length).toBe(1);
    // The in-run relay (sub-delegations inside an executing run) is unchanged.
    const relaySrc = fs.readFileSync(path.join(__dirname, '..', '..', 'utils', 'delegation.js'), 'utf8');
    expect(relaySrc).toContain('.handleDelegation(');
  });
});
