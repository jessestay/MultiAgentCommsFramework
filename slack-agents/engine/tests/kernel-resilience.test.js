// kernel-resilience.test.js — Oct 15, 2026 (Jesse's order: "How do we keep
// the whole attempt from dying if any step comes back empty?").
//
// Mechanisms 2 + 3 of 3 (mechanism 1, litellm chain rotation, lives in
// kernel-resilience-litellm.test.js because it needs the real litellm):
//  2. generateWithTools treats an empty/failed step as a retryable STEP
//     failure (backoff + preserved progress), not a dead delegation.
//  3. directivePoll dead-letters AUTO-REQUEUE after a cooldown — no human
//     re-issue required — up to MAX_REQUEUES, then stay dead.

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-resilience-'));
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');
process.env.MACF_STEP_BACKOFF_MS = '1';
delete process.env.ANTHROPIC_API_KEY;

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

// ─── 2. generateWithTools step resilience ───────────────────────────────────

const mockChatTurn = jest.fn();
jest.mock('../../utils/litellm', () => ({
  isConfigured: () => true,
  chat: jest.fn(),
  chatTurn: (...args) => mockChatTurn(...args),
}));

describe('generateWithTools step resilience', () => {
  const { generateWithTools } = require('../../utils/anthropic');
  beforeEach(() => {
    mockChatTurn.mockReset();
    process.env.MACF_STEP_BACKOFF_MS = '1';
    process.env.MACF_STEP_DEADLINE_MS = '30000';
  });

  test('two chain-exhausted step failures then success -> delegation completes', async () => {
    let n = 0;
    mockChatTurn.mockImplementation(async () => {
      n++;
      if (n <= 2) throw new Error("litellm: all models failed for 'smart': 6 empty response(s), no transport errors");
      return { text: 'Finished the work. [DEMO]', toolCalls: [] };
    });
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Do the thing.',
      maxTokens: 500, agentId: 'cmo', taskId: 999,
    });
    expect(result.response).toContain('Finished the work');
    expect(n).toBe(3);
  });

  test('empty turns are retried as steps, not burned as rounds', async () => {
    let n = 0;
    mockChatTurn.mockImplementation(async () => {
      n++;
      if (n <= 3) return { text: '', toolCalls: [] };
      return { text: 'Recovered after empties.', toolCalls: [] };
    });
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Do the thing.',
      maxTokens: 500, agentId: 'cmo', taskId: 999,
    });
    expect(result.response).toContain('Recovered after empties');
    expect(n).toBe(4);
  });

  test('persistent failure still dies — but only after retrying past the old single-shot behavior', async () => {
    process.env.MACF_STEP_DEADLINE_MS = '60';
    mockChatTurn.mockImplementation(async () => {
      throw new Error("litellm: all models failed for 'smart': 6 empty response(s), no transport errors");
    });
    await expect(generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Do the thing.',
      maxTokens: 500, agentId: 'cmo', taskId: 999,
    })).rejects.toThrow(/all models failed/);
    expect(mockChatTurn.mock.calls.length).toBeGreaterThan(1);
  });
});

// ─── 3. directivePoll dead-letter auto-requeue ──────────────────────────────

jest.mock('../../agents/cto.js', () => ({
  handleDelegation: async () => ({ response: 'ok' }),
  init: jest.fn(),
}), { virtual: false });

describe('directivePoll dead-letter auto-requeue', () => {
  const poller = require('../directivePoll');
  const item = (over = {}) => ({
    channel: 'C0ASH4TF604',
    m: { ts: '1792116643.316999' },
    text: '[from: CEO → CTO] Do the full thing, this text is longer than two hundred characters so the legacy 200-char truncation would lose the actual instruction body and that is exactly what fullText exists to prevent.',
    msgTs: 1792116643.316999,
    agentId: 'cto',
    ...over,
  });
  const noHealth = () => {};

  function deadLetteredState() {
    const state = {};
    // Failures 1-3 queue retries; the 4th dead-letters (retries >= 3).
    for (let i = 0; i < 4; i++) poller.recordRetryFailure(state, item(), 'no_result', noHealth);
    return state;
  }

  test('dead-letter stores fullText, requeueAt ~30min out, and requeues=0', () => {
    const state = deadLetteredState();
    expect(state._deadLetter).toHaveLength(1);
    const e = state._deadLetter[0];
    expect(e.fullText).toContain('fullText exists to prevent');
    expect(e.requeues).toBe(0);
    const delta = Date.parse(e.requeueAt) - Date.now();
    expect(delta).toBeGreaterThan(25 * 60 * 1000);
    expect(delta).toBeLessThan(35 * 60 * 1000);
  });

  test('drain before cooldown leaves the entry in place', () => {
    const state = deadLetteredState();
    const pending = [];
    const n = poller.drainDeadLetterRequeues(state, null, pending, Date.now());
    expect(n).toBe(0);
    expect(state._deadLetter).toHaveLength(1);
    expect(pending).toHaveLength(0);
  });

  test('drain after cooldown resurrects with a fresh budget and requeues=1', () => {
    const state = deadLetteredState();
    state._retries = { 'C0ASH4TF604:1792116643.316999': 3 };
    const pending = [];
    const later = Date.now() + 31 * 60 * 1000;
    const n = poller.drainDeadLetterRequeues(state, null, pending, later);
    expect(n).toBe(1);
    expect(state._deadLetter).toHaveLength(0);
    expect(state._retries['C0ASH4TF604:1792116643.316999']).toBeUndefined();
    expect(pending).toHaveLength(1);
    expect(pending[0].requeues).toBe(1);
    expect(pending[0].text).toContain('fullText exists to prevent');
  });

  test('an entry at MAX_REQUEUES stays dead and is marked final', () => {
    const state = {
      _deadLetter: [{
        channel: 'C0ASH4TF604', ts: '1792116643.316999', agentId: 'cto',
        fullText: 'x', msgTs: 1792116643.316999,
        requeues: poller.MAX_REQUEUES, requeueAt: new Date(Date.now() - 1000).toISOString(),
      }],
    };
    const pending = [];
    const n = poller.drainDeadLetterRequeues(state, null, pending, Date.now());
    expect(n).toBe(0);
    expect(pending).toHaveLength(0);
    expect(state._deadLetter).toHaveLength(1);
    expect(state._deadLetter[0].finalLogged).toBe(true);
  });
});
