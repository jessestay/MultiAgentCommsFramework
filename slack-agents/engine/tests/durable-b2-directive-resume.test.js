// durable-b2-directive-resume.test.js — Phase B, US-B2 (Vikunja #789).
//
// TDD RED PHASE (Oct 16, 2026): written from the US-B2 acceptance criteria
// BEFORE the implementation.
//
// US-B2.1: a directive workflow is running; the worker dies mid-step; the
// workflow resumes and the agent continues from its last checkpoint under
// the same run ID. Encoded here at the level the system actually provides:
// the step executor (engine/directiveWorkflow.js createStepExecutor) runs
// a production-shaped agent — a thin handleDelegation wrapper over the
// REAL generateWithTools that does NOT pass runId/checkpointStore itself
// (exactly like today's agents) — with the run context supplying the
// deterministic checkpoint run ID and the FILE-BACKED durable checkpoint
// store (utils/checkpointAdapters.js). "Worker death" = the LLM call
// throws a non-retryable error after the first tool batch has been
// checkpointed (the Graham shape: progress made, then the attempt dies).
// "Resume" = a NEW step executor + a NEW checkpoint store instance over
// the same directory (a new process), same directive input.
//
// US-B2.2: a completed directive's receipt chain shows the workflow run
// ID, the executed steps, and the verifier's evidence — the kernel US-9
// shape. Encoded as the three cross-referencing artifacts the system
// produces: (1) the receipts-ledger dispatch record (run ID + channel +
// directive ts + checkpoint run ID), (2) the checkpoint record itself
// (steps executed, tool results, terminal status, final response), (3)
// the poller's finalize step queuing the outcome for the external
// verifier (directiveVerify), exactly as a kernel task's completion
// rests on the verifier.
//
// jest notes (AGENTS.md): jest.mock is file-wide — litellm and agentTools
// are mocked here (controlled execution counting, no side effects), the
// same doubles as the durable-a* suites. Everything else is real.

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-durable-b2-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');
process.env.MACF_STEP_BACKOFF_MS = '1';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.VIKUNJA_TOKEN;

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

function impl(rel) {
  try { return require(rel); } catch (e) {
    throw new Error(`RED PHASE (TDD): implementation module not built yet: ${rel} — ${e.code || e.message}`);
  }
}

const mockChatTurn = jest.fn();
const mockExecuteTool = jest.fn();
jest.mock('../../utils/litellm', () => ({
  isConfigured: () => true,
  chat: jest.fn(),
  chatTurn: (...args) => mockChatTurn(...args),
}));
jest.mock('../../utils/agentTools', () => ({
  TOOLS: {
    fileRead: { description: 'Read a file', argsSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } },
    fileWrite: { description: 'Write a file', argsSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false } },
  },
  getToolDescriptions: () => 'fileRead, fileWrite',
  executeTool: (...args) => mockExecuteTool(...args),
}));

const { generateWithTools } = require('../../utils/anthropic');

const CH = 'C0ASH4TF604';
const TS = '1792141326.864789';
const RUN_ID = `directive:${CH}:${TS}`;
const DIRECTIVE_TEXT = '[from: CEO → CTO] Design the audit landing page and report back with the demo link';
const CKPT_DIR = path.join(TMP, 'checkpoints-b2');

// A production-shaped agent: handleDelegation is a thin wrapper over
// generateWithTools and does NOT pass runId/checkpointStore — the run
// context (set by the step executor) supplies them, as in production.
function makeAgent() {
  return {
    handleDelegation: async (text) => {
      const r = await generateWithTools({
        systemPrompt: 'You are a test agent.',
        context: text,
        maxTokens: 500,
        agentId: 'cto',
      });
      return { response: r.response || '' };
    },
  };
}

function makeExecutor() {
  const dw = impl('../directiveWorkflow');
  const adapters = impl('../../utils/checkpointAdapters');
  // A NEW store instance every time: each executor simulates a fresh
  // worker process over the same durable directory.
  const store = adapters.createDurableCheckpointStore({ dir: CKPT_DIR });
  return dw.createStepExecutor({ getAgent: () => makeAgent(), checkpointStore: store });
}

