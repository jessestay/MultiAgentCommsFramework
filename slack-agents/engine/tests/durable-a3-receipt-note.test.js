// durable-a3-receipt-note.test.js — Phase A, US-A3 (Vikunja #789).
//
// TDD RED PHASE (Oct 16, 2026): written from the acceptance criteria BEFORE
// the implementation. Contract:
//
//   * NEW MODULE utils/receiptSummary.js exporting summarizeReceipts(receipts)
//     -> short plain-text summary string (<= ~1000 chars) built from receipt
//     records in the engine/receipts.js shape:
//       { receiptId, ts, agentId, taskId, tool, status: 'ok'|'error',
//         errorClass, artifacts: [{ kind, ref, ... }] }
//     Rules:
//       - names every tool that was executed;
//       - lists artifact refs ONLY from receipts with status 'ok'
//         (a failed execution's artifacts are never claimed as produced);
//       - failed executions are marked as failed, not as progress;
//       - an empty / all-failed history yields an explicit statement that
//         NO tool work completed — it never fabricates progress (US-A3.3).
//   * directivePoll: when recordRetryFailure dead-letters a directive, the
//     dead-letter entry gains `receiptSummary`, generated from that agent's
//     receipts at or after the directive's msgTs (the receipts ledger at
//     MACF_RECEIPTS_FILE). When drainDeadLetterRequeues resurrects the
//     entry, the summary is placed in the requeued text AHEAD of the
//     original assignment text (US-A3.2).
//
// jest notes (AGENTS.md): jest.mock is file-wide — litellm is mocked so no
// real gateway client loads; the CTO agent is mocked like the kernel
// resilience suite does, because the poller resolves agents lazily.

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-durable-a3-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');
process.env.MACF_STEP_BACKOFF_MS = '1';
delete process.env.ANTHROPIC_API_KEY;

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

function impl(rel) {
  try { return require(rel); } catch (e) {
    throw new Error(`RED PHASE (TDD): implementation module not built yet: ${rel} — ${e.code || e.message}`);
  }
}

jest.mock('../../utils/litellm', () => ({
  isConfigured: () => true,
  chat: jest.fn(),
  chatTurn: jest.fn(),
}));
jest.mock('../../agents/cto.js', () => ({
  handleDelegation: async () => ({ response: 'ok' }),
  init: jest.fn(),
}), { virtual: false });

const poller = require('../directivePoll');

// A receipt in the exact shape engine/receipts.js issueReceipt writes.
const rcpt = (over = {}) => ({
  receiptId: 'rcpt_test', ts: new Date().toISOString(), agentId: 'cto', taskId: null,
  tool: 'fileRead', argsHash: 'abc', argsSummary: {}, status: 'ok',
  errorClass: null, durationMs: 5, artifacts: [], ...over,
});

function writeReceipts(receipts) {
  fs.writeFileSync(process.env.MACF_RECEIPTS_FILE, receipts.map(r => JSON.stringify(r)).join('\n') + '\n');
}

const ASSIGNMENT = '[from: CEO → CTO] ASSIGNMENT MARKER — design the thing end to end';
function deadLetter(state, receipts) {
  writeReceipts(receipts);
  const item = {
    channel: 'C0ASH4TF604',
    m: { ts: '1792124235.431219' },
    text: ASSIGNMENT,
    msgTs: (Date.now() - 60000) / 1000, // directive posted ~1 min ago (epoch seconds, poller convention)
    agentId: 'cto',
  };
  // Failures 1-3 queue retries; the 4th dead-letters (retries >= 3).
  for (let i = 0; i < 4; i++) poller.recordRetryFailure(state, item, 'no_result', () => {});
  return state._deadLetter[0];
}

// ─── TDD unit: receipt summarizer ───────────────────────────────────────────

