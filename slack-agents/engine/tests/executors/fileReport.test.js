/**
 * file-report executor tests (Phase 3, Vikunja #724) — US-107.
 *
 * Mechanical steps: read inputs via executeTool, write the report artifact
 * via executeTool. The model's only step is drafting the body through the
 * typed seam; its output is validated before the write happens.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'file-report-test-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');

const executors = require('../../executors');
const receipts = require('../../receipts');
const { templates } = require('../../taskContract');
const { executeTool, SANDBOX } = require('../../../utils/agentTools');

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

test('reads inputs, drafts via the seam, writes the artifact — all receipted', async () => {
  const tid = 830000 + Math.floor(Math.random() * 9999);
  const stamp = Date.now();
  const inputName = `inputs/source-${stamp}.md`;
  const outputPath = `reports/file-report-${stamp}.md`;
  executeTool('fileWrite', { path: inputName, content: 'Raw finding: pricing page lists $49.' }, { agentId: 'cmo', taskId: tid });

  const contract = templates.fileReport({ taskId: tid, path: outputPath, minBytes: 10, inputs: [inputName] });
  const task = { id: tid, title: 'Write the pricing report', description: '' };

  let generateInput = null;
  const generate = async ({ input }) => {
    generateInput = input;
    return { ok: true, value: { body: '# Pricing report\n\nThe pricing page lists $49 (verified from source).', summary: 'Pricing report written from 1 source.' } };
  };

  const out = await executors.dispatch('file-report', { task, contract, agentId: 'cmo', generate });

  expect(out.ok).toBe(true);
  expect(generateInput).toMatch(/\$49/); // the model saw data the code fetched
  expect(fs.readFileSync(path.join(SANDBOX, outputPath), 'utf8')).toMatch(/Pricing report/);
  expect(out.deliverable.artifactRefs).toEqual([outputPath]);
  const tools = receipts.receiptsForTask(tid).map(r => r.tool);
  expect(tools).toContain('fileRead');
  expect(tools.filter(t => t === 'fileWrite').length).toBeGreaterThanOrEqual(2); // input seed + report
  fs.unlinkSync(path.join(SANDBOX, outputPath));
  fs.unlinkSync(path.join(SANDBOX, inputName));
});

test('draft failure → no artifact written, receipts for the reads stand', async () => {
  const tid = 840000 + Math.floor(Math.random() * 9999);
  const stamp = Date.now();
  const inputName = `inputs/source2-${stamp}.md`;
  const outputPath = `reports/file-report-fail-${stamp}.md`;
  executeTool('fileWrite', { path: inputName, content: 'data' }, { agentId: 'cmo', taskId: tid });

  const contract = templates.fileReport({ taskId: tid, path: outputPath, minBytes: 10, inputs: [inputName] });
  const task = { id: tid, title: 'Write the pricing report', description: '' };
  const generate = async () => ({ ok: false, errorClass: 'invalid_deliverable', validationErrors: [] });

  const out = await executors.dispatch('file-report', { task, contract, agentId: 'cmo', generate });

  expect(out.ok).toBe(false);
  expect(fs.existsSync(path.join(SANDBOX, outputPath))).toBe(false);
  fs.unlinkSync(path.join(SANDBOX, inputName));
});
