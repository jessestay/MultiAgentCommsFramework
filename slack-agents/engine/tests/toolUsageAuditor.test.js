/**
 * Tool Usage Auditor tests (Oct 12, 2026 — Vikunja #722)
 *
 * Jesse's requirement: know the SECOND an agent could use a tool and doesn't,
 * or tries and can't — with the why, and an automatic fix where possible.
 * These tests pin every detection class, every error classification, and
 * both auto-fix paths (chmod, mkdir) against real filesystem state.
 *
 * Isolation: MACF_STATE_DIR + MACF_TOOL_AUDIT_GAP_FILE point at a temp dir
 * BEFORE any module loads, so tests never touch production state or gaps.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-audit-test-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');

const auditor = require('../toolUsageAuditor');
const { SANDBOX } = require('../../utils/agentTools');

const AUDIT_LOG = path.join(TMP, '.tool-usage-audit.jsonl');
function auditEntries() {
  if (!fs.existsSync(AUDIT_LOG)) return [];
  return fs.readFileSync(AUDIT_LOG, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}
function gapEntries() {
  const f = process.env.MACF_TOOL_AUDIT_GAP_FILE;
  if (!fs.existsSync(f)) return [];
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

afterAll(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('classifyToolError — the "why"', () => {
  test('permission errors are classified and fixable', () => {
    const c = auditor.classifyToolError('EACCES: permission denied, open \'/x/y\'');
    expect(c.cls).toBe('permission');
    expect(c.fixable).toBe(true);
    expect(c.why).toMatch(/ownership\/mode/);
  });
  test('missing paths are not_found and fixable', () => {
    const c = auditor.classifyToolError('ENOENT: no such file or directory, scandir \'/x\'');
    expect(c.cls).toBe('not_found');
    expect(c.fixable).toBe(true);
  });
  test('sandbox traversal blocks are agent errors, not fixable', () => {
    const c = auditor.classifyToolError('Path traversal blocked');
    expect(c.cls).toBe('blocked_path');
    expect(c.fixable).toBe(false);
  });
  test('invalid URLs are agent input errors', () => {
    expect(auditor.classifyToolError('Invalid URL — must start with http:// or https://').cls).toBe('invalid_input');
  });
  test('hallucinated tool names are detected', () => {
    expect(auditor.classifyToolError('Unknown tool: webSearch').cls).toBe('unknown_tool');
  });
  test('network failures are network class', () => {
    expect(auditor.classifyToolError('request timed out after 15000ms').cls).toBe('network');
    expect(auditor.classifyToolError('connect ECONNREFUSED 127.0.0.1:443').cls).toBe('network');
    expect(auditor.classifyToolError('getaddrinfo ENOTFOUND example.invalid').cls).toBe('network');
  });
  test('unrecognized errors fall to other', () => {
    expect(auditor.classifyToolError('something entirely unexpected').cls).toBe('other');
  });
});

describe('detectToolCallAsText — unexecuted calls in final output', () => {
  test('catches the exact task #702 failure pattern', () => {
    const out = "[fileRead(path='/home/sandbox/reports'), fileList(path='/home/sandbox/reports')]";
    expect(auditor.detectToolCallAsText(out)).toBe('fileRead');
  });
  test('catches bare function-call syntax', () => {
    expect(auditor.detectToolCallAsText('I saved it: fileWrite(path="a.txt") done')).toBe('fileWrite');
  });
  test('catches leaked control tokens', () => {
    expect(auditor.detectToolCallAsText('result <|tool_call_start|> [fileList()] <|tool_call_end|>')).toBeTruthy();
  });
  test('catches an unexecuted [TOOL:] line in final text', () => {
    expect(auditor.detectToolCallAsText('[TOOL: urlCheck] {"url": "https://x.com"}')).toBe('urlCheck');
  });
  test('clean deliverable text returns null', () => {
    expect(auditor.detectToolCallAsText('Wrote the report — see sandbox file reports/status.txt and https://example.com [DEMO]')).toBeNull();
    expect(auditor.detectToolCallAsText('')).toBeNull();
    expect(auditor.detectToolCallAsText(null)).toBeNull();
  });
});

describe('hasNarration — intent described instead of done', () => {
  test('catches present-tense narration', () => {
    expect(auditor.hasNarration('Let me check the project state first.')).toBe(true);
    expect(auditor.hasNarration("I'm pulling the workshop details and drafting the post.")).toBe(true);
    expect(auditor.hasNarration("I'll fetch the latest numbers.")).toBe(true);
  });
  test('past-tense completed reporting is not narration', () => {
    expect(auditor.hasNarration('Checked the URL: 200 OK in 0.4s. Report written to reports/status.txt.')).toBe(false);
    expect(auditor.hasNarration('Done. 3 signups today, draft saved.')).toBe(false);
  });
});

describe('taskImpliesTools', () => {
  test('URL and verification tasks imply tools', () => {
    expect(auditor.taskImpliesTools('Verify the link https://example.com still works')).toBe(true);
    expect(auditor.taskImpliesTools('Check the status page for the listing')).toBe(true);
  });
  test('file-producing tasks imply tools', () => {
    expect(auditor.taskImpliesTools('Write the report file for Q3')).toBe(true);
    expect(auditor.taskImpliesTools('Export the leads to a spreadsheet')).toBe(true);
  });
  test('pure composition tasks do not imply tools', () => {
    expect(auditor.taskImpliesTools('Draft a birthday message for the team channel')).toBe(false);
    expect(auditor.taskImpliesTools('Brainstorm names for the new feature')).toBe(false);
  });
});

describe('attemptFix — automatic repair', () => {
  test('permission: chmods a locked-down sandbox file back to readable', () => {
    const name = `fix-perm-${Date.now()}.txt`;
    const full = path.join(SANDBOX, name);
    fs.writeFileSync(full, 'secret data');
    fs.chmodSync(full, 0o000);
    const fix = auditor.attemptFix({ tool: 'fileRead', args: { path: name }, errorClass: 'permission' });
    expect(fix.attempted).toBe(true);
    expect(fix.fixed).toBe(true);
    const mode = fs.statSync(full).mode & 0o777;
    expect(mode & 0o444).toBe(0o444); // world+owner readable again
    fs.chmodSync(full, 0o644);
    fs.unlinkSync(full);
  });
  test('not_found: creates a missing directory for fileList', () => {
    const dir = `fix-missing-${Date.now()}`;
    const full = path.join(SANDBOX, dir);
    expect(fs.existsSync(full)).toBe(false);
    const fix = auditor.attemptFix({ tool: 'fileList', args: { path: dir }, errorClass: 'not_found' });
    expect(fix.fixed).toBe(true);
    expect(fs.existsSync(full)).toBe(true);
    fs.rmdirSync(full);
  });
  test('never touches paths outside the safe roots', () => {
    const fix = auditor.attemptFix({ tool: 'fileRead', args: { path: '/etc/passwd' }, errorClass: 'permission' });
    expect(fix.fixed).toBe(false);
    const fix2 = auditor.attemptFix({ tool: 'fileList', args: { path: '/etc/nope-dir' }, errorClass: 'not_found' });
    expect(fix2.fixed).toBe(false);
  });
  test('non-fixable classes are not attempted', () => {
    const fix = auditor.attemptFix({ tool: 'urlCheck', args: { url: 'x' }, errorClass: 'network' });
    expect(fix.attempted).toBe(false);
  });
});

describe('recordToolEvent — failures recorded the second they happen', () => {
  test('successful results are ignored', () => {
    expect(auditor.recordToolEvent({ tool: 'fileRead', args: {}, result: { ok: true } })).toBeNull();
  });
  test('a failure is classified, logged, and gapped when unfixable', () => {
    const before = auditEntries().length;
    const f = auditor.recordToolEvent({
      tool: 'urlCheck', args: { url: 'not-a-url' },
      result: { ok: false, error: 'Invalid URL — must start with http:// or https://' },
      agentId: 'cto', taskId: 999001,
    });
    expect(f).not.toBeNull();
    expect(f.type).toBe('TOOL_FAILURE');
    expect(f.errorClass).toBe('invalid_input');
    expect(f.detail).toMatch(/why:/);
    expect(auditEntries().length).toBe(before + 1);
    const gaps = gapEntries().filter(g => g.source === 'toolUsageAuditor' && g.type === 'TOOL_FAILURE');
    expect(gaps.length).toBeGreaterThanOrEqual(1);
  });
  test('a fixable failure that gets fixed does NOT open a gap', () => {
    const dir = `fix-gap-${Date.now()}`;
    const gapsBefore = gapEntries().length;
    const f = auditor.recordToolEvent({
      tool: 'fileList', args: { path: dir },
      result: { ok: false, error: `ENOENT: no such file or directory, scandir '${path.join(SANDBOX, dir)}'` },
      agentId: 'cmo', taskId: 999002,
    });
    expect(f.autoFix.fixed).toBe(true);
    expect(fs.existsSync(path.join(SANDBOX, dir))).toBe(true);
    expect(gapEntries().length).toBe(gapsBefore);
    fs.rmdirSync(path.join(SANDBOX, dir));
  });
});

describe('auditGeneration — whole-generation detection', () => {
  const base = { agentId: 'cmo', taskId: 999100, via: 'generateWithTools' };

  test('clean generation: tool used + evidence = zero findings', () => {
    const { findings } = auditor.auditGeneration({
      ...base,
      taskTitle: 'Check the landing page',
      toolEvents: [{ tool: 'urlCheck', args: { url: 'https://x' }, result: { ok: true, httpCode: 200 } }],
      rawOutput: 'Landing page verified: 200 OK. [DEMO] https://example.com',
      outputHasEvidence: true,
    });
    expect(findings).toHaveLength(0);
  });

  test('narration with zero tool calls = MISSED_OPPORTUNITY (real #266 pattern)', () => {
    const { findings } = auditor.auditGeneration({
      ...base,
      taskTitle: 'Draft the X post from the workshop details',
      toolEvents: [],
      rawOutput: "I'm pulling the Muse for Business workshop details and drafting the X post copy based on the current campaign state.",
      outputHasEvidence: false,
    });
    expect(findings.map(f => f.type)).toContain('MISSED_OPPORTUNITY');
  });

  test('tool-call-as-text final output = TOOL_CALL_AS_TEXT (real #702 pattern)', () => {
    const { findings } = auditor.auditGeneration({
      ...base,
      taskTitle: 'Evaluate the PDFs',
      toolEvents: [],
      rawOutput: "[fileRead(path='/home/sandbox/reports'), fileList(path='/home/sandbox/reports')]",
      outputHasEvidence: false,
    });
    expect(findings.map(f => f.type)).toContain('TOOL_CALL_AS_TEXT');
  });

  test('failed tool events surface as TOOL_FAILURE with classification', () => {
    const { findings } = auditor.auditGeneration({
      ...base,
      taskTitle: 'Read the config file',
      toolEvents: [{ tool: 'fileRead', args: { path: '../secret' }, result: { ok: false, error: 'Path traversal blocked' } }],
      rawOutput: 'Could not read the file.',
      outputHasEvidence: false,
    });
    const tf = findings.find(f => f.type === 'TOOL_FAILURE');
    expect(tf).toBeTruthy();
    expect(tf.errorClass).toBe('blocked_path');
  });

  test('text-only path for a tool task = NO_TOOLS_PATH', () => {
    const { findings } = auditor.auditGeneration({
      ...base, via: 'generateReport',
      taskTitle: 'Verify the URL https://example.com/pricing is live',
      toolEvents: [],
      rawOutput: 'The page looks fine.',
      outputHasEvidence: false,
    });
    expect(findings.map(f => f.type)).toContain('NO_TOOLS_PATH');
  });

  test('pure composition task without tools or evidence is NOT flagged', () => {
    const { findings } = auditor.auditGeneration({
      ...base,
      taskTitle: 'Brainstorm names for the new feature',
      toolEvents: [],
      rawOutput: 'Here are five names: Beacon, Lantern, Signal, Northlight, Ember.',
      outputHasEvidence: false,
    });
    expect(findings).toHaveLength(0);
  });

  test('gaps dedupe: repeated identical findings bump one gap entry', () => {
    const mk = () => auditor.auditGeneration({
      ...base, taskId: 999101,
      taskTitle: 'Evaluate the PDFs',
      toolEvents: [],
      rawOutput: "[fileRead(path='/x')]",
      outputHasEvidence: false,
    });
    mk(); mk();
    const gaps = gapEntries().filter(g => g.type === 'TOOL_CALL_AS_TEXT' && g.agent === 'cmo');
    expect(gaps).toHaveLength(1);
    expect(gaps[0].count).toBeGreaterThanOrEqual(2);
  });
});

describe('recordMalformedCall + summarize', () => {
  test('malformed calls are recorded with a model diagnosis', () => {
    const f = auditor.recordMalformedCall({ tool: 'fileWrite', model: 'test-model' });
    expect(f.type).toBe('MALFORMED_TOOL_CALL');
    expect(f.detail).toMatch(/never executed/);
  });
  test('summarize aggregates the recorded window', () => {
    const s = auditor.summarize(24);
    expect(s.total).toBeGreaterThanOrEqual(5);
    expect(s.byType.TOOL_FAILURE).toBeGreaterThanOrEqual(1);
    expect(s.byType.MISSED_OPPORTUNITY).toBeGreaterThanOrEqual(1);
    expect(s.autoFixed).toBeGreaterThanOrEqual(1);
  });
});
