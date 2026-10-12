/**
 * Cycle picker contract-lane tests (Oct 12, 2026 — #724 acceptance fix).
 *
 * The Phase 3 fail-closed gate means uncontracted tasks can no longer be
 * completed — but the pre-contract picker (stalest-first) would starve
 * every contracted task behind the legacy backlog, burning one cycle per
 * refused task while completable work waits. The picker therefore prefers
 * the stalest eligible CONTRACTED task; uncontracted tasks are picked only
 * when no contracted work is eligible (preserving fail-closed pressure and
 * attempt backoff).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'we-picker-test-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');
process.env.VIKUNJA_PROJECT_ID = '2'; // tasks.isEnabled() gate in runCycle
delete process.env.ANTHROPIC_API_KEY;

const mockChat = jest.fn();
const mockCompleteTask = jest.fn(async () => ({}));
let mockTaskLists = { 2: [], 16: [] };
jest.mock('../../utils/litellm', () => ({
  chat: (...a) => mockChat(...a),
  chatTurn: (...a) => mockChat(...a),
  isConfigured: () => true,
  _resetCache: () => {},
}));
jest.mock('../../utils/vikunja', () => ({
  listTasks: jest.fn(async (agentId, pid) => mockTaskLists[pid] || []),
  getTask: jest.fn(async () => ({ id: 802, done: false })),
  completeTask: (...a) => mockCompleteTask(...a),
  addComment: jest.fn(async () => ({})),
  createTask: jest.fn(),
  isConfigured: () => true,
}));
jest.mock('../lock', () => ({
  acquireLock: jest.fn(async () => true),
  releaseLock: jest.fn(async () => {}),
  isLockTask: () => false,
  holderId: () => 'test-holder',
}));
jest.mock('../../utils/agentBase', () => {
  const actual = jest.requireActual('../../utils/agentBase');
  return {
    ...actual,
    postAs: jest.fn(async () => ({ ts: '1.0' })),
    resolveChannelId: jest.fn(async () => 'C123'),
  };
});

const workEngine = require('../workEngine');
const state = require('../../utils/state');
const { stampContract } = require('../taskContract');
const { SANDBOX } = require('../../utils/agentTools');

function scriptModel(turns) {
  const queue = [...turns];
  mockChat.mockImplementation(async () => {
    const t = queue.length > 1 ? queue.shift() : queue[0];
    // Real chatTurn shape: {text, toolCalls}; chat shape: {content}.
    if (typeof t === 'string') return { content: t, text: t, toolCalls: [], model: 'test-model', usage: {} };
    return { content: t.text || '', text: t.text || '', toolCalls: t.toolCalls || [], model: 'test-model', usage: {} };
  });
}

const fakeClient = { chat: { postMessage: jest.fn(async () => ({ ts: '1.0' })) } };

beforeAll(() => {
  workEngine.init({ client: fakeClient, startTimer: false });
});
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });
beforeEach(() => {
  mockChat.mockReset();
  mockCompleteTask.mockClear();
  mockTaskLists = { 2: [], 16: [] };
});

test('picker prefers the stalest CONTRACTED task over a staler uncontracted one', async () => {
  const p = `reports/picker-${Date.now()}.md`;
  const staleUncontracted = {
    id: 801, title: 'Old legacy task', description: 'Do the old thing.',
    updated: '2026-10-01T00:00:00Z', priority: 4, done: false,
  };
  const contracted = {
    id: 802, title: 'Write the picker report', priority: 4, done: false,
    updated: '2026-10-12T00:00:00Z',
    description: stampContract('Write the picker report file.', {
      taskId: 802, executor: null, requiredTools: [],
      postconditions: [{ type: 'file_exists', path: p, minBytes: 10 }],
      deliverable: { schema: 'file-report@v1' }, maxAttempts: 3,
    }),
  };
  mockTaskLists = { 2: [staleUncontracted, contracted], 16: [] };
  scriptModel([
    { toolCalls: [{ toolName: 'fileWrite', args: { path: p, content: 'picker report body, long enough.' } }] },
    { text: JSON.stringify({ status: 'produced', summary: 'Picker report written.', artifactRefs: [p] }) },
  ]);

  await workEngine.runCycle();

  expect(mockCompleteTask).toHaveBeenCalledTimes(1);
  expect(mockCompleteTask).toHaveBeenCalledWith('execPM', 802);
  expect(state.get('workEngine', 'taskLifecycle.802.state')).toBe('DONE');
  fs.unlinkSync(path.join(SANDBOX, p));
});

test('with no contracted work eligible, the picker still fail-closes the stalest task (backoff preserved)', async () => {
  const staleUncontracted = {
    id: 803, title: 'Another legacy task', description: 'Do the old thing.',
    updated: '2026-10-01T00:00:00Z', priority: 4, done: false,
  };
  mockTaskLists = { 2: [staleUncontracted], 16: [] };
  scriptModel(['TASK-DONE: YES — done']);
  await workEngine.runCycle();
  expect(mockChat).not.toHaveBeenCalled(); // fail-closed: model never invoked
  expect(mockCompleteTask).not.toHaveBeenCalled();
  expect(state.get('workEngine', 'lastWorked.803')).toBeTruthy();
});
