// kernel-p2-harness.test.js — #807 Phase 2 harness fix (US-P2.4).
//
// The #807 audit found the harness itself teaching assessment-over-action:
// the CTO's delegation prompt literally asked for "a clear technical
// assessment", and generateWithTools defaulted to 3 tool rounds / tight
// budgets so real multi-step work died mid-exploration and partial text
// finalized. Pins: (1) execution framing is injected into every
// generateWithTools system prompt; (2) the default round budget allows
// real multi-step work; (3) the CTO handler no longer asks for assessments.

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-harness-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
delete process.env.ANTHROPIC_API_KEY;

const mockChat = jest.fn();
const mockChatTurn = jest.fn();
jest.mock('../../utils/litellm', () => ({
  isConfigured: () => true,
  chat: (...args) => mockChat(...args),
  chatTurn: (...args) => mockChatTurn(...args),
}));

// #807 US-P2.5 interplay: generateWithTools now discovers the agent's
// granted MCP servers live. Mock the client so this suite never spawns
// real servers (without the mock, a cto run pays real discovery latency
// and the suite flakes under combined runs).
jest.mock('../../engine/mcpClient', () => ({
  listTools: async () => [],
  invokeTool: async () => ({ content: [] }),
  closeAll: async () => {},
}));

const { generateWithTools } = require('../../utils/anthropic');
const { SANDBOX } = require('../../utils/agentTools');

beforeEach(() => { mockChat.mockReset(); mockChatTurn.mockReset(); });
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('US-P2.4 — harness execution framing + budgets', () => {
  test('execution requirement is injected into the system prompt', async () => {
    const seen = [];
    mockChatTurn.mockImplementation(async (args) => {
      seen.push(args);
      return { text: 'Done. [DEMO]', toolCalls: [] };
    });
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Do the thing.',
      maxTokens: 500, agentId: 'cto', taskId: 807,
    });
    expect(result.response).toMatch(/Done/);
    expect(seen[0].systemPrompt).toContain('EXECUTION REQUIREMENT');
  });

  test('default round budget allows 5 tool steps before the final answer', async () => {
    const name = `p2-harness-${Date.now()}.txt`;
    let turn = 0;
    mockChatTurn.mockImplementation(async () => {
      turn++;
      if (turn <= 5) {
        return { text: '', toolCalls: [{ id: `h${turn}`, toolName: 'fileWrite', args: { path: name, content: `step ${turn}` } }] };
      }
      return { text: 'All steps done. [DEMO]', toolCalls: [] };
    });
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Do five steps.',
      maxTokens: 500, agentId: 'cto', taskId: 807,
    });
    expect(result.response).toMatch(/All steps done/);
    expect(result.toolsUsed).toBe(5);
    fs.unlinkSync(path.join(SANDBOX, name));
  });

  test('cto handler asks for execution + evidence, not an assessment', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'agents', 'cto.js'), 'utf8');
    expect(src).not.toContain('Provide a clear technical assessment');
    expect(src).toContain('Execute');
  });
});
