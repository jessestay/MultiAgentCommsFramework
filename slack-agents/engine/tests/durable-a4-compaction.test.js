// durable-a4-compaction.test.js — Phase A, US-A4 (Vikunja #789).
//
// TDD RED PHASE (Oct 16, 2026): written from the acceptance criteria BEFORE
// the implementation. Contract:
//
//   * NEW MODULE utils/historyCompaction.js exporting
//       compactHistory(messages, { thresholdChars = 600, stubChars = 200 } = {})
//         -> { messages, compacted, stubbedCount }
//     Rules (mirroring the semantics the Oct 15 step-retry compaction
//     established in generateWithTools):
//       - a 'tool' message that is NOT the most recent tool message and
//         whose content exceeds thresholdChars is replaced by a stub:
//         its first stubChars characters plus a compaction marker;
//       - the most recent tool result is always preserved in full;
//       - non-tool messages are never altered;
//       - the input array is never mutated;
//       - when nothing exceeds the threshold, the output messages are
//         identical to the input and compacted === false.
//   * The checkpoint store compacts with these rules before storing: a
//     saved checkpoint of an over-threshold history holds stubs for old
//     tool results and the latest tool result in full (US-A4.1); a
//     below-threshold history is stored identically (US-A4.3).
//
// jest notes (AGENTS.md): jest.mock is file-wide — litellm and agentTools
// are mocked for the A4.2 resume test.

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-durable-a4-'));
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
const snap = (msgs) => JSON.parse(JSON.stringify(msgs));

function newStore() {
  const mod = impl('../../utils/checkpointStore');
  return { mod, store: mod.createCheckpointStore(mod.createMemoryAdapter()) };
}

const BIG = 'L'.repeat(5000);
const BIG2 = 'M'.repeat(4000);
const LATEST = 'N'.repeat(3000);
function bigHistory() {
  return [
    { role: 'user', content: 'Task: read three files and summarize.' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'fileRead', arguments: '{"path":"a.md"}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: BIG },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c2', type: 'function', function: { name: 'fileRead', arguments: '{"path":"b.md"}' } }] },
    { role: 'tool', tool_call_id: 'c2', content: BIG2 },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c3', type: 'function', function: { name: 'fileRead', arguments: '{"path":"c.md"}' } }] },
    { role: 'tool', tool_call_id: 'c3', content: LATEST },
  ];
}

beforeEach(() => {
  mockChatTurn.mockReset();
  mockExecuteTool.mockReset();
  mockExecuteTool.mockImplementation(async (toolName, args) => ({ ok: true, tool: toolName, content: 'x' }));
  process.env.MACF_STEP_BACKOFF_MS = '1';
  process.env.MACF_STEP_DEADLINE_MS = '30000';
});

// ─── TDD unit: compaction function ──────────────────────────────────────────

