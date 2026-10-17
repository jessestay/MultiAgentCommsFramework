/**
 * Gateway argument-schema validation tests (Phase 1, Vikunja #724) — US-106.
 *
 * Design: docs/code-enforced-tool-use-design.md, Pillar 4.
 * executeTool validates arguments against a per-tool argsSchema BEFORE
 * dispatch. Violations return a structured, machine-readable correction —
 * the tool function is never invoked. (Live incident, Oct 12: urlCheck
 * called with {"arg": ...} instead of {"url": ...} failed downstream with
 * a generic error; now the correction is mechanical.)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-test-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');

const { executeTool, TOOLS, SANDBOX } = require('../../utils/agentTools');

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('US-106 — structured corrections, tool never invoked', () => {
  test('urlCheck with {"arg"} (the live Oct 12 incident): correction names missing + unknown, fn not invoked', () => {
    const original = TOOLS.urlCheck.fn;
    const spy = jest.fn(() => ({ ok: true }));
    TOOLS.urlCheck.fn = spy;
    try {
      const result = executeTool('urlCheck', { arg: 'https://example.com' }, { agentId: 'cmo', taskId: 702 });
      expect(result.ok).toBe(false);
      expect(result.errorClass).toBe('invalid_input');
      expect(result.correction).toBeDefined();
      expect(result.correction.missing).toEqual(['url']);
      expect(result.correction.unknown).toEqual(['arg']);
      expect(result.correction.received).toEqual(['arg']);
      expect(result.correction.expected.url).toMatch(/string/);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      TOOLS.urlCheck.fn = original;
    }
  });

  test('fileWrite missing required content: correction names it, nothing written', () => {
    const name = `schema-missing-${Date.now()}.txt`;
    const result = executeTool('fileWrite', { path: name }, { agentId: 'cmo', taskId: 1 });
    expect(result.ok).toBe(false);
    expect(result.errorClass).toBe('invalid_input');
    expect(result.correction.missing).toEqual(['content']);
    expect(fs.existsSync(path.join(SANDBOX, name))).toBe(false);
  });

  test('wrong argument type is a validation failure, not a dispatch', () => {
    const result = executeTool('fileWrite', { path: 42, content: 'x' }, { agentId: 'cmo', taskId: 1 });
    expect(result.ok).toBe(false);
    expect(result.errorClass).toBe('invalid_input');
    expect(result.correction).toBeDefined();
  });

  test('malformed URL is rejected by validation (existing error contract preserved)', () => {
    const result = executeTool('urlCheck', { url: 'not-a-url' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid URL');
  });

  test('optional args may be omitted (fileList with no path dispatches)', () => {
    const result = executeTool('fileList', {});
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.entries)).toBe(true);
  });

  test('valid calls for every tool dispatch exactly as before (golden behavior)', () => {
    const name = `schema-golden-${Date.now()}.txt`;
    const w = executeTool('fileWrite', { path: name, content: 'golden' }, { agentId: 'cmo', taskId: 1 });
    expect(w.ok).toBe(true);
    expect(w.sandboxPath).toBe(name);
    const r = executeTool('fileRead', { path: name }, { agentId: 'cmo', taskId: 1 });
    expect(r.ok).toBe(true);
    expect(r.content).toBe('golden');
    const l = executeTool('fileList', { path: '' }, { agentId: 'cmo', taskId: 1 });
    expect(l.ok).toBe(true);
    fs.unlinkSync(path.join(SANDBOX, name));
  });

  test('validation failures still issue an error receipt (invalid_input)', () => {
    const before = fs.existsSync(process.env.MACF_RECEIPTS_FILE)
      ? fs.readFileSync(process.env.MACF_RECEIPTS_FILE, 'utf8').split('\n').filter(Boolean).length : 0;
    executeTool('urlCheck', { arg: 'https://example.com' }, { agentId: 'cmo', taskId: 702 });
    const lines = fs.readFileSync(process.env.MACF_RECEIPTS_FILE, 'utf8').split('\n').filter(Boolean);
    expect(lines.length).toBe(before + 1);
    const receipt = JSON.parse(lines[lines.length - 1]);
    expect(receipt.status).toBe('error');
    expect(receipt.errorClass).toBe('invalid_input');
    expect(receipt.tool).toBe('urlCheck');
  });
});
