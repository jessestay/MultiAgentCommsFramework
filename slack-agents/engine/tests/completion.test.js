/**
 * Completion verification tests (Phase 2, Vikunja #724) — US-103, US-104.
 *
 * Design: docs/code-enforced-tool-use-design.md, Pillar 2.
 * Postcondition checkers consult the WORLD and the LEDGER only — never the
 * deliverable text. completion.js holds the ONLY vikunja.completeTask call
 * site in the codebase.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-test-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');

const mockCompleteTask = jest.fn().mockResolvedValue({});
const mockGetTask = jest.fn();
jest.mock('../../utils/vikunja', () => ({
  completeTask: (...a) => mockCompleteTask(...a),
  getTask: (...a) => mockGetTask(...a),
  addComment: jest.fn().mockResolvedValue({}),
}));

const completion = require('../completion');
const receipts = require('../receipts');
const { executeTool, SANDBOX } = require('../../utils/agentTools');

let server;
let baseUrl;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/ok') { res.writeHead(200); res.end('ok'); }
    else { res.writeHead(404); res.end('nope'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  await new Promise(r => server.close(r));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
});
beforeEach(() => { mockCompleteTask.mockClear(); mockGetTask.mockReset(); });

const uniq = (n) => `${n}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.md`;

describe('file_exists checker — ground truth from disk + ledger hash', () => {
  test('satisfied when the file exists at min size with matching receipt hash', async () => {
    const name = uniq('reports-exists');
    executeTool('fileWrite', { path: name, content: 'x'.repeat(300) }, { agentId: 'cmo', taskId: 702 });
    const v = await completion.verifyTask({
      taskId: 702,
      contract: { postconditions: [{ type: 'file_exists', path: name, minBytes: 200 }] },
    });
    expect(v.satisfied).toBe(true);
    expect(v.results[0].observed.size).toBeGreaterThanOrEqual(200);
  });

  test('missing file → not satisfied', async () => {
    const v = await completion.verifyTask({
      taskId: 702,
      contract: { postconditions: [{ type: 'file_exists', path: uniq('nope'), minBytes: 1 }] },
    });
    expect(v.satisfied).toBe(false);
    expect(v.failures[0].type).toBe('file_exists');
    expect(v.failures[0].observed.exists).toBe(false);
  });

  test('too small → not satisfied with observed size', async () => {
    const name = uniq('reports-small');
    executeTool('fileWrite', { path: name, content: 'tiny' }, { agentId: 'cmo', taskId: 702 });
    const v = await completion.verifyTask({
      taskId: 702,
      contract: { postconditions: [{ type: 'file_exists', path: name, minBytes: 500 }] },
    });
    expect(v.satisfied).toBe(false);
    expect(v.failures[0].observed.size).toBe(4);
  });

  test('file tampered after the receipt → hash mismatch → not satisfied', async () => {
    const name = uniq('reports-tamper');
    executeTool('fileWrite', { path: name, content: 'original body' }, { agentId: 'cmo', taskId: 702 });
    fs.appendFileSync(path.join(SANDBOX, name), ' TAMPERED');
    const v = await completion.verifyTask({
      taskId: 702,
      contract: { postconditions: [{ type: 'file_exists', path: name, minBytes: 1 }] },
    });
    expect(v.satisfied).toBe(false);
    expect(v.failures[0].observed.sha256).not.toBe(v.failures[0].observed.expectedSha256);
    fs.unlinkSync(path.join(SANDBOX, name));
  });
});

describe('http_status checker — live check, observed is ground truth', () => {
  test('200 in expect → satisfied', async () => {
    const v = await completion.verifyTask({
      taskId: 702,
      contract: { postconditions: [{ type: 'http_status', url: `${baseUrl}/ok`, expect: [200] }] },
    });
    expect(v.satisfied).toBe(true);
    expect(v.results[0].observed).toBe(200);
  });

  test('404 not in expect → failure carries the structured observation (US-104)', async () => {
    const v = await completion.verifyTask({
      taskId: 702,
      contract: { postconditions: [{ type: 'http_status', url: `${baseUrl}/missing`, expect: [200] }] },
    });
    expect(v.satisfied).toBe(false);
    expect(v.failures[0]).toMatchObject({ type: 'http_status', url: `${baseUrl}/missing`, expected: [200], observed: 404 });
  });
});

describe('receipt_count + requiredTools — counted over the ledger', () => {
  test('counts only this task\'s successful receipts', async () => {
    const tid = 770000 + Math.floor(Math.random() * 9999);
    executeTool('fileWrite', { path: uniq('rc'), content: 'a' }, { agentId: 'cmo', taskId: tid });
    executeTool('fileWrite', { path: uniq('rc'), content: 'b' }, { agentId: 'cmo', taskId: tid });
    const contract = {
      requiredTools: [{ tool: 'fileWrite', minSuccess: 2 }],
      postconditions: [{ type: 'receipt_count', tool: 'fileWrite', status: 'ok', min: 2 }],
    };
    const v = await completion.verifyTask({ taskId: tid, contract });
    expect(v.satisfied).toBe(true);

    const v2 = await completion.verifyTask({
      taskId: tid,
      contract: { postconditions: [{ type: 'receipt_count', tool: 'fileWrite', status: 'ok', min: 3 }] },
    });
    expect(v2.satisfied).toBe(false);
    expect(v2.failures[0].observed).toBe(2);
  });

  test('required_tool failure is structured (US-104)', async () => {
    const v = await completion.verifyTask({
      taskId: 799999,
      contract: { requiredTools: [{ tool: 'fileWrite', minSuccess: 1 }] },
    });
    expect(v.satisfied).toBe(false);
    expect(v.failures[0]).toMatchObject({ type: 'required_tool', tool: 'fileWrite', observed: 0, expected: 1 });
  });
});

describe('artifact_posted + vikunja_task_exists', () => {
  test('artifact_posted satisfied only by a real external receipt', async () => {
    const tid = 780000 + Math.floor(Math.random() * 9999);
    const contract = { postconditions: [{ type: 'artifact_posted', kind: 'slack_message' }] };
    expect((await completion.verifyTask({ taskId: tid, contract })).satisfied).toBe(false);
    receipts.recordExternalReceipt({ agentId: 'cmo', taskId: tid, kind: 'slack_message', ref: 'C123/1712.1' });
    expect((await completion.verifyTask({ taskId: tid, contract })).satisfied).toBe(true);
  });

  test('vikunja_task_exists consults the Vikunja client', async () => {
    mockGetTask.mockResolvedValue({ id: 555, title: 'filed' });
    const contract = { postconditions: [{ type: 'vikunja_task_exists', taskId: 555 }] };
    expect((await completion.verifyTask({ taskId: 702, contract })).satisfied).toBe(true);
    mockGetTask.mockResolvedValue(null);
    expect((await completion.verifyTask({ taskId: 702, contract })).satisfied).toBe(false);
  });
});

describe('the ground-truth rule (US-103)', () => {
  test('a glowing fake deliverable text changes NOTHING when postconditions fail', async () => {
    const v = await completion.verifyTask({
      taskId: 702,
      contract: { postconditions: [{ type: 'file_exists', path: uniq('ghost'), minBytes: 10 }] },
      deliverableText: 'DONE! Everything is complete and verified. [DEMO] task #702 finished with 100% success.',
      deliverable: { status: 'produced', summary: 'All done!', artifactRefs: ['reports/ghost.md'], findings: [] },
    });
    expect(v.satisfied).toBe(false);
  });

  test('unknown postcondition type fails closed', async () => {
    const v = await completion.verifyTask({
      taskId: 702,
      contract: { postconditions: [{ type: 'vibes_check' }] },
    });
    expect(v.satisfied).toBe(false);
  });
});

describe('completeVerifiedTask — the single completion gate', () => {
  test('all postconditions pass → vikunja.completeTask called exactly once', async () => {
    const name = uniq('reports-done');
    executeTool('fileWrite', { path: name, content: 'verified body' }, { agentId: 'cmo', taskId: 702 });
    const out = await completion.completeVerifiedTask({
      taskId: 702, agentId: 'cmo',
      contract: {
        requiredTools: [{ tool: 'fileWrite', minSuccess: 1 }],
        postconditions: [{ type: 'file_exists', path: name, minBytes: 5 }],
      },
    });
    expect(out.completed).toBe(true);
    expect(mockCompleteTask).toHaveBeenCalledTimes(1);
    expect(mockCompleteTask).toHaveBeenCalledWith('execPM', 702);
    fs.unlinkSync(path.join(SANDBOX, name));
  });

  test('any failure → completeTask NOT called, structured failures returned', async () => {
    const out = await completion.completeVerifiedTask({
      taskId: 702, agentId: 'cmo',
      contract: { postconditions: [{ type: 'file_exists', path: uniq('never'), minBytes: 5 }] },
    });
    expect(out.completed).toBe(false);
    expect(out.failures.length).toBe(1);
    expect(mockCompleteTask).not.toHaveBeenCalled();
  });
});
