/**
 * workEngine completion behavior tests (Phase 2, Vikunja #724) — US-103/104/105.
 *
 * Design: docs/code-enforced-tool-use-design.md, Pillars 2 + 3.
 * The end-to-end pin: under a contract, completion is a state transition
 * the ENGINE takes when postconditions verify — never a string the model
 * emits. Modeled on generateWithTools.behavior.test.js with Vikunja mocked
 * and the model scripted through the litellm mock (text-emulation route).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'we-completion-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');
delete process.env.ANTHROPIC_API_KEY;

const mockChat = jest.fn();
jest.mock('../../utils/litellm', () => ({
  isConfigured: () => true,
  chat: (...args) => mockChat(...args),
  // no chatTurn: the scripted route exercises text emulation; completion
  // semantics are route-independent.
}));

const mockCompleteTask = jest.fn().mockResolvedValue({});
const mockAddComment = jest.fn().mockResolvedValue({});
jest.mock('../../utils/vikunja', () => ({
  completeTask: (...a) => mockCompleteTask(...a),
  addComment: (...a) => mockAddComment(...a),
  getTask: jest.fn().mockResolvedValue(null),
  listTasks: jest.fn().mockResolvedValue([]),
}));

const workEngine = require('../workEngine');
const state = require('../../utils/state');
const { SANDBOX } = require('../../utils/agentTools');

function scriptModel(responses) {
  let i = 0;
  mockChat.mockImplementation(async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return r;
  });
}

function contractBlock(contract) {
  return `\n<!-- MACF-CONTRACT\n${JSON.stringify(contract)}\nMACF-CONTRACT -->`;
}

function contractedTask(id, reportPath, maxAttempts = 3) {
  return {
    id,
    title: 'Evaluate the pricing report',
    description: 'Evaluate the pricing report and write the findings file.' + contractBlock({
      version: 1,
      taskId: id,
      executor: null,
      requiredTools: [{ tool: 'fileWrite', minSuccess: 1 }],
      postconditions: [{ type: 'file_exists', path: reportPath, minBytes: 10 }],
      deliverable: { schema: 'research-report@v1' },
      maxAttempts,
    }),
  };
}

const goodJson = (p) => JSON.stringify({
  status: 'produced',
  summary: `Wrote the pricing findings to ${p} with the scan results included.`,
  artifactRefs: [p],
  findings: [{ url: 'https://example.com/pricing', observation: 'Unchanged this cycle.' }],
});

beforeEach(() => {
  mockChat.mockReset();
  mockCompleteTask.mockClear();
  mockAddComment.mockClear();
  workEngine.drainRelayQueue();
});
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('contracted tasks: completion is verified, never asserted', () => {
  test('(a) #702 reproduced under a contract: tool syntax as final text → not completed, attempt failed', async () => {
    const task = contractedTask(702, 'reports/wc-702a.md');
    scriptModel(["[fileRead(path='/home/sandbox/reports'), fileList(path='/home/sandbox/reports')]"]);
    await workEngine.workTask(task);

    expect(mockCompleteTask).not.toHaveBeenCalled();
    const lc = state.get('workEngine', 'taskLifecycle.702');
    expect(lc.state).not.toBe('DONE');
    expect(state.get('workEngine', 'lastWorked.702')).toBeTruthy(); // failed attempt recorded
    expect(workEngine.drainRelayQueue()).toEqual([]); // nothing relayed to Jesse
  });

  test('(b) real tool work + valid JSON deliverable → VERIFYING → DONE, completeTask once', async () => {
    const p = 'reports/wc-702b.md';
    const task = contractedTask(702, p);
    scriptModel([
      `[TOOL: fileWrite] {"path": "${p}", "content": "pricing findings body, long enough"}`,
      goodJson(p),
    ]);
    await workEngine.workTask(task);

    expect(mockCompleteTask).toHaveBeenCalledTimes(1);
    expect(mockCompleteTask).toHaveBeenCalledWith('execPM', 702);
    expect(state.get('workEngine', 'taskLifecycle.702').state).toBe('DONE');
    const relay = workEngine.drainRelayQueue();
    expect(relay.length).toBe(1);
    expect(relay[0].done).toBe(true);
    fs.unlinkSync(path.join(SANDBOX, p));
  });

  test('(c) TASK-DONE: YES prose under a contract completes NOTHING (the old protocol is dead)', async () => {
    const task = contractedTask(703, 'reports/wc-703.md');
    scriptModel([
      'Finished the pricing evaluation with 42 signups tracked and the report ready at reports/wc-703.md for review. [DEMO]\nTASK-DONE: YES — report written, no approval needed',
    ]);
    await workEngine.workTask(task);
    expect(mockCompleteTask).not.toHaveBeenCalled();
    expect(state.get('workEngine', 'taskLifecycle.703').state).not.toBe('DONE');
  });

  test('(c2) valid JSON claiming "produced" with NO tool work → verification fails, structured failure stored (US-104)', async () => {
    const p = 'reports/wc-704.md';
    const task = contractedTask(704, p);
    scriptModel([goodJson(p)]);
    await workEngine.workTask(task);

    expect(mockCompleteTask).not.toHaveBeenCalled();
    const lc = state.get('workEngine', 'taskLifecycle.704');
    expect(lc.state).toBe('WORKING');
    expect(lc.attempts).toBe(1);
    expect(lc.lastVerification.map(f => f.type)).toContain('file_exists');

    // Next cycle does the real work → completes. The failure fed forward.
    scriptModel([
      `[TOOL: fileWrite] {"path": "${p}", "content": "real findings body here"}`,
      goodJson(p),
    ]);
    await workEngine.workTask(task);
    expect(mockCompleteTask).toHaveBeenCalledTimes(1);
    expect(state.get('workEngine', 'taskLifecycle.704').state).toBe('DONE');
    fs.unlinkSync(path.join(SANDBOX, p));
  });

  test('(d) attempts exhausted → BLOCKED + engine gap, no completion, no relay', async () => {
    const p = 'reports/wc-705.md';
    const task = contractedTask(705, p, 1); // maxAttempts 1
    scriptModel([goodJson(p)]);
    await workEngine.workTask(task);

    expect(mockCompleteTask).not.toHaveBeenCalled();
    const lc = state.get('workEngine', 'taskLifecycle.705');
    expect(lc.state).toBe('BLOCKED');
    const gaps = JSON.parse(fs.readFileSync(process.env.MACF_TOOL_AUDIT_GAP_FILE, 'utf8'));
    expect(gaps.some(g => g.type === 'VERIFICATION_BLOCKED' && g.taskId === 705)).toBe(true);
    expect(workEngine.drainRelayQueue()).toEqual([]);
  });
});

describe('Phase 3: the legacy path is deleted — uncontracted tasks fail closed', () => {
  test('an uncontracted task is not worked, not completed, not relayed', async () => {
    // Updated for #724 Phase 3 (was the Phase 2 transitional legacy pin):
    // without a contract there is no prose path back in. The task stays
    // open for triage to stamp a contract; the model is never even called.
    const task = { id: 706, title: 'Write the legacy summary', description: 'Write a short legacy summary file.' };
    scriptModel(['TASK-DONE: YES — done']);
    await workEngine.workTask(task);
    expect(mockChat).not.toHaveBeenCalled();
    expect(mockCompleteTask).not.toHaveBeenCalled();
    expect(workEngine.drainRelayQueue()).toEqual([]);
    expect(state.get('workEngine', 'lastWorked.706')).toBeTruthy(); // attempt recorded (backoff applies)
  });
});
