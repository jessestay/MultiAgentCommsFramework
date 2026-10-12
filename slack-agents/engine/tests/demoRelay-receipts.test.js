/**
 * Receipt-based demo qualification tests (Phase 3, Vikunja #724) — US-108.
 *
 * Design: docs/code-enforced-tool-use-design.md, Pillar 5 (demo
 * qualification). A demo exists for a task iff the receipts ledger holds a
 * recent artifact receipt for it — and, for file artifacts, the file still
 * exists with a matching hash at relay time. Prose is never consulted:
 * this suite replaces the prose cases of demoRelay.test.js.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-relay-test-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');

const demoRelay = require('../demoRelay');
const receipts = require('../receipts');
const { executeTool, SANDBOX } = require('../../utils/agentTools');

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('US-108 — qualification is a ledger lookup + live re-verification', () => {
  test('prose alone never qualifies: no receipts for the task → no demo', () => {
    // The old standard would have passed this text (label + link + task ref
    // + 20 words of deliverable language). It demonstrates nothing the
    // engine can verify, so it must not relay.
    const tid = 910000 + Math.floor(Math.random() * 9999);
    const v = demoRelay.demoForTask(tid);
    expect(v.qualifies).toBe(false);
    expect(v.reason).toMatch(/no artifact receipt/);
  });

  test('a file artifact receipt qualifies, formatted from receipt fields', () => {
    const tid = 920000 + Math.floor(Math.random() * 9999);
    const name = `demo-artifact-${tid}.md`;
    executeTool('fileWrite', { path: name, content: 'demo body' }, { agentId: 'cmo', taskId: tid });
    const v = demoRelay.demoForTask(tid);
    expect(v.qualifies).toBe(true);
    expect(v.demo.taskId).toBe(tid);
    expect(v.demo.agent).toBe('cmo');
    expect(v.demo.artifactKind).toBe('file');
    expect(v.demo.artifactRef).toBe(path.join(SANDBOX, name));
    expect(v.demo.receiptId).toMatch(/^rcpt_/);
    const line = demoRelay.formatRelayLine(v.demo);
    expect(line).toContain('[RELAY-DEMO]');
    expect(line).toContain(v.demo.receiptId); // every relay traceable to a receipt ID
    expect(line).toContain(`task #${tid}`);
    fs.unlinkSync(path.join(SANDBOX, name));
  });

  test('file deleted after the receipt → relay suppressed at re-verification', () => {
    const tid = 930000 + Math.floor(Math.random() * 9999);
    const name = `demo-gone-${tid}.md`;
    executeTool('fileWrite', { path: name, content: 'demo body' }, { agentId: 'cmo', taskId: tid });
    fs.unlinkSync(path.join(SANDBOX, name));
    const v = demoRelay.demoForTask(tid);
    expect(v.qualifies).toBe(false);
    expect(v.reason).toMatch(/re-verification|missing|deleted/i);
  });

  test('file tampered after the receipt → hash mismatch suppresses the relay', () => {
    const tid = 940000 + Math.floor(Math.random() * 9999);
    const name = `demo-tamper-${tid}.md`;
    executeTool('fileWrite', { path: name, content: 'original' }, { agentId: 'cmo', taskId: tid });
    fs.appendFileSync(path.join(SANDBOX, name), ' edited later');
    const v = demoRelay.demoForTask(tid);
    expect(v.qualifies).toBe(false);
    fs.unlinkSync(path.join(SANDBOX, name));
  });

  test('a slack_message receipt qualifies without any file', () => {
    const tid = 950000 + Math.floor(Math.random() * 9999);
    receipts.recordExternalReceipt({ agentId: 'cco', taskId: tid, kind: 'slack_message', ref: 'content/1712345678.000200' });
    const v = demoRelay.demoForTask(tid);
    expect(v.qualifies).toBe(true);
    expect(v.demo.artifactKind).toBe('slack_message');
  });

  test('receipts outside the window do not qualify', () => {
    const tid = 960000 + Math.floor(Math.random() * 9999);
    // Hand-write an old ledger line (30 days ago) plus its artifact file.
    const name = `demo-old-${tid}.md`;
    const full = path.join(SANDBOX, name);
    fs.writeFileSync(full, 'old body');
    const crypto = require('crypto');
    const sha = crypto.createHash('sha256').update('old body').digest('hex');
    const old = new Date(Date.now() - 30 * 864e5).toISOString();
    fs.appendFileSync(process.env.MACF_RECEIPTS_FILE, JSON.stringify({
      receiptId: 'rcpt_oldtest', ts: old, agentId: 'cmo', taskId: tid, tool: 'fileWrite',
      argsHash: 'x', argsSummary: {}, status: 'ok', errorClass: null, durationMs: 1,
      artifacts: [{ kind: 'file', ref: full, sha256: sha, bytes: 8 }],
    }) + '\n');
    const v = demoRelay.demoForTask(tid); // default window 24h
    expect(v.qualifies).toBe(false);
    fs.unlinkSync(full);
  });

  test('qualifiesAsDemo (prose standard) is deleted', () => {
    expect(demoRelay.qualifiesAsDemo).toBeUndefined();
  });
});
