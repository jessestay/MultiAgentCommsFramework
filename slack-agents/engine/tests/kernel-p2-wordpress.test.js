// kernel-p2-wordpress.test.js — #807 Phase 2 (US-P2.3): WordPress REST tool.
//
// The CMO failed the workshop page three times because no write path to
// WordPress existed anywhere in the tool registry. wpRead/wpUpdate close
// that hole: app-password Basic auth from env, role-gated, receipted.
// Tests run the REAL tool against a local HTTP stub (real curl, real auth
// header) — no WordPress is touched.

const fs0 = require('fs');
const os0 = require('os');
const path0 = require('path');
const TMP_STATE = fs0.mkdtempSync(path0.join(os0.tmpdir(), 'p2-wp-test-'));
process.env.MACF_STATE_DIR = TMP_STATE;
process.env.MACF_RECEIPTS_FILE = path0.join(TMP_STATE, '.receipts.jsonl');

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { executeTool } = require('../../utils/agentTools');

// The stub runs as a CHILD process: executeTool calls curl through
// execFileSync, which blocks this process's event loop — an in-process
// stub server could never answer (deadlock; found the hard way).
const LAST_FILE = path.join(TMP_STATE, 'wp-stub-last.json');
let stubProc = null;
let lastRequest = null;
function readLast() {
  try { return JSON.parse(fs.readFileSync(LAST_FILE, 'utf8')); } catch { return null; }
}

beforeAll(async () => {
  stubProc = spawn(process.execPath, [path.join(__dirname, 'kernel-p2-wp-stub.js')], {
    env: { ...process.env, WP_STUB_LAST: LAST_FILE },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const port = await new Promise((resolve, reject) => {
    let buf = '';
    stubProc.stdout.on('data', (d) => {
      buf += d;
      const m = buf.match(/PORT=(\d+)/);
      if (m) resolve(parseInt(m[1], 10));
    });
    stubProc.on('exit', () => reject(new Error('stub exited early')));
    setTimeout(() => reject(new Error('stub start timeout')), 10000);
  });
  process.env.WP_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.WP_USER = 'cmo-test';
  process.env.WP_APP_PASSWORD = 'test-app-password';
});

afterAll(async () => {
  delete process.env.WP_BASE_URL;
  delete process.env.WP_USER;
  delete process.env.WP_APP_PASSWORD;
  if (stubProc) stubProc.kill();
});

describe('US-P2.3 — WordPress REST tool', () => {
  test('wpRead fetches a page by slug with Basic auth', () => {
    const r = executeTool('wpRead', { slug: 'muse-for-business-workshop' }, { agentId: 'cmo', taskId: 807 });
    expect(r.ok).toBe(true);
    expect(r.id).toBe(42);
    expect(r.contentRendered).toContain('October 4');
    const expected = 'Basic ' + Buffer.from('cmo-test:test-app-password').toString('base64');
    expect(readLast().auth).toBe(expected);
  });

  test('wpUpdate posts new content to a page id', () => {
    const r = executeTool('wpUpdate', { id: 42, content: '<p>October 18</p>' }, { agentId: 'cmo', taskId: 807 });
    expect(r.ok).toBe(true);
    expect(r.contentRendered).toContain('October 18');
    expect(readLast().method).toBe('POST');
    expect(JSON.parse(readLast().body).content).toBe('<p>October 18</p>');
  });

  test('ungranted agent cannot write', () => {
    const r = executeTool('wpUpdate', { id: 42, content: '<p>x</p>' }, { agentId: 'lawyer', taskId: 807 });
    expect(r.ok).toBe(false);
    expect(r.errorClass).toBe('permission');
  });

  test('missing credential is a clear, classified failure', () => {
    const saved = process.env.WP_APP_PASSWORD;
    delete process.env.WP_APP_PASSWORD;
    const r = executeTool('wpRead', { slug: 'muse-for-business-workshop' }, { agentId: 'cmo', taskId: 807 });
    expect(r.ok).toBe(false);
    expect(r.errorClass).toBe('missing_credential');
    process.env.WP_APP_PASSWORD = saved;
  });
});
