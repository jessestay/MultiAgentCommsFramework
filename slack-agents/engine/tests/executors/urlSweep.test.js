/**
 * url-sweep executor tests (Phase 3, Vikunja #724) — US-107.
 *
 * Design: docs/code-enforced-tool-use-design.md, Pillar 5.
 * Mechanical steps (urlCheck per URL) run as code and are ALL receipted
 * before the single typed model call that summarizes observed differences.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'url-sweep-test-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');

const executors = require('../../executors');
const receipts = require('../../receipts');
const { templates } = require('../../taskContract');

// The stub server runs in a CHILD PROCESS: urlCheck is a synchronous curl
// (execFileSync), which blocks this process's event loop — an in-process
// server could never answer it (the same deadlock completion.js avoids by
// checking http_status asynchronously).
const { spawn } = require('child_process');
let serverProc;
let baseUrl;
beforeAll(async () => {
  const port = 19000 + Math.floor(Math.random() * 900);
  baseUrl = `http://127.0.0.1:${port}`;
  const code = `const http=require('http');http.createServer((req,res)=>{if(req.url==='/a'){res.writeHead(200);res.end('a')}else if(req.url==='/b'){res.writeHead(200);res.end('b')}else{res.writeHead(404);res.end('nope')}}).listen(${port},'127.0.0.1')`;
  serverProc = spawn('node', ['-e', code], { stdio: 'ignore' });
  // Wait until it answers.
  for (let i = 0; i < 50; i++) {
    try {
      const out = require('child_process').execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '2', `${baseUrl}/a`], { encoding: 'utf8' });
      if (out.trim() === '200') return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('stub server did not come up');
});
afterAll(async () => {
  if (serverProc) serverProc.kill();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('all URLs are checked via executeTool (receipted) BEFORE the single model call', async () => {
  const tid = 810000 + Math.floor(Math.random() * 9999);
  const urls = [`${baseUrl}/a`, `${baseUrl}/b`, `${baseUrl}/missing`];
  const contract = templates.urlSweep({ taskId: tid, urls });
  const task = { id: tid, title: 'Sweep the pricing pages', description: '' };

  let receiptsAtGenerateTime = -1;
  let generateCalls = 0;
  const generate = async ({ input }) => {
    generateCalls++;
    receiptsAtGenerateTime = receipts.receiptsForTask(tid).filter(r => r.tool === 'urlCheck').length;
    const results = JSON.parse(input).results;
    return { ok: true, value: { status: 'produced', summary: `Swept ${results.length} URLs.`, results } };
  };

  const out = await executors.dispatch('url-sweep', { task, contract, agentId: 'cmo', generate });

  expect(out.ok).toBe(true);
  expect(generateCalls).toBe(1); // the model is invoked at most once
  expect(receiptsAtGenerateTime).toBe(3); // every mechanical step landed first
  const urlReceipts = receipts.receiptsForTask(tid).filter(r => r.tool === 'urlCheck');
  expect(urlReceipts).toHaveLength(3);
  expect(out.deliverable.results).toHaveLength(3);
  expect(out.deliverable.results.map(r => r.httpCode)).toEqual([200, 200, 404]);
  expect(out.response).toBe('Swept 3 URLs.');
});

test('generative-step failure leaves the receipts standing and completes nothing', async () => {
  const tid = 820000 + Math.floor(Math.random() * 9999);
  const urls = [`${baseUrl}/a`];
  const contract = templates.urlSweep({ taskId: tid, urls });
  const task = { id: tid, title: 'Sweep one page', description: '' };
  const generate = async () => ({ ok: false, errorClass: 'invalid_deliverable', validationErrors: [{ path: '$', expected: 'JSON', received: 'text' }] });

  const out = await executors.dispatch('url-sweep', { task, contract, agentId: 'cmo', generate });

  expect(out.ok).toBe(false);
  expect(out.errorClass).toBe('invalid_deliverable');
  expect(receipts.receiptsForTask(tid).filter(r => r.tool === 'urlCheck')).toHaveLength(1);
});
