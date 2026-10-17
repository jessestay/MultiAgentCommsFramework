// durable-a2-resume.test.js — Phase A, US-A2 (Vikunja #789).
//
// TDD RED PHASE (Oct 16, 2026): written from the acceptance criteria BEFORE
// the implementation. Contract additions on top of durable-a1:
//
//   * utils/checkpointStore.js also exports:
//       validateHistory(messages) -> { valid, errors[] }
//         - non-empty array; first message is the user turn; every 'tool'
//           message's tool_call_id matches a tool_call id in the preceding
//           assistant message.
//       buildResumeState(checkpoint) -> { messages (deep copy), stepIndex,
//                                         toolResults, tokens }
//       store.quarantineCheckpoint(runId, reason) -> moves the run's stored
//         checkpoint out of the active set and records it.
//       store.getQuarantined(runId) -> array of { runId, reason, record, ... }
//   * generateWithTools with { runId, checkpointStore }:
//       - if a VALID checkpoint exists, the loop's initial messages ARE the
//         checkpointed messages (the checkpoint is a prefix of the first
//         LLM call's history) and stepIndex continues from the checkpoint.
//       - if the stored checkpoint fails validation, the attempt starts
//         clean, the bad checkpoint is quarantined + recorded, and the
//         task is NOT wedged (US-A2.4).
//       - with no checkpoint, the start is exactly today's clean start
//         (US-A2.3 — a guard test: this behavior already holds today).
//
// jest notes (AGENTS.md): jest.mock is file-wide — litellm and agentTools
// are both mocked here (controlled execution counting, no side effects).

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-durable-a2-'));
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
    fileWrite: { description: 'Write a file', argsSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false } },
  },
  getToolDescriptions: () => 'fileRead, fileWrite',
  executeTool: (...args) => mockExecuteTool(...args),
}));

const { generateWithTools } = require('../../utils/anthropic');
const snap = (msgs) => JSON.parse(JSON.stringify(msgs));

function newStore() {
  const mod = impl('../../utils/checkpointStore');
  return { mod, store: mod.createCheckpointStore(mod.createMemoryAdapter()) };
}

