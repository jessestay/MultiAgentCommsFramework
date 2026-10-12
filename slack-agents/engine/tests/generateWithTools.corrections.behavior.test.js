/**
 * Correction-consumption behavior tests (Phase 1, Vikunja #724) — US-106.
 *
 * When the native tool channel is unavailable, generateWithTools degrades to
 * the text protocol — explicitly flagged as text emulation, never silent.
 * In that mode the loop must consume executeTool's structured corrections
 * programmatically: the correction object (not prose) is fed to the next
 * round, and repeating the identical violation short-circuits the attempt.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'corrections-test-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');
delete process.env.ANTHROPIC_API_KEY; // litellm route → mocked below

const mockChat = jest.fn();
const mockChatTurn = jest.fn();
jest.mock('../../utils/litellm', () => ({
  isConfigured: () => true,
  chat: (...args) => mockChat(...args),
  chatTurn: (...args) => mockChatTurn(...args),
}));

const { generateWithTools } = require('../../utils/anthropic');
const { SANDBOX } = require('../../utils/agentTools');
const state = require('../../utils/state');

beforeEach(() => {
  mockChat.mockReset();
  mockChatTurn.mockReset();
  // Native channel refuses tools → the loop must fall back, flagged.
  mockChatTurn.mockRejectedValue(new Error('tools not supported by this route'));
});
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('text-emulation fallback is explicit, never silent', () => {
  test('route without native support is detected and flagged', async () => {
    mockChat.mockResolvedValue('Plain final answer about pricing pages and their status today.');
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Summarize pricing.', maxTokens: 300,
    });
    expect(result.toolCallingMode).toBe('text-emulation');
    expect(state.get('toolRoutes', 'lastMode')).toBe('text-emulation');
  });
});

describe('US-106 — the loop consumes corrections programmatically', () => {
  test('invalid call → correction object reaches round 2 → valid call executes', async () => {
    const name = `corr-${Date.now()}.txt`;
    const seen = [];
    let call = 0;
    mockChat.mockImplementation(async ({ userMessage }) => {
      seen.push(userMessage);
      call++;
      if (call === 1) return '[TOOL: urlCheck] {"arg": "https://example.com"}';
      if (call === 2) return `[TOOL: fileWrite] {"path": "${name}", "content": "corrected"}`;
      return 'Wrote the artifact after fixing the call. [DEMO]';
    });

    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Check a URL, then write a file.',
      maxTokens: 500, agentId: 'cmo', taskId: 702,
    });

    expect(result.ok).not.toBe(false);
    // Round 1's result carries the structured correction.
    expect(result.toolResults[0].result.errorClass).toBe('invalid_input');
    expect(result.toolResults[0].result.correction.missing).toEqual(['url']);
    // The correction OBJECT was appended to round 2's context.
    expect(seen[1]).toMatch(/"correction"/);
    expect(seen[1]).toMatch(/"missing":\["url"\]/);
    // Round 2's valid call really executed.
    expect(result.toolResults[1].result.ok).toBe(true);
    expect(fs.readFileSync(path.join(SANDBOX, name), 'utf8')).toBe('corrected');
    fs.unlinkSync(path.join(SANDBOX, name));
    // Receipts carry the agent/task context threaded through the loop.
    const receipts = fs.readFileSync(process.env.MACF_RECEIPTS_FILE, 'utf8')
      .split('\n').filter(Boolean).map(l => JSON.parse(l))
      .filter(r => r.taskId === 702);
    expect(receipts.length).toBeGreaterThanOrEqual(2);
    expect(receipts[0].errorClass).toBe('invalid_input');
  });

  test('repeating the identical violation short-circuits to a failed attempt', async () => {
    mockChat.mockResolvedValue('[TOOL: urlCheck] {"arg": "https://example.com"}');
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Check a URL.',
      maxTokens: 300, maxToolRounds: 5, agentId: 'cmo', taskId: 703,
    });
    expect(result.ok).toBe(false);
    expect(result.errorClass).toBe('invalid_input');
    // Short-circuit: far fewer model calls than the round budget allows.
    expect(mockChat.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
