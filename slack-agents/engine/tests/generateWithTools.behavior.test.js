/**
 * generateWithTools behavioral tests (Oct 12, 2026 — Vikunja #722)
 *
 * "Much better automated unit testing for the tool usage" (Jesse): these
 * tests drive the REAL generateWithTools loop with a scripted fake model
 * (litellm mocked) and prove the four behaviors that matter:
 *   1. A well-formed tool call actually EXECUTES and its result reaches the
 *      model's next round.
 *   2. The task #702 failure — model writes tool-call syntax as its final
 *      answer — executes nothing, and the auditor flags it.
 *   3. A malformed tool call (bad JSON) is recorded by the auditor the
 *      second it happens.
 *   4. Narration instead of tool use is flagged as a missed opportunity.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-behavior-test-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');
delete process.env.ANTHROPIC_API_KEY; // force the litellm route → mocked below

const mockChat = jest.fn();
jest.mock('../../utils/litellm', () => ({
  isConfigured: () => true,
  chat: (...args) => mockChat(...args),
}));

const { generateWithTools } = require('../../utils/anthropic');
const { SANDBOX } = require('../../utils/agentTools');
const auditor = require('../toolUsageAuditor');

const AUDIT_LOG = path.join(TMP, '.tool-usage-audit.jsonl');
function auditEntries() {
  if (!fs.existsSync(AUDIT_LOG)) return [];
  return fs.readFileSync(AUDIT_LOG, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

beforeEach(() => mockChat.mockReset());
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

function scriptModel(responses) {
  let i = 0;
  mockChat.mockImplementation(async () => responses[Math.min(i++, responses.length - 1)]);
}

describe('generateWithTools — real tool execution', () => {
  test('a well-formed [TOOL:] call executes and the result feeds the next round', async () => {
    const name = `behavior-${Date.now()}.txt`;
    const seenMessages = [];
    let call = 0;
    mockChat.mockImplementation(async ({ userMessage }) => {
      seenMessages.push(userMessage);
      call++;
      if (call === 1) return `[TOOL: fileWrite] {"path": "${name}", "content": "hello tools"}`;
      return `Wrote the file to the sandbox. [DEMO] task #1 artifact saved with 11 bytes.`;
    });

    const { response, toolResults, toolsUsed } = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Write a hello file.', maxTokens: 500,
    });

    expect(toolsUsed).toBe(1);
    expect(toolResults[0].tool).toBe('fileWrite');
    expect(toolResults[0].result.ok).toBe(true);
    // The artifact really exists on disk.
    const full = path.join(SANDBOX, name);
    expect(fs.existsSync(full)).toBe(true);
    expect(fs.readFileSync(full, 'utf8')).toBe('hello tools');
    // The tool result was fed back into the model's second round.
    expect(seenMessages[1]).toMatch(/Tool result/);
    expect(response).toMatch(/Wrote the file/);
    fs.unlinkSync(full);
  });

  test('urlCheck tool executes through the loop', async () => {
    scriptModel([
      '[TOOL: urlCheck] {"url": "https://www.google.com"}',
      'Checked: the URL is live (details in tool result). [DEMO]',
    ]);
    const { toolResults, toolsUsed } = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Check the URL.', maxTokens: 500,
    });
    expect(toolsUsed).toBe(1);
    expect(toolResults[0].tool).toBe('urlCheck');
    expect(toolResults[0].result.ok).toBe(true);
    expect(toolResults[0].result.httpCode).toBeGreaterThanOrEqual(200);
  });
});

describe('the failure modes Jesse ordered detected', () => {
  test('#702 pattern: tool-call syntax as the final answer executes NOTHING and is rejected as a deliverable', async () => {
    // Updated for #724 (Oct 12, 2026): the loop no longer RETURNS role-played
    // tool-call text for a downstream gate to catch — it rejects the attempt
    // in code (ok:false, invalid_deliverable). The auditor still flags the
    // raw model text as telemetry when handed it.
    const rawModelText = "[fileRead(path='/home/sandbox/reports'), fileList(path='/home/sandbox/reports')]";
    scriptModel([rawModelText]);
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Evaluate the PDFs in the reports folder.', maxTokens: 500,
    });
    expect(result.toolsUsed).toBe(0); // nothing executed — the call was just text
    expect(result.ok).toBe(false);
    expect(result.errorClass).toBe('invalid_deliverable');
    expect(result.response).toBeNull();
    // Phase 2: the auditor no longer flags this from prose at all — the
    // rejection above IS the enforcement now (see toolUsageAuditor.test.js).
    expect(rawModelText).toContain('fileRead');
  });

  test('malformed tool-call JSON is recorded by the auditor immediately', async () => {
    scriptModel([
      '[TOOL: fileWrite] {path: missing-quotes, content: x}',
      'Fallback final answer with a metric: 42 signups. [DEMO]',
    ]);
    const before = auditEntries().filter(e => e.type === 'MALFORMED_TOOL_CALL').length;
    const { toolsUsed } = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Write a file.', maxTokens: 500,
    });
    expect(toolsUsed).toBe(0); // the malformed call never executed
    const after = auditEntries().filter(e => e.type === 'MALFORMED_TOOL_CALL').length;
    expect(after).toBe(before + 1);
  });

  test('a failing tool call is recorded with its classification the second it happens', async () => {
    scriptModel([
      '[TOOL: fileRead] {"path": "../outside-the-sandbox.txt"}',
      'The read was blocked. Reporting honestly: no file content available.',
    ]);
    const before = auditEntries().filter(e => e.type === 'TOOL_FAILURE').length;
    const { toolResults, toolsUsed } = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Read a file.', maxTokens: 500,
    });
    expect(toolsUsed).toBe(1);
    expect(toolResults[0].result.ok).toBe(false);
    const failures = auditEntries().filter(e => e.type === 'TOOL_FAILURE');
    expect(failures.length).toBe(before + 1);
    expect(failures[failures.length - 1].errorClass).toBe('blocked_path');
  });

  test('narration instead of tool use: Phase 2 — no prose finding; the miss is receipt absence, known to completion', async () => {
    // Updated for #724 Phase 2: MISSED_OPPORTUNITY (a narration-regex
    // inference) is deleted. For uncontracted work the narration is still
    // returned on the legacy path; for contracted work the same output is
    // an invalid_deliverable / verification failure in code — see
    // workEngine-completion.behavior.test.js.
    scriptModel([
      "Let me check the project state to understand the files I need to evaluate, then I'll pull the details together.",
    ]);
    const { response, toolsUsed } = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Evaluate the report files.', maxTokens: 500,
    });
    expect(toolsUsed).toBe(0);
    expect(response).toMatch(/Let me check/);
    const { findings } = auditor.auditGeneration({
      agentId: 'execPM', taskId: 658, taskTitle: 'Evaluate the report files',
      via: 'generateWithTools', toolEvents: [], rawOutput: response, outputHasEvidence: false,
    });
    expect(findings.map(f => f.type)).not.toContain('MISSED_OPPORTUNITY');
  });

  test('unknown (hallucinated) tool names surface as unknown_tool failures', async () => {
    scriptModel([
      '[TOOL: webSearch] {"query": "test"}',
      'No results available.',
    ]);
    const { toolResults } = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Search the web.', maxTokens: 500,
    });
    expect(toolResults[0].result.ok).toBe(false);
    const failures = auditEntries().filter(e => e.type === 'TOOL_FAILURE' && e.errorClass === 'unknown_tool');
    expect(failures.length).toBeGreaterThanOrEqual(1);
  });
});
