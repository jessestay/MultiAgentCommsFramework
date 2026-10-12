/**
 * Native tool-calling behavior tests (Phase 1 amendment, Vikunja #724).
 *
 * Amendment (Jesse, Oct 12 13:43 MDT): constrained decoding + native tool
 * calling. Where the route supports the provider's native tool_call channel,
 * generateWithTools MUST use it — tool definitions go out as JSON Schema and
 * calls come back on the structured channel, not as text to parse.
 *
 * Pins:
 *  (a) a generation through the native path cannot EXECUTE an out-of-schema
 *      tool call — gateway schema validation rejects it with a structured
 *      correction and the tool function never runs;
 *  (b) a route lacking native support (failover drops tools) is detected and
 *      flagged as text emulation, never silently emulated;
 *  (c) the production break of Oct 12: a final turn that role-plays tool
 *      calls in text ([TOOL: ...] + fabricated "[Tool result: ...]") is a
 *      failed attempt that re-enters the real loop — never a deliverable.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'native-test-'));
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

beforeEach(() => { mockChat.mockReset(); mockChatTurn.mockReset(); });
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('native tool calling is used when the route supports it', () => {
  test('tool definitions go out as JSON Schema; structured calls execute; results return as tool messages', async () => {
    const name = `native-${Date.now()}.txt`;
    const seenArgs = [];
    let turn = 0;
    mockChatTurn.mockImplementation(async (args) => {
      seenArgs.push(args);
      turn++;
      if (turn === 1) {
        return { text: '', toolCalls: [{ id: 'tc1', toolName: 'fileWrite', args: { path: name, content: 'native hello' } }] };
      }
      return { text: 'File written via the native channel. [DEMO]', toolCalls: [] };
    });

    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Write a hello file.',
      maxTokens: 500, agentId: 'cmo', taskId: 702,
    });

    expect(result.toolCallingMode).toBe('native');
    // Tools were offered as JSON Schema function definitions.
    const tools = seenArgs[0].tools;
    expect(Array.isArray(tools)).toBe(true);
    const fw = tools.find(t => t.function.name === 'fileWrite');
    expect(fw).toBeDefined();
    expect(fw.function.parameters.type).toBe('object');
    expect(fw.function.parameters.required).toEqual(expect.arrayContaining(['path', 'content']));
    const uc = tools.find(t => t.function.name === 'urlCheck');
    expect(uc.function.parameters.required).toEqual(['url']);
    // The call really executed.
    expect(result.toolResults[0].result.ok).toBe(true);
    expect(fs.readFileSync(path.join(SANDBOX, name), 'utf8')).toBe('native hello');
    // The result went back on the structured channel (tool-role message).
    const turn2Messages = seenArgs[1].messages;
    const toolMsg = turn2Messages.find(m => m.role === 'tool' && m.tool_call_id === 'tc1');
    expect(toolMsg).toBeDefined();
    expect(JSON.parse(toolMsg.content).ok).toBe(true);
    expect(result.response).toMatch(/native channel/);
    fs.unlinkSync(path.join(SANDBOX, name));
  });
});

describe('(a) an out-of-schema native tool call cannot execute', () => {
  test('missing required arg → structured correction on the tool channel, fn never runs, no file created', async () => {
    const name = `native-bad-${Date.now()}.txt`;
    const seenArgs = [];
    let turn = 0;
    mockChatTurn.mockImplementation(async (args) => {
      seenArgs.push(args);
      turn++;
      if (turn === 1) {
        // Out-of-schema: content missing.
        return { text: '', toolCalls: [{ id: 'bad1', toolName: 'fileWrite', args: { path: name } }] };
      }
      if (turn === 2) {
        return { text: '', toolCalls: [{ id: 'good1', toolName: 'fileWrite', args: { path: name, content: 'fixed' } }] };
      }
      return { text: 'Recovered and wrote the file. [DEMO]', toolCalls: [] };
    });

    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Write a file.',
      maxTokens: 500, agentId: 'cmo', taskId: 702,
    });

    // The invalid call was rejected by validation — nothing was written by it.
    expect(result.toolResults[0].result.ok).toBe(false);
    expect(result.toolResults[0].result.errorClass).toBe('invalid_input');
    expect(result.toolResults[0].result.correction.missing).toEqual(['content']);
    // Correction returned on the structured tool channel for the model to act on.
    const toolMsg = seenArgs[1].messages.find(m => m.role === 'tool' && m.tool_call_id === 'bad1');
    expect(toolMsg).toBeDefined();
    const payload = JSON.parse(toolMsg.content);
    expect(payload.errorClass).toBe('invalid_input');
    expect(payload.correction.missing).toEqual(['content']);
    // The corrected call executed.
    expect(result.toolResults[1].result.ok).toBe(true);
    expect(fs.readFileSync(path.join(SANDBOX, name), 'utf8')).toBe('fixed');
    fs.unlinkSync(path.join(SANDBOX, name));
  });
});

describe('(b) a route lacking native support is detected and flagged', () => {
  test('toolsDropped from the route → text-emulation mode, flagged in state', async () => {
    mockChatTurn.mockResolvedValue({ text: '', toolCalls: [], toolsDropped: true });
    mockChat.mockResolvedValue('Fallback answer written in plain prose for the task at hand today.');
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Answer in prose.', maxTokens: 300,
    });
    expect(result.toolCallingMode).toBe('text-emulation');
    expect(state.get('toolRoutes', 'lastMode')).toBe('text-emulation');
    expect(result.response).toMatch(/Fallback answer/);
  });
});

describe('(c) role-played tool calls in a final turn are never a deliverable', () => {
  test('role-play text re-enters the real loop; the real call then executes', async () => {
    const name = `roleplay-${Date.now()}.txt`;
    let turn = 0;
    mockChatTurn.mockImplementation(async () => {
      turn++;
      if (turn === 1) {
        // The exact Oct 12 production failure (task #235): the model writes
        // the call AND a fabricated result as prose.
        return { text: '[TOOL: fileList] {"arg": ""}\n[Tool result: {"ok": true, "entries": []}]\nAll done.', toolCalls: [] };
      }
      if (turn === 2) {
        return { text: '', toolCalls: [{ id: 'real1', toolName: 'fileWrite', args: { path: name, content: 'real artifact' } }] };
      }
      return { text: 'Wrote the real artifact this time. [DEMO]', toolCalls: [] };
    });

    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'List files, then write one.',
      maxTokens: 500, agentId: 'execPM', taskId: 235,
    });

    expect(result.ok).not.toBe(false);
    expect(result.response).toMatch(/real artifact this time/);
    expect(result.toolResults.length).toBe(1);
    expect(result.toolResults[0].result.ok).toBe(true);
    expect(fs.readFileSync(path.join(SANDBOX, name), 'utf8')).toBe('real artifact');
    fs.unlinkSync(path.join(SANDBOX, name));
  });

  test('persistent role-play → failed attempt (invalid_deliverable), nothing returned as a deliverable', async () => {
    mockChatTurn.mockResolvedValue({
      text: '[fileRead(path="reports/x.md"), fileList(path="reports")]',
      toolCalls: [],
    });
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Evaluate the report files.',
      maxTokens: 300, maxToolRounds: 4, agentId: 'cmo', taskId: 702,
    });
    expect(result.ok).toBe(false);
    expect(result.errorClass).toBe('invalid_deliverable');
    expect(result.toolsUsed).toBe(0);
  });
});
