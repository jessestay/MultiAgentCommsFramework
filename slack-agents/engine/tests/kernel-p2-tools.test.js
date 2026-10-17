// kernel-p2-tools.test.js — #807 Phase 2 actuators (US-P2.1 + US-P2.2).
//
// US-P2.1 codeRead: role-gated read access to the MACF tree the agents own
// (source + state), so "workspace permissions block access" can never be a
// truthful blocker again. Secret-bearing files are denied by construction.
// US-P2.2 pdfRead: text extraction from sandbox PDFs via pdftotext (the
// #658 product-PDF class of work).
//
// Receipt isolation mirrors agentTools.test.js (#724 lesson).

const fs0 = require('fs');
const os0 = require('os');
const path0 = require('path');
const TMP_STATE = fs0.mkdtempSync(path0.join(os0.tmpdir(), 'p2-tools-test-'));
process.env.MACF_STATE_DIR = TMP_STATE;
process.env.MACF_RECEIPTS_FILE = path0.join(TMP_STATE, '.receipts.jsonl');

const { executeTool, SANDBOX } = require('../../utils/agentTools');
const fs = require('fs');
const path = require('path');

describe('US-P2.1 — codeRead (sandbox read alignment)', () => {
  test('cto can read a real source file from the MACF tree', () => {
    const r = executeTool('codeRead', { path: 'slack-agents/utils/litellm.js' }, { agentId: 'cto', taskId: 807 });
    expect(r.ok).toBe(true);
    expect(r.content).toContain('chatTurn');
  });

  test('cto can read a .state summary file', () => {
    const r = executeTool('codeRead', { path: 'slack-agents/.state/circuit-breaker.json' }, { agentId: 'cto', taskId: 807 });
    expect(r.ok).toBe(true);
    expect(r.content).toContain('routes');
  });

  test('secret files are denied even for cto', () => {
    const r = executeTool('codeRead', { path: 'slack-agents/.env' }, { agentId: 'cto', taskId: 807 });
    expect(r.ok).toBe(false);
    expect(r.errorClass).toBe('permission');
  });

  test('ungranted agent is refused with permission errorClass', () => {
    const r = executeTool('codeRead', { path: 'slack-agents/utils/litellm.js' }, { agentId: 'cmo', taskId: 807 });
    expect(r.ok).toBe(false);
    expect(r.errorClass).toBe('permission');
  });

  test('paths outside the MACF tree are refused', () => {
    const r = executeTool('codeRead', { path: '../MEMORY.md' }, { agentId: 'cto', taskId: 807 });
    expect(r.ok).toBe(false);
  });

  test('absolute paths are refused', () => {
    const r = executeTool('codeRead', { path: '/etc/passwd' }, { agentId: 'cto', taskId: 807 });
    expect(r.ok).toBe(false);
  });
});

describe('US-P2.6 — webFetch (rendered page text for verification)', () => {
  const { spawn } = require('child_process');
  let stubProc = null;
  let base = null;

  beforeAll(async () => {
    stubProc = spawn(process.execPath, [path.join(__dirname, 'kernel-p2-web-stub.js')], { stdio: ['ignore', 'pipe', 'inherit'] });
    const port = await new Promise((resolve, reject) => {
      let buf = '';
      stubProc.stdout.on('data', (d) => { buf += d; const m = buf.match(/PORT=(\d+)/); if (m) resolve(parseInt(m[1], 10)); });
      stubProc.on('exit', () => reject(new Error('web stub exited')));
      setTimeout(() => reject(new Error('web stub timeout')), 10000);
    });
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(() => { if (stubProc) stubProc.kill(); });

  test('returns readable page text with scripts/styles stripped', () => {
    const r = executeTool('webFetch', { url: `${base}/page` }, { agentId: 'cmo', taskId: 807 });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('October 18');
    expect(r.text).not.toContain('SCRIPTNOISE');
    expect(r.text).not.toContain('color:red');
  });

  test('invalid URL fails cleanly', () => {
    const r = executeTool('webFetch', { url: 'not a url' }, { agentId: 'cmo', taskId: 807 });
    expect(r.ok).toBe(false);
  });
});

describe('US-P2.2 — pdfRead (sandbox PDF text extraction)', () => {
  const pdfName = `p2-pdf-${Date.now()}.pdf`;
  // Minimal valid one-page PDF carrying a known string.
  const pdfBody = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
    '4 0 obj<</Length 58>>stream',
    'BT /F1 18 Tf 72 720 Td (MACF PDF TOOL TEST) Tj ET',
    'endstream endobj',
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
    'trailer<</Root 1 0 R>>',
    '%%EOF',
  ].join('\n');

  test('extracts text from a real PDF in the sandbox', () => {
    fs.writeFileSync(path.join(SANDBOX, pdfName), pdfBody, 'utf8');
    const r = executeTool('pdfRead', { path: pdfName }, { agentId: 'cmo', taskId: 807 });
    expect(r.ok).toBe(true);
    expect(r.text).toContain('MACF PDF TOOL TEST');
    fs.unlinkSync(path.join(SANDBOX, pdfName));
  });

  test('non-PDF input fails cleanly', () => {
    const name = `p2-notpdf-${Date.now()}.txt`;
    fs.writeFileSync(path.join(SANDBOX, name), 'just text', 'utf8');
    const r = executeTool('pdfRead', { path: name }, { agentId: 'cmo', taskId: 807 });
    expect(r.ok).toBe(false);
    fs.unlinkSync(path.join(SANDBOX, name));
  });

  test('missing file fails cleanly', () => {
    const r = executeTool('pdfRead', { path: 'does-not-exist-807.pdf' }, { agentId: 'cmo', taskId: 807 });
    expect(r.ok).toBe(false);
  });
});
