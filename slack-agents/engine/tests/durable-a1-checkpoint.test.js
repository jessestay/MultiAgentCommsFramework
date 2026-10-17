// durable-a1-checkpoint.test.js — Phase A, US-A1 (Vikunja #789).
//
// TDD RED PHASE (Oct 16, 2026): these tests are written from the story's
// acceptance criteria BEFORE the implementation exists. They define the
// contract the build must satisfy:
//
//   * NEW MODULE utils/checkpointStore.js exporting:
//       createMemoryAdapter() -> async KV adapter { get, set, delete, keys, _map }
//       createCheckpointStore(adapter) -> store
//       validateCheckpoint(record) -> { valid, errors[] }
//     Store API (all async):
//       saveCheckpoint(runId, { messages, stepIndex, toolResults, tokens,
//                               status, response?, at? }) -> stored record
//         - record: { runId, stepIndex, messages, toolResults, tokens,
//                     status, createdAt, updatedAt }
//         - `at` (ms epoch) overrides updatedAt (testability / pruning).
//         - a save with a LOWER stepIndex than the stored record must not
//           regress the checkpoint (monotonic guard).
//       loadCheckpoint(runId)   -> latest record | null
//       latestCheckpoint(runId) -> latest record | null
//   * generateWithTools gains options { runId, checkpointStore }:
//       - after EVERY completed LLM call a checkpoint is written
//         (stepIndex +1), and after EVERY completed tool batch another
//         (stepIndex +1) — one expensive call per durability boundary
//         (US-A1.5). The final save of a completed delegation carries
//         status 'done'; earlier saves carry 'running'.
//       - when a turn returns usage { promptTokens, completionTokens },
//         the checkpoint token counters accumulate it.
//       - a checkpoint WRITE FAILURE is recorded on the run and surfaced
//         as a checkpoint failure (rejection matching /checkpoint/i, or a
//         failure result with errorClass matching /checkpoint/) after at
//         most ONE further step — never silently uncheckpointed (US-A1.3).
//
// jest notes (AGENTS.md): jest.mock is file-wide — this file mocks litellm
// AND agentTools (controlled tool execution, no sandbox side effects).

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-durable-a1-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');
process.env.MACF_STEP_BACKOFF_MS = '1';
delete process.env.ANTHROPIC_API_KEY;

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

// Guarded loader: in the red phase the module does not exist. Turning that
// into a thrown error inside each test keeps the failure a TEST failure
// (file still collects) and names exactly what is missing.
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

beforeEach(() => {
  mockChatTurn.mockReset();
  mockExecuteTool.mockReset();
  mockExecuteTool.mockImplementation(async (toolName, args) => ({
    ok: true, tool: toolName, content: `CONTENT OF ${args && args.path}`,
  }));
  process.env.MACF_STEP_BACKOFF_MS = '1';
  process.env.MACF_STEP_DEADLINE_MS = '30000';
});

// ─── TDD unit: checkpoint writer / reader / schema validation ───────────────

