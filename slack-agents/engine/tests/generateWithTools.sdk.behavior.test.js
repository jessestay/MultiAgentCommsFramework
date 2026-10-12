/**
 * Anthropic SDK native tool-calling tests (Phase 1 amendment, Vikunja #724).
 *
 * When a direct Anthropic API key is present, generateWithTools uses the
 * SDK's native tool_use channel (input_schema definitions, tool_result
 * blocks) — not text-protocol emulation.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-native-test-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');
process.env.ANTHROPIC_API_KEY = 'test-key-not-real'; // SDK route → mocked below

const mockSdkCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({
  messages: { create: (...args) => mockSdkCreate(...args) },
})));
jest.mock('../../utils/litellm', () => ({
  isConfigured: () => false,
  chat: jest.fn(),
  chatTurn: jest.fn(),
}));

const { generateWithTools } = require('../../utils/anthropic');
const { SANDBOX } = require('../../utils/agentTools');

beforeEach(() => mockSdkCreate.mockReset());
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

test('SDK route: tools sent as input_schema, tool_use blocks execute, tool_result blocks return', async () => {
  const name = `sdk-${Date.now()}.txt`;
  const seen = [];
  let call = 0;
  mockSdkCreate.mockImplementation(async (req) => {
    seen.push(req);
    call++;
    if (call === 1) {
      return { content: [{ type: 'tool_use', id: 'tu1', name: 'fileWrite', input: { path: name, content: 'sdk hello' } }] };
    }
    return { content: [{ type: 'text', text: 'Written via SDK native tools. [DEMO]' }] };
  });

  const result = await generateWithTools({
    systemPrompt: 'You are a test agent.', context: 'Write a hello file.',
    maxTokens: 500, agentId: 'cmo', taskId: 702,
  });

  expect(result.toolCallingMode).toBe('native');
  // Tools offered with input_schema (Anthropic's JSON Schema channel).
  const tools = seen[0].tools;
  expect(Array.isArray(tools)).toBe(true);
  const fw = tools.find(t => t.name === 'fileWrite');
  expect(fw).toBeDefined();
  expect(fw.input_schema.type).toBe('object');
  expect(fw.input_schema.required).toEqual(expect.arrayContaining(['path', 'content']));
  // Executed for real.
  expect(result.toolResults[0].result.ok).toBe(true);
  expect(fs.readFileSync(path.join(SANDBOX, name), 'utf8')).toBe('sdk hello');
  // Result returned as a tool_result block in a user message.
  const msgs = seen[1].messages;
  const userWithResult = msgs.find(m => m.role === 'user' && Array.isArray(m.content)
    && m.content.some(b => b.type === 'tool_result' && b.tool_use_id === 'tu1'));
  expect(userWithResult).toBeDefined();
  expect(result.response).toMatch(/SDK native tools/);
  fs.unlinkSync(path.join(SANDBOX, name));
});
