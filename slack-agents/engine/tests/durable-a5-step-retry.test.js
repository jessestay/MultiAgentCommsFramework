// durable-a5-step-retry.test.js — Phase A, US-A5 (Vikunja #789).
//
// TDD RED PHASE (Oct 16, 2026): written from the acceptance criteria BEFORE
// the implementation. (US-A5.3, the live gateway empty-200 experiment,
// lives in durable-a5-live-experiment.test.js — skipped by default.)
//
// Contract:
//   * NEW MODULE utils/stepClassifier.js exporting:
//       classifyTurnResult(turn) -> { ok: true }
//                                 | { ok: false, kind: 'empty', retryable: true }
//         - a turn is 'empty' when it has no tool calls and its text is
//           empty or whitespace-only.
//       classifyStepError(err) -> { kind: 'empty'|'transport'|'non_retryable',
//                                   retryable: boolean }
//         - chain-exhaustion / empty-response errors -> 'empty', retryable;
//         - timeouts / connection resets / socket errors -> 'transport',
//           retryable;
//         - permission / 401 / 403 / invalid-input errors -> 'non_retryable'.
//   * generateWithTools with checkpointing on (see durable-a1/a2): a failed
//     step retries against the preserved, checkpointed history — completed
//     tools are never re-executed — and when the per-delegation step
//     deadline expires, the delegation fails with its LAST GOOD checkpoint
//     intact and loadable (US-A5.2).
//
// The within-attempt step-retry behavior itself already exists (Oct 15,
// kernel-resilience.test.js); this suite pins its interaction with the
// Phase A checkpoint store.
//
// jest notes (AGENTS.md): jest.mock is file-wide — litellm and agentTools
// are both mocked here.

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-durable-a5-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');
process.env.MACF_STEP_BACKOFF_MS = '1';
delete process.env.ANTHROPIC_API_KEY;

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
  },
  getToolDescriptions: () => 'fileRead',
  executeTool: (...args) => mockExecuteTool(...args),
}));

const { generateWithTools } = require('../../utils/anthropic');

function newStore() {
  const mod = impl('../../utils/checkpointStore');
  return { mod, store: mod.createCheckpointStore(mod.createMemoryAdapter()) };
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

// ─── TDD unit: step-failure classifier ──────────────────────────────────────

describe('step-failure classifier — empty vs transport vs non-retryable (TDD)', () => {
  test('classifyTurnResult flags empty and whitespace-only turns as retryable empty failures', () => {
    const { classifyTurnResult } = impl('../../utils/stepClassifier');
    expect(classifyTurnResult({ text: '', toolCalls: [] })).toEqual({ ok: false, kind: 'empty', retryable: true });
    expect(classifyTurnResult({ text: '  \n\t ', toolCalls: [] })).toEqual({ ok: false, kind: 'empty', retryable: true });
    expect(classifyTurnResult({ text: null, toolCalls: undefined })).toEqual({ ok: false, kind: 'empty', retryable: true });
  });

  test('classifyTurnResult passes turns with text or tool calls', () => {
    const { classifyTurnResult } = impl('../../utils/stepClassifier');
    expect(classifyTurnResult({ text: 'an answer', toolCalls: [] })).toEqual({ ok: true });
    expect(classifyTurnResult({ text: '', toolCalls: [{ id: 'c1', toolName: 'fileRead', args: {} }] })).toEqual({ ok: true });
  });

  test('classifyStepError sorts chain-exhaustion/empty errors as retryable empty failures', () => {
    const { classifyStepError } = impl('../../utils/stepClassifier');
    const err = new Error("litellm: all models failed for 'smart': 6 empty response(s), no transport errors");
    expect(classifyStepError(err)).toEqual({ kind: 'empty', retryable: true });
    expect(classifyStepError(new Error('LLM returned empty response after retries')).kind).toBe('empty');
  });

  test('classifyStepError sorts timeouts and connection failures as retryable transport failures', () => {
    const { classifyStepError } = impl('../../utils/stepClassifier');
    for (const msg of ['timeout of 60000ms exceeded', 'connect ECONNRESET 10.0.0.1:4000', 'socket hang up', 'request failed: ETIMEDOUT']) {
      expect(classifyStepError(new Error(msg))).toEqual({ kind: 'transport', retryable: true });
    }
  });

  test('classifyStepError sorts permission and auth failures as non-retryable', () => {
    const { classifyStepError } = impl('../../utils/stepClassifier');
    for (const msg of ['Request failed with status code 403', '401 Unauthorized', 'permission denied for role cmo']) {
      const c = classifyStepError(new Error(msg));
      expect(c.kind).toBe('non_retryable');
      expect(c.retryable).toBe(false);
    }
  });
});

// ─── BDD: US-A5 — a failed step never discards checkpointed progress ────────

describe('US-A5 — a failed step never discards checkpointed progress', () => {
  test('A5.1: an empty step retries with the full preserved history — no completed tool is re-executed — and progress is checkpointed', async () => {
    const { store } = newStore();
    let turn = 0;
    const seenMessages = [];
    mockChatTurn.mockImplementation(async (args) => {
      turn++;
      seenMessages.push(JSON.parse(JSON.stringify(args.messages)));
      if (turn === 1) return { text: '', toolCalls: [{ id: 'c1', toolName: 'fileRead', args: { path: 'draft.md' } }] };
      if (turn <= 3) return { text: '', toolCalls: [] }; // two empty steps
      return { text: 'Recovered with history intact. [DEMO]', toolCalls: [] };
    });
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Read the draft, survive the empties.',
      maxTokens: 500, agentId: 'cmo', taskId: 761,
      runId: 'run-a5-1', checkpointStore: store,
    });
    expect(result.response).toContain('Recovered with history intact');
    // The one completed tool ran exactly once despite two step retries.
    expect(mockExecuteTool.mock.calls).toHaveLength(1);
    // The retrying step was given the full preserved history, tool result
    // included.
    const lastSeen = seenMessages[seenMessages.length - 1];
    expect(lastSeen.some(m => m.role === 'tool' && String(m.content).includes('CONTENT OF draft.md'))).toBe(true);
    // And the progress is in the checkpoint store, not only in memory.
    const cp = await store.loadCheckpoint('run-a5-1');
    expect(cp).not.toBeNull();
    expect(cp.stepIndex).toBeGreaterThanOrEqual(2);
    expect(cp.messages.some(m => m.role === 'tool')).toBe(true);
  });

  test('A5.2: when the step deadline expires, the delegation fails with its last good checkpoint intact and loadable', async () => {
    process.env.MACF_STEP_DEADLINE_MS = '250';
    const { mod, store } = newStore();
    let turn = 0;
    mockChatTurn.mockImplementation(async () => {
      turn++;
      if (turn === 1) return { text: '', toolCalls: [{ id: 'c1', toolName: 'fileRead', args: { path: 'draft.md' } }] };
      return { text: '', toolCalls: [] }; // empties forever
    });
    await expect(generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Read the draft, then the route dies.',
      maxTokens: 500, agentId: 'cmo', taskId: 761,
      runId: 'run-a5-2', checkpointStore: store,
    })).rejects.toThrow(/empty response after retries/i);
    // The failure did not take the completed work with it.
    const cp = await store.loadCheckpoint('run-a5-2');
    expect(cp).not.toBeNull();
    expect(mod.validateCheckpoint(cp).valid).toBe(true);
    expect(cp.messages.some(m => m.role === 'tool' && String(m.content).includes('CONTENT OF draft.md'))).toBe(true);
    expect(mockExecuteTool.mock.calls).toHaveLength(1);
  });
});
