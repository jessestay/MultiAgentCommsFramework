/**
 * Receipts ledger tests (Phase 1, Vikunja #724) — pins US-101, US-102, US-109.
 *
 * Design: docs/code-enforced-tool-use-design.md, Pillar 1.
 * Every tool execution through executeTool() issues a structured receipt;
 * completion decisions read the ledger, never prose. US-109: telemetry
 * (auditor summarize behind MACF_AUDIT_SOURCE=receipts) is computed from the
 * ledger and matches it exactly.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'receipts-test-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');

const { executeTool, SANDBOX } = require('../../utils/agentTools');
const receipts = require('../receipts');
const auditor = require('../toolUsageAuditor');

const LEDGER = process.env.MACF_RECEIPTS_FILE;
function ledgerEntries() {
  if (!fs.existsSync(LEDGER)) return [];
  return fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

beforeEach(() => { try { fs.unlinkSync(LEDGER); } catch { /* fresh */ } });
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('US-101 — every tool execution issues a structured receipt', () => {
  test('successful fileWrite: receipt with file artifact whose sha256 matches disk', () => {
    const name = `rcpt-${Date.now()}.txt`;
    const content = 'receipt artifact body';
    const result = executeTool('fileWrite', { path: name, content }, { agentId: 'cmo', taskId: 702 });
    expect(result.ok).toBe(true);

    const entries = ledgerEntries();
    expect(entries.length).toBe(1);
    const r = entries[0];
    expect(r.receiptId).toMatch(/^rcpt_/);
    expect(r.agentId).toBe('cmo');
    expect(r.taskId).toBe(702);
    expect(r.tool).toBe('fileWrite');
    expect(r.status).toBe('ok');
    expect(r.errorClass).toBeNull();
    expect(typeof r.argsHash).toBe('string');
    expect(r.argsHash.length).toBeGreaterThan(8);
    // content body is redacted in argsSummary, byte count kept
    expect(r.argsSummary.path).toBe(name);
    expect(r.argsSummary.content).toEqual({ bytes: Buffer.byteLength(content) });
    expect(r.artifacts.length).toBe(1);
    expect(r.artifacts[0].kind).toBe('file');
    expect(r.artifacts[0].ref).toBe(path.join(SANDBOX, name));
    expect(r.artifacts[0].sha256).toBe(sha256(content));
    expect(r.artifacts[0].bytes).toBe(Buffer.byteLength(content));
    fs.unlinkSync(path.join(SANDBOX, name));
  });

  test('unknown tool: receipt with status error + errorClass unknown_tool (no early-return blind spot)', () => {
    const result = executeTool('webSearch', { query: 'x' }, { agentId: 'cmo', taskId: 702 });
    expect(result.ok).toBe(false);
    const entries = ledgerEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].status).toBe('error');
    expect(entries[0].errorClass).toBe('unknown_tool');
    expect(entries[0].artifacts).toEqual([]);
  });

  test('failed tool call: receipt records classified errorClass and no artifacts', () => {
    const result = executeTool('fileRead', { path: 'definitely-missing-12345.txt' }, { agentId: 'execPM', taskId: 55 });
    expect(result.ok).toBe(false);
    const entries = ledgerEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].status).toBe('error');
    expect(entries[0].errorClass).toBe('not_found');
    expect(entries[0].artifacts).toEqual([]);
  });

  test('urlCheck: receipt carries an http_check artifact with the observed status code', () => {
    const result = executeTool('urlCheck', { url: 'https://www.google.com' }, { agentId: 'cmo', taskId: 702 });
    expect(result.ok).toBe(true);
    const entries = ledgerEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].artifacts.length).toBe(1);
    expect(entries[0].artifacts[0].kind).toBe('http_check');
    expect(entries[0].artifacts[0].ref).toBe('https://www.google.com');
    expect(entries[0].artifacts[0].httpCode).toBeGreaterThanOrEqual(200);
  });
});

describe('US-102 — querying what an agent actually did', () => {
  test('receiptsForTask returns the ordered list for that task only', () => {
    executeTool('fileList', {}, { agentId: 'cmo', taskId: 702 });
    executeTool('fileList', {}, { agentId: 'cfo', taskId: 999 });
    executeTool('fileList', {}, { agentId: 'cmo', taskId: 702 });
    const list = receipts.receiptsForTask(702);
    expect(list.length).toBe(2);
    expect(list.every(r => r.taskId === 702)).toBe(true);
    expect(new Date(list[1].ts).getTime()).toBeGreaterThanOrEqual(new Date(list[0].ts).getTime());
    expect(receipts.receiptsForTask(424242)).toEqual([]);
  });

  test('artifactsForTask + hasSuccessfulTool read the ledger, not prose', () => {
    const name = `rcpt-q-${Date.now()}.txt`;
    executeTool('fileWrite', { path: name, content: 'q' }, { agentId: 'cmo', taskId: 702 });
    expect(receipts.hasSuccessfulTool(702, 'fileWrite')).toBe(true);
    expect(receipts.hasSuccessfulTool(702, 'urlCheck')).toBe(false);
    const files = receipts.artifactsForTask(702, 'file');
    expect(files.length).toBe(1);
    expect(files[0].ref).toBe(path.join(SANDBOX, name));
    expect(receipts.artifactsForTask(702, 'slack_message')).toEqual([]);
    fs.unlinkSync(path.join(SANDBOX, name));
  });

  test('recordExternalReceipt records slack_message / vikunja_task effects', () => {
    const r1 = receipts.recordExternalReceipt({ agentId: 'execPM', taskId: 702, kind: 'slack_message', ref: 'C123', extra: { ts: '1728.001' } });
    expect(r1.status).toBe('ok');
    expect(r1.artifacts[0]).toMatchObject({ kind: 'slack_message', ref: 'C123', ts: '1728.001' });
    receipts.recordExternalReceipt({ agentId: 'execPM', taskId: 702, kind: 'vikunja_task', ref: 731, extra: { projectId: 2 } });
    const kinds = receipts.artifactsForTask(702).map(a => a.kind);
    expect(kinds).toContain('slack_message');
    expect(kinds).toContain('vikunja_task');
  });
});

describe('US-109 — telemetry computed from the ledger', () => {
  test('auditor summarize (receipts source) matches the ledger exactly', () => {
    executeTool('fileList', {}, { agentId: 'cmo', taskId: 1 });
    executeTool('fileRead', { path: 'missing-xyz.txt' }, { agentId: 'cmo', taskId: 1 });
    executeTool('bogusTool', {}, { agentId: 'cfo', taskId: 2 });
    const entries = ledgerEntries();
    expect(entries.length).toBe(3);

    process.env.MACF_AUDIT_SOURCE = 'receipts';
    try {
      const s = auditor.summarize(24);
      expect(s.total).toBe(3);
      expect(s.byAgent).toEqual({ cmo: 2, cfo: 1 });
      expect(s.byClass.not_found).toBe(1);
      expect(s.byClass.unknown_tool).toBe(1);
      expect(s.byType.fileList).toBe(1);
      expect(s.byType.fileRead).toBe(1);
      expect(s.byType.bogusTool).toBe(1);
    } finally {
      delete process.env.MACF_AUDIT_SOURCE;
    }
  });
});
