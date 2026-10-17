/**
 * engine/tests/kernel-m3-loop.test.js
 *
 * M3 of the execution kernel (Vikunja #771) — the LOOP completion guard.
 * Spec: EXECUTION-KERNEL-SPEC.md, US-5 (universal contracts).
 *
 * A LOOP task (title "LOOP: ...") is recurring by definition: each run
 * produces its deliverable and the task must stay OPEN for the next run.
 * The pre-#724 prose path had this guard; the #724 rewrite deleted it,
 * so a contracted LOOP task that verifies gets marked DONE in Vikunja
 * and never runs again.
 *
 * BDD:
 * - Given a verified LOOP task, when the completion verifier closes the
 *   run, then the run counts as completed (deliverable counts) but
 *   vikunja.completeTask is NOT called — the task stays open.
 * - Given a verified one-shot task, then vikunja.completeTask IS called
 *   exactly once, through the same single call site as before.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-m3-loop-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');

const mockCompleteTask = jest.fn().mockResolvedValue({});
jest.mock('../../utils/vikunja', () => ({
  completeTask: (...a) => mockCompleteTask(...a),
  getTask: jest.fn(),
  addComment: jest.fn().mockResolvedValue({}),
}));

const completion = require('../completion');

// A contract with no postconditions and no required tools verifies as
// satisfied — enough to exercise the completion transition itself.
const EMPTY_CONTRACT = { requiredTools: [], postconditions: [] };

beforeEach(() => { mockCompleteTask.mockClear(); });

describe('M3 LOOP guard: verified loop runs complete the run, not the task', () => {
  test('Given a LOOP task that verifies, then completeTask is NOT called and the outcome is a completed loop run', async () => {
    const outcome = await completion.completeVerifiedTask({
      taskId: 555, contract: EMPTY_CONTRACT, agentId: 'execpm',
      taskTitle: 'LOOP: Daily marketplace watch for free home finds',
    });
    expect(outcome.completed).toBe(true);
    expect(outcome.loop).toBe(true);
    expect(mockCompleteTask).not.toHaveBeenCalled();
  });

  test('Given a one-shot task that verifies, then completeTask IS called once', async () => {
    const outcome = await completion.completeVerifiedTask({
      taskId: 556, contract: EMPTY_CONTRACT, agentId: 'execpm',
      taskTitle: 'Write the quarterly report',
    });
    expect(outcome.completed).toBe(true);
    expect(outcome.loop).toBeFalsy();
    expect(mockCompleteTask).toHaveBeenCalledTimes(1);
    expect(mockCompleteTask).toHaveBeenCalledWith('execPM', 556);
  });
});