beforeEach(() => {
  mockChatTurn.mockReset();
  mockExecuteTool.mockReset();
  mockExecuteTool.mockImplementation(async (toolName, args) => ({
    ok: true, tool: toolName, content: `CONTENT OF ${args && args.path}`,
  }));
  process.env.MACF_STEP_BACKOFF_MS = '1';
  process.env.MACF_STEP_DEADLINE_MS = '30000';
});

// ─── US-B2.1: worker death mid-directive → resume from checkpoint ───────────

describe('US-B2.1 — a directive survives worker death and resumes from its checkpoint', () => {
  test('attempt 1 dies after a checkpointed tool step; attempt 2 (new process) resumes under the same run ID without re-executing the tool', async () => {
    const input = { channel: CH, ts: TS, msgTs: parseFloat(TS), agentId: 'cto', text: DIRECTIVE_TEXT };

    // Attempt 1: first LLM call issues a fileRead; the tool executes and
    // the batch is checkpointed; the second LLM call kills the worker
    // (non-retryable throw — the attempt dies with progress on disk).
    let call = 0;
    mockChatTurn.mockImplementation(async () => {
      call++;
      if (call === 1) return { text: '', toolCalls: [{ id: 'c1', toolName: 'fileRead', args: { path: 'draft.md' } }] };
      throw new Error('worker process killed (simulated death mid-step)');
    });
    await expect(makeExecutor()(input)).rejects.toThrow(/worker process killed/);
    expect(mockExecuteTool.mock.calls).toHaveLength(1);

    // The checkpoint on durable storage holds the completed step.
    const adapters = impl('../../utils/checkpointAdapters');
    const probe = adapters.createDurableCheckpointStore({ dir: CKPT_DIR });
    const cp1 = await probe.loadCheckpoint(RUN_ID);
    expect(cp1).not.toBeNull();
    expect(cp1.stepIndex).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(cp1.messages)).toContain('CONTENT OF draft.md');

    // Attempt 2: a fresh worker (new executor + new store instance) runs
    // the SAME directive input — the same deterministic run ID.
    let firstMessages = null;
    mockChatTurn.mockImplementation(async (args) => {
      if (!firstMessages) firstMessages = JSON.parse(JSON.stringify(args.messages));
      return { text: 'Finished the design. https://example.com/demo', toolCalls: [] };
    });
    const result = await makeExecutor()(input);
    expect(result.response).toContain('Finished the design');

    // The resumed conversation OPENS with the checkpointed history: the
    // tool result that only existed in attempt 1 is present.
    expect(JSON.stringify(firstMessages)).toContain('CONTENT OF draft.md');
    // The completed tool was NOT re-executed on resume.
    expect(mockExecuteTool.mock.calls).toHaveLength(1);
    // Same run ID, now terminal.
    const cp2 = await probe.loadCheckpoint(RUN_ID);
    expect(cp2.runId).toBe(RUN_ID);
    expect(cp2.status).toBe('done');
  });
});

// ─── US-B2.2: the receipt chain has the kernel US-9 shape ───────────────────

