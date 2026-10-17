// kernel-p1-gate.test.js — #807 Phase 1 QUALITY GATE (US-P1.3).
//
// A delegation whose final answer came from the LOCAL route (macf-local /
// macf-cheap — the small desktop Ollama models) may only finalize when it
// did verifiable work: at least one executed tool call (receipted), or a
// schema-valid typed deliverable. A local text-only answer with tools on
// offer returns no_result (never a completion) so the work requeues for a
// full-strength route instead of being stamped done on a 4B model's say-so.
// Non-local routes are unaffected: a paid text-only answer still completes.
//
// Harness mirrors generateWithTools.native.behavior.test.js (litellm mocked).

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'p1-gate-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');
delete process.env.ANTHROPIC_API_KEY;

const mockChat = jest.fn();
const mockChatTurn = jest.fn();
jest.mock('../../utils/litellm', () => ({
  isConfigured: () => true,
  chat: (...args) => mockChat(...args),
  chatTurn: (...args) => mockChatTurn(...args),
}));

const { generateWithTools } = require('../../utils/anthropic');
const { SANDBOX } = require('../../utils/agentTools');

beforeEach(() => { mockChat.mockReset(); mockChatTurn.mockReset(); });
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('#807 Phase 1 quality gate (US-P1.3)', () => {
  test('local route + text-only answer + tools offered -> no_result, never done', async () => {
    mockChatTurn.mockImplementation(async () => ({ text: 'Here is my summary, trust me.', toolCalls: [], route: 'macf-local' }));
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Write a summary file.',
      maxTokens: 500, agentId: 'cmo', taskId: 807,
    });
    expect(result.ok).toBe(false);
    expect(result.errorClass).toBe('no_result');
    expect(result.response).toBeNull();
    expect(result.localRoute).toBe(true);
  });

  test('local route + executed tool call + final text -> done, stamped localRoute', async () => {
    const name = `p1-gate-${Date.now()}.txt`;
    let turn = 0;
    mockChatTurn.mockImplementation(async () => {
      turn++;
      if (turn === 1) {
        return { text: '', toolCalls: [{ id: 'g1', toolName: 'fileWrite', args: { path: name, content: 'written by local route' } }], route: 'macf-local' };
      }
      return { text: 'File written. [DEMO]', toolCalls: [], route: 'macf-local' };
    });
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Write the file.',
      maxTokens: 500, agentId: 'cmo', taskId: 807,
    });
    expect(result.response).toMatch(/File written/);
    expect(result.localRoute).toBe(true);
    expect(result.toolResults[0].result.ok).toBe(true);
    expect(fs.readFileSync(path.join(SANDBOX, name), 'utf8')).toBe('written by local route');
    fs.unlinkSync(path.join(SANDBOX, name));
  });

  test('paid route + text-only answer -> still completes (no regression)', async () => {
    mockChatTurn.mockImplementation(async () => ({ text: 'A perfectly good text answer.', toolCalls: [], route: 'macf-smart-paid' }));
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Answer in text.',
      maxTokens: 500, agentId: 'cmo', taskId: 807,
    });
    expect(result.response).toMatch(/perfectly good/);
    expect(result.localRoute).toBeFalsy();
  });
});