describe('receipt summarizer — receipts → summary text (TDD)', () => {
  test('names the tools executed and the artifacts produced', () => {
    const { summarizeReceipts } = impl('../../utils/receiptSummary');
    const summary = summarizeReceipts([
      rcpt({ tool: 'fileRead', argsSummary: { path: 'task-761/one-pager-DRAFT.md' } }),
      rcpt({ tool: 'fileWrite', argsSummary: { path: 'task-761/one-pager-designed.pdf' },
             artifacts: [{ kind: 'file', ref: 'task-761/one-pager-designed.pdf', sha256: 'beef', bytes: 1234 }] }),
    ]);
    expect(summary).toContain('fileRead');
    expect(summary).toContain('fileWrite');
    expect(summary).toContain('task-761/one-pager-designed.pdf');
  });

  test('never claims artifacts from failed executions', () => {
    const { summarizeReceipts } = impl('../../utils/receiptSummary');
    // urlCheck receipts can carry artifact refs even on failure (see
    // engine/receipts.js artifactsFor) — the summarizer must not present
    // them as produced work.
    const summary = summarizeReceipts([
      rcpt({ tool: 'urlCheck', status: 'error', errorClass: 'transport',
             artifacts: [{ kind: 'http_check', ref: 'https://example.test/never-produced', httpCode: 0 }] }),
    ]);
    expect(summary).not.toContain('https://example.test/never-produced');
    expect(summary).toContain('urlCheck');
    expect(summary).toMatch(/fail/i);
  });

  test('an attempt with no receipts states plainly that no tool work completed', () => {
    const { summarizeReceipts } = impl('../../utils/receiptSummary');
    for (const empty of [[], null, undefined]) {
      const summary = summarizeReceipts(empty);
      expect(summary).toMatch(/no tool work completed/i);
    }
  });

  test('an attempt whose executions all failed does not fabricate progress', () => {
    const { summarizeReceipts } = impl('../../utils/receiptSummary');
    const summary = summarizeReceipts([
      rcpt({ tool: 'fileRead', status: 'error', errorClass: 'transport' }),
    ]);
    expect(summary).toMatch(/no tool work completed|no (successful|completed) tool/i);
    expect(summary).not.toMatch(/produced|completed the|delivered/i);
  });

  test('the summary stays short even for a long attempt', () => {
    const { summarizeReceipts } = impl('../../utils/receiptSummary');
    const many = Array.from({ length: 50 }, (_, i) => rcpt({ tool: 'fileRead', argsSummary: { path: `file-${i}.md` } }));
    expect(summarizeReceipts(many).length).toBeLessThanOrEqual(1000);
  });
});

// ─── BDD: US-A3 — dead-letter requeues carry a receipt summary ──────────────

describe('US-A3 — dead-letter requeues carry a receipt summary', () => {
  test('A3.1: when a delegation dead-letters, the requeue entry includes a summary generated from that attempt\'s receipts', () => {
    const entry = deadLetter({}, [
      rcpt({ tool: 'fileRead' }),
      rcpt({ tool: 'fileWrite', artifacts: [{ kind: 'file', ref: 'out/designed.pdf', sha256: 'beef', bytes: 42 }] }),
    ]);
    expect(entry).toBeDefined();
    expect(typeof entry.receiptSummary).toBe('string');
    expect(entry.receiptSummary).toContain('fileRead');
    expect(entry.receiptSummary).toContain('out/designed.pdf');
  });

  test('A3.2: when the fresh attempt starts, the summary is present in its context ahead of the assignment text', () => {
    const state = {};
    const entry = deadLetter(state, [
      rcpt({ tool: 'fileRead' }),
      rcpt({ tool: 'fileWrite', artifacts: [{ kind: 'file', ref: 'out/designed.pdf', sha256: 'beef', bytes: 42 }] }),
    ]);
    const pending = [];
    const drained = poller.drainDeadLetterRequeues(state, null, pending, Date.now() + 31 * 60 * 1000);
    expect(drained).toBe(1);
    expect(pending).toHaveLength(1);
    const text = pending[0].text;
    expect(text).toContain(entry.receiptSummary);
    expect(text.indexOf(entry.receiptSummary)).toBeLessThan(text.indexOf('ASSIGNMENT MARKER'));
    expect(text).toContain('ASSIGNMENT MARKER');
  });

  test('A3.3: an attempt that executed no tools dead-letters with a summary stating that no tool work completed', () => {
    const entry = deadLetter({}, []);
    expect(entry).toBeDefined();
    expect(typeof entry.receiptSummary).toBe('string');
    expect(entry.receiptSummary).toMatch(/no tool work completed/i);
  });
});