describe('US-B2.2 — receipt chain: run ID, executed steps, verifier evidence', () => {
  test('dispatch record + checkpoint + finalize-for-verification cross-reference one run', async () => {
    const dw = impl('../directiveWorkflow');
    const intakeMod = impl('../directiveIntake');
    const adapters = impl('../../utils/checkpointAdapters');
    const receipts = require('../receipts');
    const poll = require('../directivePoll');

    const ckDir = path.join(TMP, 'checkpoints-b22');
    const store = adapters.createDurableCheckpointStore({ dir: ckDir });
    const executor = dw.createStepExecutor({ getAgent: () => makeAgent(), checkpointStore: store });

    // A Hatchet-shaped fake: runNoWait starts the REAL step body and
    // hands back a run ref (the M2 test pattern — the workflow boundary
    // is faked, everything inside it is real).
    const fakeWorkflow = {
      runNoWait: async (input) => {
        const output = dw.runDirectiveWork(input, { executeDirective: executor });
        return { runId: Promise.resolve('hatchet-run-b2'), output };
      },
    };
    const intake = intakeMod.createIntakeStore(path.join(TMP, 'intake-b22'));
    await intake.register({ channel: CH, ts: TS, msgTs: parseFloat(TS), agentId: 'cto', text: DIRECTIVE_TEXT, checkpointRunId: RUN_ID });
    const dispatcher = dw.createDirectiveDispatcher(fakeWorkflow, { intake });

    // A production-shaped reply: full prose with terminal punctuation —
    // the poller's garble gate (correctly) rejects terse fragments.
    mockChatTurn.mockImplementation(async () => ({ text: 'Design complete for the audit landing page, with the booking section and the demo walkthrough included. The live demo is at https://example.com/demo.', toolCalls: [] }));
    const dispatched = await dispatcher(await intake.get(`${CH}:${TS}`));
    await dispatched.done;

    const settled = await intake.get(`${CH}:${TS}`);
    expect(settled.status).toBe('completed');
    expect(settled.result.response).toContain('Design complete');

    // (1) Ledger: the run record ties hatchet run ID ↔ channel + ts ↔
    // checkpoint run ID.
    const runReceipt = receipts.readAllReceipts()
      .find(r => r.tool === 'external:directive_workflow_run' && r.artifacts[0].ref === 'hatchet-run-b2');
    expect(runReceipt).toBeTruthy();
    expect(runReceipt.artifacts[0].channel).toBe(CH);
    expect(String(runReceipt.artifacts[0].directiveTs)).toBe(TS);
    expect(runReceipt.artifacts[0].checkpointRunId).toBe(RUN_ID);

    // (2) Checkpoint: the executed steps are inspectable under the run ID.
    const cp = await store.loadCheckpoint(RUN_ID);
    expect(cp).not.toBeNull();
    expect(cp.stepIndex).toBeGreaterThanOrEqual(1);
    expect(cp.status).toBe('done');
    expect(cp.response).toContain('Design complete');

    // (3) Verifier evidence: the poller's finalize step accepts the
    // workflow-produced result (URL evidence) and queues it for the
    // external verifier — the directive path's verifier handoff.
    const verifyPath = path.join(__dirname, '..', '.directive-verify-state.json');
    const healthPath = path.join(__dirname, '..', '.agent-health.json');
    const savedVerify = fs.existsSync(verifyPath) ? fs.readFileSync(verifyPath, 'utf8') : null;
    const savedHealth = fs.existsSync(healthPath) ? fs.readFileSync(healthPath, 'utf8') : null;
    try {
      const client = {
        chat: { postMessage: async () => ({ ts: '1792141999.000100' }) },
        conversations: {
          replies: async () => ({ messages: [{ ts: '1792141999.000100' }] }),
          // The result carries no threadTs, so the poller's read-back
          // verification uses channel history (fail-closed if absent).
          history: async () => ({ messages: [{ ts: '1792141999.000100' }] }),
        },
      };
      const state = {};
      const item = {
        channel: CH, m: { ts: TS }, msgTs: parseFloat(TS),
        text: DIRECTIVE_TEXT, agentId: 'cto', agent: makeAgent(),
      };
      const processed = await poll.finalizeDelegation(client, state, item, settled.result);
      expect(processed).toBe(1);
      const verifyState = JSON.parse(fs.readFileSync(verifyPath, 'utf8'));
      const queued = verifyState.pending.find(p => p.agentId === 'cto' && p.directive.includes('Design the audit landing page'));
      expect(queued).toBeTruthy();
      expect(queued.response).toContain('https://example.com/demo');
    } finally {
      if (savedVerify === null) { try { fs.unlinkSync(verifyPath); } catch { /* ignore */ } }
      else fs.writeFileSync(verifyPath, savedVerify);
      if (savedHealth === null) { try { fs.unlinkSync(healthPath); } catch { /* ignore */ } }
      else fs.writeFileSync(healthPath, savedHealth);
    }
  });
});