describe('compaction function — threshold + latest-result preservation (TDD)', () => {
  test('old tool results over the threshold are stubbed; the most recent is stored in full', () => {
    const { compactHistory } = impl('../../utils/historyCompaction');
    const input = bigHistory();
    const out = compactHistory(input, { thresholdChars: 600, stubChars: 200 });
    expect(out.compacted).toBe(true);
    expect(out.stubbedCount).toBe(2);
    const tools = out.messages.filter(m => m.role === 'tool');
    expect(tools[0].content.length).toBeLessThan(300);
    expect(tools[0].content).toContain(BIG.slice(0, 200));
    expect(tools[0].content).toMatch(/compact/i);
    expect(tools[1].content.length).toBeLessThan(300);
    // Most recent tool result preserved byte-for-byte.
    expect(tools[2].content).toBe(LATEST);
    // Non-tool messages untouched, sequence shape preserved.
    expect(out.messages).toHaveLength(input.length);
    expect(out.messages[0]).toEqual(input[0]);
    expect(out.messages[1]).toEqual(input[1]);
    // Input never mutated.
    expect(input[2].content).toBe(BIG);
    expect(input[4].content).toBe(BIG2);
  });

  test('a tool result exactly at the threshold is not stubbed; one char over is', () => {
    const { compactHistory } = impl('../../utils/historyCompaction');
    const atThreshold = [
      { role: 'user', content: 'Task: x' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'fileRead', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'E'.repeat(600) },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c2', type: 'function', function: { name: 'fileRead', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c2', content: 'latest' },
    ];
    expect(compactHistory(atThreshold, { thresholdChars: 600, stubChars: 200 }).compacted).toBe(false);
    const overThreshold = snap(atThreshold);
    overThreshold[2].content = 'E'.repeat(601);
    expect(compactHistory(overThreshold, { thresholdChars: 600, stubChars: 200 }).compacted).toBe(true);
  });

  test('below the threshold the output is identical to the input (no premature compaction)', () => {
    const { compactHistory } = impl('../../utils/historyCompaction');
    const small = [
      { role: 'user', content: 'Task: small' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'fileRead', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'short result' },
      { role: 'assistant', content: 'Working on it.' },
    ];
    const out = compactHistory(small, { thresholdChars: 600, stubChars: 200 });
    expect(out.compacted).toBe(false);
    expect(out.stubbedCount).toBe(0);
    expect(out.messages).toEqual(small);
  });
});

// ─── BDD: US-A4 — long histories are compacted before checkpointing ─────────

describe('US-A4 — long histories are compacted before checkpointing', () => {
  test('A4.1: when a checkpoint of an over-threshold history is written, old tool results are stored as stubs and the most recent in full', async () => {
    const { store } = newStore();
    await store.saveCheckpoint('run-a4-1', { messages: bigHistory(), stepIndex: 5, status: 'running' });
    const cp = await store.loadCheckpoint('run-a4-1');
    const tools = cp.messages.filter(m => m.role === 'tool');
    expect(tools).toHaveLength(3);
    expect(tools[0].content.length).toBeLessThan(300);
    expect(tools[1].content.length).toBeLessThan(300);
    expect(tools[2].content).toBe(LATEST);
    // The stored checkpoint is dramatically smaller than the live history.
    expect(JSON.stringify(cp.messages).length).toBeLessThan(JSON.stringify(bigHistory()).length / 2);
  });

  test('A4.2: a fresh attempt resumes from a compacted checkpoint — the history is valid and the task completes', async () => {
    const { mod, store } = newStore();
    await store.saveCheckpoint('run-a4-2', { messages: bigHistory(), stepIndex: 5, status: 'running' });
    let firstMessages = null;
    mockChatTurn.mockImplementation(async (args) => {
      if (!firstMessages) firstMessages = snap(args.messages);
      return { text: 'Summarized all three files. [DEMO]', toolCalls: [] };
    });
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'read three files and summarize.',
      maxTokens: 500, agentId: 'cmo', taskId: 761,
      runId: 'run-a4-2', checkpointStore: store,
    });
    expect(result.response).toContain('Summarized all three files');
    // The resumed conversation is a well-formed message sequence.
    expect(mod.validateHistory(firstMessages).valid).toBe(true);
    // It resumed the checkpointed (compacted) history, not a clean start.
    expect(firstMessages.length).toBeGreaterThan(1);
    expect(JSON.stringify(firstMessages)).toContain(LATEST.slice(0, 100));
  });

  test('A4.3: when a checkpoint of a below-threshold history is written, the stored messages are identical to the live messages', async () => {
    const { store } = newStore();
    const small = [
      { role: 'user', content: 'Task: small job' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'fileRead', arguments: '{"path":"a.md"}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '{"ok":true,"content":"tiny"}' },
      { role: 'assistant', content: 'Noted.' },
    ];
    await store.saveCheckpoint('run-a4-3', { messages: small, stepIndex: 2, status: 'running' });
    const cp = await store.loadCheckpoint('run-a4-3');
    expect(cp.messages).toEqual(small);
  });
});