describe('checkpointStore — writer/reader contract (TDD)', () => {
  test('exports the store factory, the memory adapter, and the validator', () => {
    const mod = impl('../../utils/checkpointStore');
    expect(typeof mod.createCheckpointStore).toBe('function');
    expect(typeof mod.createMemoryAdapter).toBe('function');
    expect(typeof mod.validateCheckpoint).toBe('function');
  });

  test('save → load round-trips messages, stepIndex, toolResults, tokens, status (serialization)', async () => {
    const { store } = newStore();
    const messages = [
      { role: 'user', content: 'Task: do it' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'fileRead', arguments: '{"path":"a.md"}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '{"ok":true,"content":"CONTENT OF a.md"}' },
    ];
    const saved = await store.saveCheckpoint('run-ser', {
      messages, stepIndex: 2,
      toolResults: [{ tool: 'fileRead', args: { path: 'a.md' }, result: { ok: true } }],
      tokens: { promptTokens: 120, completionTokens: 30 },
      status: 'running',
    });
    expect(saved.runId).toBe('run-ser');
    expect(saved.stepIndex).toBe(2);
    // Mutating the caller's array after save must not leak into the store —
    // the checkpoint is a serialized snapshot, not a live reference.
    messages[2].content = 'MUTATED AFTER SAVE';
    const loaded = await store.loadCheckpoint('run-ser');
    expect(loaded.messages).toHaveLength(3);
    expect(loaded.messages[2].content).toContain('CONTENT OF a.md');
    expect(loaded.toolResults).toHaveLength(1);
    expect(loaded.toolResults[0].tool).toBe('fileRead');
    expect(loaded.tokens).toEqual({ promptTokens: 120, completionTokens: 30 });
    expect(loaded.status).toBe('running');
    expect(typeof loaded.updatedAt).toBe('number');
  });

  test('checkpoints are keyed by runId — two runs never share state (keying)', async () => {
    const { store } = newStore();
    await store.saveCheckpoint('run-A', { messages: [{ role: 'user', content: 'ALPHA ONLY' }], stepIndex: 1, status: 'running' });
    await store.saveCheckpoint('run-B', { messages: [{ role: 'user', content: 'BETA ONLY' }], stepIndex: 1, status: 'running' });
    const a = await store.loadCheckpoint('run-A');
    const b = await store.loadCheckpoint('run-B');
    expect(JSON.stringify(a.messages)).toContain('ALPHA ONLY');
    expect(JSON.stringify(a.messages)).not.toContain('BETA ONLY');
    expect(JSON.stringify(b.messages)).toContain('BETA ONLY');
    expect(JSON.stringify(b.messages)).not.toContain('ALPHA ONLY');
  });

  test('loadCheckpoint returns null for an unknown runId', async () => {
    const { store } = newStore();
    expect(await store.loadCheckpoint('run-never-existed')).toBeNull();
    expect(await store.latestCheckpoint('run-never-existed')).toBeNull();
  });

  test('latest save at the highest stepIndex wins; a stale lower-step save does not regress it', async () => {
    const { store } = newStore();
    await store.saveCheckpoint('run-mono', { messages: [{ role: 'user', content: 'v3' }], stepIndex: 3, status: 'running' });
    await store.saveCheckpoint('run-mono', { messages: [{ role: 'user', content: 'v1-stale' }], stepIndex: 1, status: 'running' });
    const loaded = await store.latestCheckpoint('run-mono');
    expect(loaded.stepIndex).toBe(3);
    expect(loaded.messages[0].content).toBe('v3');
  });

  test('validateCheckpoint accepts a stored record and rejects malformed ones (schema validation)', async () => {
    const { mod, store } = newStore();
    const saved = await store.saveCheckpoint('run-val', { messages: [{ role: 'user', content: 'x' }], stepIndex: 1, status: 'running' });
    expect(mod.validateCheckpoint(saved).valid).toBe(true);
    for (const bad of [null, undefined, {}, { messages: 'not-an-array', stepIndex: 1 }, { messages: [], stepIndex: 'two' }, { messages: [{ content: 'no role' }], stepIndex: 1 }]) {
      const v = mod.validateCheckpoint(bad);
      expect(v.valid).toBe(false);
      expect(v.errors.length).toBeGreaterThan(0);
    }
  });
});

// ─── BDD: US-A1 — every step is checkpointed ────────────────────────────────

describe('US-A1 — every step is checkpointed', () => {
  test('A1.1: after an LLM step, a checkpoint exists with the full message array, step index, and token counters', async () => {
    const { store } = newStore();
    let turn = 0;
    mockChatTurn.mockImplementation(async () => {
      turn++;
      if (turn === 1) return { text: '', toolCalls: [{ id: 'c1', toolName: 'fileRead', args: { path: 'draft.md' } }], usage: { promptTokens: 120, completionTokens: 30 } };
      return { text: 'Done with the draft. [DEMO]', toolCalls: [], usage: { promptTokens: 200, completionTokens: 40 } };
    });
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Read the draft and finish.',
      maxTokens: 500, agentId: 'cmo', taskId: 761,
      runId: 'run-a1-1', checkpointStore: store,
    });
    expect(result.response).toContain('Done with the draft');
    const cp = await store.loadCheckpoint('run-a1-1');
    expect(cp).not.toBeNull();
    expect(Array.isArray(cp.messages)).toBe(true);
    // Full message array: user + assistant tool call + tool result.
    expect(cp.messages.some(m => m.role === 'tool' && String(m.content).includes('CONTENT OF draft.md'))).toBe(true);
    expect(cp.stepIndex).toBeGreaterThanOrEqual(2);
    // Token counters accumulate across both LLM calls.
    expect(cp.tokens.promptTokens).toBe(320);
    expect(cp.tokens.completionTokens).toBe(70);
    expect(cp.status).toBe('done');
  });

  test('A1.2: the checkpoint is rewritten to include a tool result before the next LLM call is made', async () => {
    const { store } = newStore();
    let turn = 0;
    let checkpointSeenBySecondCall = null;
    mockChatTurn.mockImplementation(async () => {
      turn++;
      if (turn === 1) return { text: '', toolCalls: [{ id: 'c1', toolName: 'fileRead', args: { path: 'draft.md' } }] };
      checkpointSeenBySecondCall = await store.loadCheckpoint('run-a1-2');
      return { text: 'Finished. [DEMO]', toolCalls: [] };
    });
    await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Read then finish.',
      maxTokens: 500, agentId: 'cmo', taskId: 761,
      runId: 'run-a1-2', checkpointStore: store,
    });
    expect(checkpointSeenBySecondCall).not.toBeNull();
    const toolMsg = checkpointSeenBySecondCall.messages.find(m => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg.content).toContain('CONTENT OF draft.md');
    expect(checkpointSeenBySecondCall.stepIndex).toBeGreaterThanOrEqual(2);
  });

  test('A1.3: a checkpoint write failure is recorded on the run and the delegation does not continue uncheckpointed for more than one further step', async () => {
    const { mod } = newStore();
    const inner = mod.createCheckpointStore(mod.createMemoryAdapter());
    const failingStore = {
      ...inner,
      saveCheckpoint: async () => { throw new Error('simulated Postgres write failure'); },
    };
    let turn = 0;
    mockChatTurn.mockImplementation(async () => {
      turn++;
      if (turn === 1) return { text: '', toolCalls: [{ id: 'c1', toolName: 'fileRead', args: { path: 'draft.md' } }] };
      return { text: 'Finished. [DEMO]', toolCalls: [] };
    });
    let resolved = null; let rejected = null;
    try {
      resolved = await generateWithTools({
        systemPrompt: 'You are a test agent.', context: 'Read then finish.',
        maxTokens: 500, agentId: 'cmo', taskId: 761,
        runId: 'run-a1-3', checkpointStore: failingStore,
      });
    } catch (e) { rejected = e; }
    const surfacedAsCheckpointFailure =
      (rejected && /checkpoint/i.test(rejected.message || '')) ||
      (resolved && resolved.ok === false && /checkpoint/i.test(resolved.errorClass || ''));
    expect(surfacedAsCheckpointFailure).toBe(true);
    // At most one further step beyond the step whose write failed.
    expect(mockChatTurn.mock.calls.length).toBeLessThanOrEqual(2);
  });

  test('A1.4: two concurrent delegations under different run IDs write only their own checkpoints (no cross-run leakage)', async () => {
    const { store } = newStore();
    const turns = { ALPHA: 0, BETA: 0 };
    mockChatTurn.mockImplementation(async (args) => {
      const head = (args.messages[0] && args.messages[0].content) || '';
      const which = head.includes('ALPHA') ? 'ALPHA' : 'BETA';
      turns[which]++;
      if (turns[which] === 1) {
        return { text: '', toolCalls: [{ id: `c-${which}`, toolName: 'fileRead', args: { path: `${which.toLowerCase()}.md` } }] };
      }
      return { text: `${which} DONE. [DEMO]`, toolCalls: [] };
    });
    const [ra, rb] = await Promise.all([
      generateWithTools({ systemPrompt: 's', context: 'ALPHA task: read alpha.md', maxTokens: 500, agentId: 'cmo', taskId: 1, runId: 'run-alpha', checkpointStore: store }),
      generateWithTools({ systemPrompt: 's', context: 'BETA task: read beta.md', maxTokens: 500, agentId: 'cto', taskId: 2, runId: 'run-beta', checkpointStore: store }),
    ]);
    expect(ra.response).toContain('ALPHA DONE');
    expect(rb.response).toContain('BETA DONE');
    const cpA = await store.loadCheckpoint('run-alpha');
    const cpB = await store.loadCheckpoint('run-beta');
    expect(JSON.stringify(cpA.messages)).toContain('alpha.md');
    expect(JSON.stringify(cpA.messages)).not.toContain('beta.md');
    expect(JSON.stringify(cpB.messages)).toContain('beta.md');
    expect(JSON.stringify(cpB.messages)).not.toContain('alpha.md');
  });

  test('A1.5: each checkpoint boundary corresponds to a single step — one LLM call or one tool batch (stepIndex sequence 1,2,3)', async () => {
    const { mod } = newStore();
    const inner = mod.createCheckpointStore(mod.createMemoryAdapter());
    const saves = [];
    const recordingStore = {
      ...inner,
      saveCheckpoint: async (runId, payload) => {
        saves.push(snap([payload])[0]);
        return inner.saveCheckpoint(runId, payload);
      },
    };
    let turn = 0;
    mockChatTurn.mockImplementation(async () => {
      turn++;
      if (turn === 1) return { text: '', toolCalls: [{ id: 'c1', toolName: 'fileRead', args: { path: 'draft.md' } }] };
      return { text: 'Finished. [DEMO]', toolCalls: [] };
    });
    await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Read then finish.',
      maxTokens: 500, agentId: 'cmo', taskId: 761,
      runId: 'run-a1-5', checkpointStore: recordingStore,
    });
    // LLM call 1 -> save 1; tool batch -> save 2; LLM call 2 (final) -> save 3.
    expect(saves.map(s => s.stepIndex)).toEqual([1, 2, 3]);
    // Each save extends the previous save's history — never rewrites it.
    for (let i = 1; i < saves.length; i++) {
      const prev = saves[i - 1].messages;
      const next = saves[i].messages;
      expect(next.length).toBeGreaterThanOrEqual(prev.length);
      expect(next.slice(0, prev.length)).toEqual(prev);
    }
    expect(saves[saves.length - 1].status).toBe('done');
  });
});
