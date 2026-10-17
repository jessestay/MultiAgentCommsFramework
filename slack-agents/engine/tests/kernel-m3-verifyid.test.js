/**
 * engine/tests/kernel-m3-verifyid.test.js
 *
 * M3 of the execution kernel (Vikunja #771) — auditable completions.
 * Spec: EXECUTION-KERNEL-SPEC.md, US-3 + US-9: a completion must carry
 * its proof. The verifier's verdict gets a verification ID and the
 * per-check results, so the completion message and the task record can
 * cite exactly what was verified instead of asserting "done".
 *
 * BDD:
 * - Given a task that verifies, the completion outcome carries a
 *   verificationId (string, namespaced to the task) and the check
 *   results.
 * - Given a LOOP run that verifies, it also carries a verificationId.
 * - Given a task that does not verify, there is no verificationId —
 *   nothing was verified.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-m3-vid-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');

const mockCompleteTask = jest.fn().mockResolvedValue({});
jest.mock('../../utils/vikunja', () => ({
  completeTask: (...a) => mockCompleteTask(...a),
  getTask: jest.fn(),
  addComment: jest.fn().mockResolvedValue({}),
}));

const completion = require('../completion');
const receipts = require('../receipts');

const FLOOR = {
  requiredTools: [],
  postconditions: [{ type: 'receipt_count', tool: '*', status: 'ok', min: 1 }],
  deliverable: { schema: 'generic@v1' },
  maxAttempts: 3,
};

describe('M3 verification ID: completions carry their proof', () => {
  test('Given a verified one-shot task, then the outcome carries a verificationId and results', async () => {
    receipts.issueReceipt({
      agentId: 'cto', taskId: 7001, tool: 'fileWrite',
      args: { path: 'x.txt' }, result: { ok: true, path: 'x.txt' },
    });
    const outcome = await completion.completeVerifiedTask({ taskId: 7001, contract: FLOOR, agentId: 'cto', taskTitle: 'Write it' });
    expect(outcome.completed).toBe(true);
    expect(typeof outcome.verificationId).toBe('string');
    expect(outcome.verificationId).toContain('7001');
    expect(outcome.results.length).toBeGreaterThan(0);
    expect(outcome.results.every(r => r.satisfied)).toBe(true);
  });

  test('Given a verified LOOP run, then it also carries a verificationId', async () => {
    receipts.issueReceipt({
      agentId: 'cto', taskId: 7002, tool: 'fileWrite',
      args: { path: 'x.txt' }, result: { ok: true, path: 'x.txt' },
    });
    const outcome = await completion.completeVerifiedTask({ taskId: 7002, contract: FLOOR, agentId: 'cto', taskTitle: 'LOOP: Daily thing' });
    expect(outcome.completed).toBe(true);
    expect(outcome.loop).toBe(true);
    expect(typeof outcome.verificationId).toBe('string');
  });

  test('Given a task that does not verify, then there is no verificationId', async () => {
    const outcome = await completion.completeVerifiedTask({ taskId: 7003, contract: FLOOR, agentId: 'cto', taskTitle: 'Write it' });
    expect(outcome.completed).toBe(false);
    expect(outcome.verificationId).toBeUndefined();
  });
});