// A step-N history in exactly the shape gatewayNativeLoop builds it:
// user turn, assistant tool-call turn, tool result turn.
function stepNMessages(toolContent) {
  return [
    { role: 'user', content: 'Task: ORIGINAL ASSIGNMENT — design the thing.\n\nYou have tools available on the native tool channel.' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'fileRead', arguments: '{"path":"draft.md"}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: JSON.stringify({ ok: true, content: toolContent }) },
  ];
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

// ─── TDD unit: history validator + resume-state builder ─────────────────────

describe('checkpoint loader / history validator / resume-state builder (TDD)', () => {
  test('validateHistory accepts a well-formed tool conversation', () => {
    const { mod } = newStore();
    const v = mod.validateHistory(stepNMessages('SOME RESULT'));
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  test('validateHistory rejects empty, mis-sequenced, and orphaned-tool histories', () => {
    const { mod } = newStore();
    expect(mod.validateHistory([]).valid).toBe(false);
    expect(mod.validateHistory('not-an-array').valid).toBe(false);
    // Tool result whose tool_call_id matches no preceding assistant call.
    const orphaned = [
      { role: 'user', content: 'Task: x' },
      { role: 'tool', tool_call_id: 'nope', content: '{}' },
    ];
    expect(mod.validateHistory(orphaned).valid).toBe(false);
    // Tool result answering the WRONG call id.
    const mismatched = stepNMessages('R');
    mismatched[2].tool_call_id = 'other-call';
    expect(mod.validateHistory(mismatched).valid).toBe(false);
  });

  test('buildResumeState returns the checkpointed state as an independent copy', async () => {
    const { mod, store } = newStore();
    const saved = await store.saveCheckpoint('run-rs', {
      messages: stepNMessages('RESUME ME'), stepIndex: 2,
      toolResults: [{ tool: 'fileRead', args: { path: 'draft.md' }, result: { ok: true } }],
      tokens: { promptTokens: 10, completionTokens: 5 }, status: 'running',
    });
    const resume = mod.buildResumeState(saved);
    expect(resume.stepIndex).toBe(2);
    expect(resume.messages).toEqual(saved.messages);
    expect(resume.toolResults).toHaveLength(1);
    expect(resume.tokens).toEqual({ promptTokens: 10, completionTokens: 5 });
    // Deep copy: mutating the resume state must not corrupt the store.
    resume.messages[2].content = 'MUTATED';
    const reloaded = await store.loadCheckpoint('run-rs');
    expect(reloaded.messages[2].content).toContain('RESUME ME');
  });
});

// ─── BDD: US-A2 — a fresh attempt resumes the conversation ──────────────────

describe('US-A2 — a fresh attempt resumes the conversation', () => {
  test('A2.1: a fresh attempt loads the step-N checkpoint and its first LLM call continues from the step-N message state', async () => {
    const { store } = newStore();
    const seeded = stepNMessages('STEP N RESULT');
    await store.saveCheckpoint('run-a2-1', {
      messages: seeded, stepIndex: 2,
      toolResults: [{ tool: 'fileRead', args: { path: 'draft.md' }, result: { ok: true } }],
      status: 'running',
    });
    let firstMessages = null;
    mockChatTurn.mockImplementation(async (args) => {
      if (!firstMessages) firstMessages = snap(args.messages);
      return { text: 'Resumed and finished. [DEMO]', toolCalls: [] };
    });
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'ORIGINAL ASSIGNMENT — design the thing.',
      maxTokens: 500, agentId: 'cmo', taskId: 761,
      runId: 'run-a2-1', checkpointStore: store,
    });
    expect(result.response).toContain('Resumed and finished');
    // The checkpointed history is the prefix of the resumed conversation.
    expect(firstMessages.slice(0, seeded.length)).toEqual(seeded);
    expect(firstMessages[2].content).toContain('STEP N RESULT');
    // The step counter continued from N instead of restarting at zero.
    const cp = await store.loadCheckpoint('run-a2-1');
    expect(cp.stepIndex).toBeGreaterThan(2);
  });

  test('A2.2: a resumed delegation never re-executes a tool whose result is already checkpointed', async () => {
    const { store } = newStore();
    await store.saveCheckpoint('run-a2-2', {
      messages: stepNMessages('ALREADY READ'), stepIndex: 2,
      toolResults: [{ tool: 'fileRead', args: { path: 'draft.md' }, result: { ok: true } }],
      status: 'running',
    });
    let turn = 0;
    mockChatTurn.mockImplementation(async () => {
      turn++;
      if (turn === 1) return { text: '', toolCalls: [{ id: 'c9', toolName: 'fileWrite', args: { path: 'out.md', content: 'new work' } }] };
      return { text: 'Done. [DEMO]', toolCalls: [] };
    });
    await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'ORIGINAL ASSIGNMENT — design the thing.',
      maxTokens: 500, agentId: 'cmo', taskId: 761,
      runId: 'run-a2-2', checkpointStore: store,
    });
    // Exactly one execution — the NEW fileWrite. fileRead was not re-run.
    expect(mockExecuteTool.mock.calls).toHaveLength(1);
    expect(mockExecuteTool.mock.calls[0][0]).toBe('fileWrite');
  });

  test('A2.3: with no checkpoint, the attempt begins from the original assignment text exactly as today (guard)', async () => {
    let firstMessages = null;
    mockChatTurn.mockImplementation(async (args) => {
      if (!firstMessages) firstMessages = snap(args.messages);
      return { text: 'Clean start done. [DEMO]', toolCalls: [] };
    });
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'UNIQUE ASSIGNMENT TEXT 42',
      maxTokens: 500, agentId: 'cmo', taskId: 761,
      // No runId / checkpointStore: the pre-Phase-A invocation shape.
    });
    expect(result.response).toContain('Clean start done');
    expect(firstMessages).toHaveLength(1);
    expect(firstMessages[0].role).toBe('user');
    expect(firstMessages[0].content).toContain('UNIQUE ASSIGNMENT TEXT 42');
  });

  test('A2.4: a corrupt checkpoint is quarantined and recorded, and the attempt falls back to a clean start instead of wedging', async () => {
    const mod = impl('../../utils/checkpointStore');
    const adapter = mod.createMemoryAdapter();
    const store = mod.createCheckpointStore(adapter);
    await store.saveCheckpoint('run-a2-4', {
      messages: stepNMessages('GOOD BEFORE CORRUPTION'), stepIndex: 2, status: 'running',
    });
    // Corrupt the stored record in place (schema-mismatched state).
    for (const [key, value] of adapter._map.entries()) {
      const parsed = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return null; } })() : value;
      if (parsed && parsed.runId === 'run-a2-4') {
        adapter._map.set(key, JSON.stringify({ runId: 'run-a2-4', messages: 'CORRUPT — not an array', stepIndex: 'NaN' }));
      }
    }
    let firstMessages = null;
    mockChatTurn.mockImplementation(async (args) => {
      if (!firstMessages) firstMessages = snap(args.messages);
      return { text: 'Recovered from corruption with a clean start. [DEMO]', toolCalls: [] };
    });
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'CORRUPT-CHECKPOINT ASSIGNMENT',
      maxTokens: 500, agentId: 'cmo', taskId: 761,
      runId: 'run-a2-4', checkpointStore: store,
    });
    // Not wedged: the task completed from a clean start.
    expect(result.response).toContain('clean start');
    expect(firstMessages).toHaveLength(1);
    expect(firstMessages[0].content).toContain('CORRUPT-CHECKPOINT ASSIGNMENT');
    // The bad checkpoint was quarantined and the quarantine recorded.
    const quarantined = await store.getQuarantined('run-a2-4');
    expect(quarantined.length).toBeGreaterThanOrEqual(1);
    expect(quarantined[0].runId).toBe('run-a2-4');
  });

  test('A2.5: Graham #761 reference replay — an attempt that died after reading both drafts resumes with both file contents already in history', async () => {
    const { store } = newStore();
    const onePagerBody = 'GRAHAM ONE-PAGER DRAFT — full body text of the capabilities one-pager';
    const emailBody = 'GRAHAM CARRY EMAIL DRAFT — full body text of the carry email';
    const messages = [
      { role: 'user', content: 'Task: #761 DESIGN PASS — produce the designed Graham Schwab / 829 Studios materials.' },
      { role: 'assistant', content: null, tool_calls: [
        { id: 'g1', type: 'function', function: { name: 'fileRead', arguments: '{"path":"task-761/graham-schwab-829-studios-capabilities-one-pager-DRAFT.md"}' } },
        { id: 'g2', type: 'function', function: { name: 'fileRead', arguments: '{"path":"task-761/graham-schwab-carry-email-DRAFT.md"}' } },
      ] },
      { role: 'tool', tool_call_id: 'g1', content: JSON.stringify({ ok: true, content: onePagerBody }) },
      { role: 'tool', tool_call_id: 'g2', content: JSON.stringify({ ok: true, content: emailBody }) },
    ];
    await store.saveCheckpoint('run-a2-5', {
      messages, stepIndex: 3,
      toolResults: [
        { tool: 'fileRead', args: { path: 'task-761/graham-schwab-829-studios-capabilities-one-pager-DRAFT.md' }, result: { ok: true } },
        { tool: 'fileRead', args: { path: 'task-761/graham-schwab-carry-email-DRAFT.md' }, result: { ok: true } },
      ],
      status: 'running',
    });
    let firstMessages = null;
    mockChatTurn.mockImplementation(async (args) => {
      if (!firstMessages) firstMessages = snap(args.messages);
      return { text: 'Designed one-pager produced. [DEMO]', toolCalls: [] };
    });
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: '#761 DESIGN PASS — produce the designed Graham Schwab / 829 Studios materials.',
      maxTokens: 500, agentId: 'cmo', taskId: 761,
      runId: 'run-a2-5', checkpointStore: store,
    });
    expect(result.response).toContain('Designed one-pager produced');
    // Neither draft is re-read: zero tool executions in the resumed attempt.
    expect(mockExecuteTool.mock.calls).toHaveLength(0);
    // Both draft bodies were already in the resumed history.
    const historyText = JSON.stringify(firstMessages);
    expect(historyText).toContain(onePagerBody);
    expect(historyText).toContain(emailBody);
  });
});
