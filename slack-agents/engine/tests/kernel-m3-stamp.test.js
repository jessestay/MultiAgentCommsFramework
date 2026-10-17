/**
 * engine/tests/kernel-m3-stamp.test.js
 *
 * M3 of the execution kernel (Vikunja #771) — creation-time contract
 * stamping. Spec: EXECUTION-KERNEL-SPEC.md, US-5 (universal contracts).
 *
 * The #724 contract system was sound but never adopted: stampContract
 * and the templates had ZERO production callers, so 0 live tasks
 * carried contracts and the engine's fail-closed rule meant uncontracted
 * tasks were never worked at all.
 *
 * The fix: every task created through the team's own creation path
 * (utils/vikunja.createTask) gets a contract at creation time. Creators
 * who stamp a specific contract keep theirs untouched. Everyone else
 * gets the floor contract: the task may be marked done only when the
 * receipts ledger shows at least one successful tool execution under
 * that task — the "can't fake done" minimum.
 *
 * BDD:
 * - Given a description with no contract, ensureContract stamps the
 *   floor contract (receipt_count, any tool, ok, min 1).
 * - Given a description with a contract already, ensureContract returns
 *   it unchanged (and stamping is idempotent).
 * - Given the floor contract, verification fails with zero tool
 *   receipts for the task and passes after one real successful tool
 *   execution is receipted under the task ID.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-m3-stamp-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');

const { parseContract, stampContract, ensureContract, templates } = require('../taskContract');
const completion = require('../completion');
const receipts = require('../receipts');

describe('M3 ensureContract: creation-time stamping', () => {
  test('Given a bare description, then the floor contract is stamped', () => {
    const out = ensureContract('Do the thing, in the usual way.');
    const c = parseContract(out);
    expect(c).not.toBeNull();
    expect(c.postconditions).toEqual([
      { type: 'receipt_count', tool: '*', status: 'ok', min: 1 },
    ]);
    expect(out).toContain('Do the thing, in the usual way.');
  });

  test('Given an existing contract, then the description is returned unchanged', () => {
    const stamped = stampContract('Has one already.', templates.urlSweep({ taskId: 7, urls: ['https://example.com'] }));
    expect(ensureContract(stamped)).toBe(stamped);
  });

  test('Given a floor-stamped description, then stamping again changes nothing', () => {
    const once = ensureContract('Bare.');
    expect(ensureContract(once)).toBe(once);
  });
});

describe('M3 floor contract verification: at least one real tool execution', () => {
  test('Given no receipts for the task, then verification fails', async () => {
    const floor = parseContract(ensureContract('Bare.'));
    const verdict = await completion.verifyTask({ taskId: 9001, contract: floor });
    expect(verdict.satisfied).toBe(false);
  });

  test('Given one successful tool receipt under the task, then verification passes', async () => {
    receipts.issueReceipt({
      agentId: 'cto', taskId: 9002, tool: 'urlCheck',
      args: { url: 'https://example.com' }, result: { ok: true, httpCode: 200 },
    });
    const floor = parseContract(ensureContract('Bare.'));
    const verdict = await completion.verifyTask({ taskId: 9002, contract: floor });
    expect(verdict.satisfied).toBe(true);
  });
});
