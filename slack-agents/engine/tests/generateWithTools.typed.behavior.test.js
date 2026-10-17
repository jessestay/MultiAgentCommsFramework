/**
 * Typed-deliverable behavior tests (Phase 2, Vikunja #724) — US-105.
 *
 * Design: docs/code-enforced-tool-use-design.md, Pillar 3.
 * For a contracted task, the final generation must be a schema-valid JSON
 * deliverable. Text output — including the original #702 tool-syntax
 * answer — is a failed attempt (invalid_deliverable) with field-level
 * validationErrors, repaired once in-loop, never pattern-matched into a pass.
 * Also pins generateStructured (Amendment A, Layer 3): the typed model seam
 * Phase 3 executors call.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'typed-test-'));
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

const { generateWithTools, generateStructured } = require('../../utils/anthropic');
const { getSchema } = require('../../engine/deliverableSchemas');
const { SANDBOX } = require('../../utils/agentTools');

const SCHEMA = getSchema('research-report@v1');
const GOOD_JSON = JSON.stringify({
  status: 'produced',
  summary: 'Wrote the pricing scan report.',
  artifactRefs: ['reports/typed-scan.md'],
  findings: [{ url: 'https://example.com/pricing', observation: 'Unchanged.' }],
});

function scriptChat(responses) {
  const seen = [];
  let i = 0;
  mockChat.mockImplementation(async ({ userMessage }) => {
    seen.push(userMessage);
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return r;
  });
  return seen;
}

beforeEach(() => { mockChat.mockReset(); mockChatTurn.mockReset(); mockChatTurn.mockRejectedValue(new Error('tools not supported by this route')); });
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('US-105 — contracted generation accepts only schema-valid JSON', () => {
  test('tool work then a valid JSON deliverable → deliverable returned, response is its summary', async () => {
    const name = `typed-scan-${Date.now()}.md`;
    scriptChat([
      `[TOOL: fileWrite] {"path": "${name}", "content": "scan body"}`,
      GOOD_JSON.replace('reports/typed-scan.md', name),
    ]);
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Scan pricing and write the report.',
      maxTokens: 800, agentId: 'cmo', taskId: 702, outputSchema: SCHEMA, schemaName: 'research-report@v1',
    });
    expect(result.ok).not.toBe(false);
    expect(result.deliverable).toBeDefined();
    expect(result.deliverable.status).toBe('produced');
    expect(result.deliverable.artifactRefs).toEqual([name]);
    expect(result.response).toBe('Wrote the pricing scan report.');
    expect(fs.existsSync(path.join(SANDBOX, name))).toBe(true);
    fs.unlinkSync(path.join(SANDBOX, name));
  });

  test('the original #702 output (tool syntax as text) is invalid_deliverable, with a repair round first', async () => {
    const seen = scriptChat([
      "[fileRead(path='reports/x.md'), fileList(path='reports')]",
      GOOD_JSON,
    ]);
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Evaluate the report files.',
      maxTokens: 800, agentId: 'cmo', taskId: 702, outputSchema: SCHEMA, schemaName: 'research-report@v1',
    });
    // Repair round consumed the validation feedback, then valid JSON passed.
    expect(result.ok).not.toBe(false);
    expect(result.deliverable).toBeDefined();
    expect(seen[1]).toMatch(/validationErrors/);
  });

  test('persistent text output → failed attempt with validationErrors', async () => {
    scriptChat(['All done! The report is complete and verified. [DEMO]']);
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Write the report.',
      maxTokens: 800, agentId: 'cmo', taskId: 702, outputSchema: SCHEMA, schemaName: 'research-report@v1',
    });
    expect(result.ok).toBe(false);
    expect(result.errorClass).toBe('invalid_deliverable');
    expect(Array.isArray(result.validationErrors)).toBe(true);
    expect(result.validationErrors.length).toBeGreaterThanOrEqual(1);
    expect(result.response).toBeNull();
  });

  test('schema-invalid JSON → validationErrors name the fields', async () => {
    scriptChat([JSON.stringify({ status: 'produced', artifactRefs: [], findings: [] })]); // summary missing
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Write the report.',
      maxTokens: 800, agentId: 'cmo', taskId: 702, outputSchema: SCHEMA, schemaName: 'research-report@v1',
    });
    expect(result.ok).toBe(false);
    expect(result.errorClass).toBe('invalid_deliverable');
    expect(result.validationErrors.map(e => e.path)).toContain('summary');
  });
});

describe('generateStructured — the typed model seam (Amendment A, Layer 3)', () => {
  test('returns the parsed value when the model output validates', async () => {
    mockChatTurn.mockResolvedValue({ text: GOOD_JSON, toolCalls: [] });
    const out = await generateStructured({
      systemPrompt: 'Summarize.', input: 'data', outputSchema: SCHEMA, schemaName: 'research-report@v1',
    });
    expect(out.ok).toBe(true);
    expect(out.value.status).toBe('produced');
  });

  test('one correction round on invalid output, then invalid_deliverable', async () => {
    mockChatTurn.mockResolvedValue({ text: 'not json at all', toolCalls: [] });
    const out = await generateStructured({
      systemPrompt: 'Summarize.', input: 'data', outputSchema: SCHEMA, schemaName: 'research-report@v1',
    });
    expect(out.ok).toBe(false);
    expect(out.errorClass).toBe('invalid_deliverable');
    expect(out.validationErrors.length).toBeGreaterThanOrEqual(1);
    expect(mockChatTurn.mock.calls.length).toBe(2); // initial + one correction
  });
});
