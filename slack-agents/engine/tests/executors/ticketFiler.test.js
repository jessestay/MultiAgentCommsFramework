/**
 * ticket-filer executor tests (Phase 3, Vikunja #724) — US-107.
 *
 * Fully deterministic: creates Vikunja tasks from a structured spec and
 * records a vikunja_task receipt per filing. NO model call exists in this
 * executor — the generate seam is rigged to throw if touched.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-filer-test-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');

let nextId = 9000;
const mockCreateTask = jest.fn(async (agentId, projectId, spec) => ({ id: nextId++, title: spec.title }));
jest.mock('../../../utils/vikunja', () => ({
  createTask: (...a) => mockCreateTask(...a),
  completeTask: jest.fn(),
  getTask: jest.fn(),
  addComment: jest.fn(),
}));

const executors = require('../../executors');
const receipts = require('../../receipts');
const { templates } = require('../../taskContract');

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });
beforeEach(() => mockCreateTask.mockClear());

test('files every spec ticket, receipts each one, never calls the model', async () => {
  const tid = 850000 + Math.floor(Math.random() * 9999);
  const contract = templates.ticketFiling({
    taskId: tid,
    tickets: [
      { title: 'Follow up: pricing page audit', description: 'From the sweep.' },
      { title: 'Follow up: workshop page 404', description: 'From the sweep.' },
    ],
  });
  const task = { id: tid, title: 'File the follow-ups', description: '' };
  const generate = async () => { throw new Error('ticket-filer must never call the model'); };

  const out = await executors.dispatch('ticket-filer', { task, contract, agentId: 'execPM', generate });

  expect(out.ok).toBe(true);
  expect(mockCreateTask).toHaveBeenCalledTimes(2);
  const filed = receipts.artifactsForTask(tid, 'vikunja_task');
  expect(filed).toHaveLength(2);
  expect(out.deliverable.taskRef).toBe(filed[0].ref);
  expect(out.deliverable.summary).toMatch(/Filed 2 task/);
});

test('empty spec → structural failure, nothing filed', async () => {
  const tid = 860000 + Math.floor(Math.random() * 9999);
  const contract = templates.ticketFiling({ taskId: tid, tickets: [] });
  const task = { id: tid, title: 'File nothing', description: '' };
  const out = await executors.dispatch('ticket-filer', { task, contract, agentId: 'execPM', generate: async () => { throw new Error('no model'); } });
  expect(out.ok).toBe(false);
  expect(mockCreateTask).not.toHaveBeenCalled();
});
