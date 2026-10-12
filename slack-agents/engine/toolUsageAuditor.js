/**
 * Tool Usage Auditor (Oct 12, 2026 — Jesse's order, Vikunja #722)
 *
 * Jesse: "We need to know the SECOND an agent could be using a tool and
 * doesn't, or if they try to use a tool and can't, and then we need to know
 * why and it should then automatically be fixed."
 *
 * This module is the always-on watchdog for the agent tool layer:
 *
 * 1. DETECT — every generation through the work engine is audited the moment
 *    it completes, and every tool failure is recorded the moment it happens
 *    (hook in agentTools.executeTool):
 *      - MISSED_OPPORTUNITY: the agent narrated intent ("Let me check...")
 *        or the task plainly needed a tool, but zero tools succeeded and the
 *        output carries no evidence.
 *      - TOOL_CALL_AS_TEXT: the model's final output contains tool-call
 *        syntax that never executed (the task #702 failure, Oct 12: the model
 *        emitted [fileRead(path=...)] as its answer text).
 *      - MALFORMED_TOOL_CALL: the model tried the [TOOL:] format but with
 *        unparseable args, so the call never ran.
 *      - TOOL_FAILURE: a tool ran and returned ok:false — classified by cause.
 *      - NO_TOOLS_PATH: a tool-implying task was routed through the text-only
 *        generation path (the original Oct 12 root cause).
 * 2. DIAGNOSE — tool errors are classified (permission / not_found /
 *    blocked_path / invalid_input / unknown_tool / network / other) so the
 *    "why" is recorded with the event, not guessed later.
 * 3. FIX — fixable classes are repaired immediately and automatically:
 *    permission errors get chmod a+rX on the target inside safe roots;
 *    missing sandbox directories get created. Everything else opens an
 *    engine gap (deduped) for CEO attention.
 * 4. RECORD — findings append to .tool-usage-audit.jsonl in the canonical
 *    state dir and increment per-day counters in the shared state store, so
 *    standup / self-healer / quality learner can see tool health.
 *
 * The auditor never throws into its callers: a broken auditor must not break
 * the work engine. All entry points are fail-open.
 */

const fs = require('fs');
const path = require('path');

const ENGINE_DIR = __dirname;
const GAP_FILE = path.join(ENGINE_DIR, '.engine-gaps.json');

// agentTools computes its SANDBOX from the *calling process's* HOME, so a
// macf-run engine and a root-run cron see different roots. Cover both.
const SANDBOX_CANDIDATES = [...new Set([
  path.join(process.env.HOME || '/home/hatch', 'workspace', 'agent-sandbox'),
  '/home/macf/workspace/agent-sandbox',
  '/home/hatch/workspace/agent-sandbox',
])];

// Roots where an automatic chmod / mkdir is safe. Anything outside these is
// diagnosed and gapped, never touched.
const FIXABLE_ROOTS = [
  ...SANDBOX_CANDIDATES,
  '/home/macf/workspace/macf/slack-agents',
  '/home/hatch/workspace/macf/slack-agents',
  '/home/sandbox/reports',
];

// ─── Text-pattern detectors: DELETED (Oct 12, 2026 — #724, Phase 2) ─────────
// The retire table in docs/code-enforced-tool-use-design.md removes every
// prose-inference detector from this module: hasNarration/NARRATION_PATTERNS,
// detectToolCallAsText/TOOL_CALL_AS_TEXT, taskImpliesTools. Enforcement
// moved into code paths that cannot be talked around:
//   - unexecuted tool-call syntax is rejected by the generateWithTools loop
//     itself (invalid_deliverable), which owns the canonical pattern set;
//   - "could have used a tool" is now known exactly, as receipt absence,
//     by engine/completion.js verification;
//   - this module remains as telemetry over recorded events: tool failures
//     (classified + auto-fixed at execution time), malformed calls, and
//     ledger-backed summarize().

// ─── Error classification (the "why") ────────────────────────────────────────

function classifyToolError(error) {
  const e = String(error || '');
  if (/EACCES|permission denied|EPERM|operation not permitted/i.test(e)) {
    return { cls: 'permission', fixable: true, why: 'the file/directory exists but the running user cannot read or write it (ownership/mode) — the recurring root/macf split' };
  }
  if (/ENOENT|no such file or directory/i.test(e)) {
    return { cls: 'not_found', fixable: true, why: 'the path does not exist — missing directory (auto-creatable) or the agent referenced a file that was never created' };
  }
  if (/traversal|path.*blocked/i.test(e)) {
    return { cls: 'blocked_path', fixable: false, why: 'the agent passed an absolute or parent-traversing path; the sandbox correctly refused — agent must use a relative path' };
  }
  if (/invalid url/i.test(e)) {
    return { cls: 'invalid_input', fixable: false, why: 'the agent passed a malformed URL (missing http/https) — agent input error' };
  }
  if (/unknown tool/i.test(e)) {
    return { cls: 'unknown_tool', fixable: false, why: 'the agent hallucinated a tool name that does not exist in the tool registry' };
  }
  if (/timed?\s?out|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network|socket hang up/i.test(e)) {
    return { cls: 'network', fixable: false, why: 'network-level failure reaching the target (timeout/refused/DNS) — target or egress problem, not an agent error' };
  }
  return { cls: 'other', fixable: false, why: 'unclassified tool error — raw error preserved on the finding' };
}

// ─── Auto-fix ────────────────────────────────────────────────────────────────

function isUnderFixableRoot(p) {
  if (!p) return false;
  const norm = path.normalize(p);
  return FIXABLE_ROOTS.some(root => norm === root || norm.startsWith(root + path.sep));
}

// Resolve the on-disk target for a file tool call across sandbox candidates.
function resolveTargets(args) {
  const raw = (args && (args.path || args.url)) || '';
  if (!raw || /^https?:\/\//i.test(raw)) return [];
  if (path.isAbsolute(raw)) return [raw];
  return SANDBOX_CANDIDATES.map(root => path.join(root, raw));
}

/**
 * Attempt an automatic repair for a classified tool failure.
 * Returns { attempted, fixed, action }.
 */
function attemptFix({ tool, args = {}, errorClass }) {
  try {
    if (errorClass === 'permission') {
      const targets = resolveTargets(args);
      for (const target of targets) {
        if (!isUnderFixableRoot(target)) continue;
        if (!fs.existsSync(target)) continue;
        // Fix the target itself and its parent (EACCES usually bites on the
        // parent directory written by the other user). Only claim success
        // when a chmod actually landed — an existing file is not proof.
        let chmodOk = false;
        for (const p of [target, path.dirname(target)]) {
          try {
            if (fs.existsSync(p)) {
              const st = fs.statSync(p);
              fs.chmodSync(p, st.isDirectory() ? 0o755 : 0o644);
              chmodOk = true;
            }
          } catch { /* try next */ }
        }
        if (chmodOk) {
          return { attempted: true, fixed: true, action: `chmod a+rX on ${target} (+parent)` };
        }
      }
      return { attempted: true, fixed: false, action: 'no fixable target found under safe roots' };
    }
    if (errorClass === 'not_found' && (tool === 'fileList' || tool === 'fileWrite')) {
      const targets = resolveTargets(args);
      let made = 0;
      for (const target of targets) {
        if (!isUnderFixableRoot(target)) continue;
        const dir = tool === 'fileWrite' ? path.dirname(target) : target;
        try { fs.mkdirSync(dir, { recursive: true }); made++; } catch { /* ignore */ }
      }
      if (made > 0) return { attempted: true, fixed: true, action: `created missing director${made > 1 ? 'ies' : 'y'} for ${args.path}` };
      return { attempted: true, fixed: false, action: 'target outside safe roots' };
    }
    return { attempted: false, fixed: false, action: null };
  } catch (e) {
    return { attempted: true, fixed: false, action: `fix error: ${e.message.slice(0, 120)}` };
  }
}

// ─── Recording ───────────────────────────────────────────────────────────────

function stateDir() {
  // Honor the same overrides as utils/state.js (env wins) — also what makes
  // the auditor unit-testable against a throwaway state dir.
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) return process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (process.env.MACF_STATE_DIR) return process.env.MACF_STATE_DIR;
  const canonical = '/home/macf/workspace/macf/slack-agents/.state';
  try { if (fs.existsSync(canonical)) return canonical; } catch { /* fall through */ }
  return path.join(ENGINE_DIR, '.state');
}

function gapFile() {
  return process.env.MACF_TOOL_AUDIT_GAP_FILE || GAP_FILE;
}

function appendAudit(entry) {
  try {
    const file = path.join(stateDir(), '.tool-usage-audit.jsonl');
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    // Bound the log: past ~2MB keep the newest 1500 lines.
    try {
      const st = fs.statSync(file);
      if (st.size > 2 * 1024 * 1024) {
        const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
        fs.writeFileSync(file, lines.slice(-1500).join('\n') + '\n');
        try { fs.chmodSync(file, 0o644); } catch { /* best effort */ }
      }
    } catch { /* best effort */ }
  } catch { /* fail-open: auditing must never break the engine */ }
}

function bumpCounters(findings) {
  try {
    const state = require('../utils/state');
    const day = new Date().toISOString().slice(0, 10);
    const all = state.get('toolAudit', 'counts') || {};
    const today = all[day] || {};
    for (const f of findings) {
      const key = f.errorClass ? `${f.type}:${f.errorClass}` : f.type;
      today[key] = (today[key] || 0) + 1;
      if (f.autoFix && f.autoFix.fixed) today.AUTOFIXED = (today.AUTOFIXED || 0) + 1;
    }
    all[day] = today;
    // Keep 14 days of counters.
    for (const d of Object.keys(all)) {
      if (d < new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)) delete all[d];
    }
    state.set('toolAudit', 'counts', all);
  } catch { /* fail-open */ }
}

// Engine gaps: same file/shape the self-healer and standup already read.
// Deduped by (type, agent, errorClass) within an hour — repeat occurrences
// bump a counter instead of spamming the file.
function openGap(finding) {
  try {
    const file = gapFile();
    let gaps = [];
    try { gaps = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { gaps = [] }
    if (!Array.isArray(gaps)) gaps = [];
    const cutoff = Date.now() - 3600 * 1000;
    const existing = gaps.find(g =>
      g.source === 'toolUsageAuditor' &&
      g.type === finding.type &&
      g.agent === (finding.agentId || null) &&
      (g.errorClass || null) === (finding.errorClass || null) &&
      new Date(g.timestamp).getTime() > cutoff
    );
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.lastSeen = finding.ts;
    } else {
      gaps.push({
        timestamp: finding.ts,
        source: 'toolUsageAuditor',
        type: finding.type,
        agent: finding.agentId || null,
        taskId: finding.taskId || null,
        errorClass: finding.errorClass || null,
        count: 1,
        message: finding.detail,
      });
    }
    fs.writeFileSync(file, JSON.stringify(gaps.slice(-200), null, 2));
  } catch { /* fail-open (engine dir may be read-only for the macf user) */ }
}

function recordFinding(finding) {
  appendAudit(finding);
  bumpCounters([finding]);
  // Gap policy: surface what the auto-fixer could NOT resolve, plus
  // malformed model calls (a model-behavior class Jesse wants visibility
  // on). (TOOL_CALL_AS_TEXT / NO_TOOLS_PATH gaps were deleted with the
  // text detectors in Phase 2 — those failures are now failed attempts in
  // the generation loop and verification failures in completion.js.)
  const needsGap =
    (finding.type === 'TOOL_FAILURE' && !(finding.autoFix && finding.autoFix.fixed)) ||
    finding.type === 'MALFORMED_TOOL_CALL';
  if (needsGap) openGap(finding);
  return finding;
}

// ─── Entry point 1: a single tool event (called by agentTools on failure) ──

/**
 * Record one executed tool call. Successes are ignored here (generation-level
 * audits count them); failures are classified, auto-fixed, and recorded the
 * second they happen.
 */
function recordToolEvent({ tool, args = {}, result = {}, agentId = null, taskId = null } = {}) {
  try {
    if (!result || result.ok) return null;
    const { cls, fixable, why } = classifyToolError(result.error);
    const autoFix = fixable ? attemptFix({ tool, args, errorClass: cls }) : { attempted: false, fixed: false, action: null };
    const finding = {
      ts: new Date().toISOString(),
      type: 'TOOL_FAILURE',
      agentId, taskId, tool,
      errorClass: cls,
      detail: `${tool} failed (${cls}): ${String(result.error || '').slice(0, 160)} — why: ${why}` +
        (autoFix.attempted ? ` | auto-fix: ${autoFix.fixed ? `FIXED (${autoFix.action})` : `failed (${autoFix.action})`}` : ''),
      autoFix,
    };
    return recordFinding(finding);
  } catch { return null; }
}

// ─── Entry point 2: malformed tool call (model tried, format broke) ─────────

function recordMalformedCall({ tool = null, agentId = null, taskId = null, model = null } = {}) {
  try {
    const finding = {
      ts: new Date().toISOString(),
      type: 'MALFORMED_TOOL_CALL',
      agentId, taskId, tool, model,
      errorClass: 'malformed_args',
      detail: `model emitted a tool call for ${tool || 'unknown tool'} with unparseable arguments — the call never executed. ` +
        'Diagnosis: model cannot reliably format tool calls; if this repeats for the same model it needs a model-tier change, not a retry.',
      autoFix: { attempted: false, fixed: false, action: null },
    };
    return recordFinding(finding);
  } catch { return null; }
}

// ─── Entry point 3: whole-generation audit (called by the work engine) ─────

/**
 * Audit one completed generation. Detects missed opportunities, tool-call-as-
 * text leaks, and text-only routing for tool tasks. Tool failures inside
 * toolEvents are also classified/fixed here (belt-and-braces with the
 * executeTool hook, which may not know the agent/task context).
 */
function auditGeneration({ agentId = null, taskId = null, taskTitle = '', taskDescription = '',
  via = 'generateWithTools', toolEvents = [], rawOutput = '', outputHasEvidence = false, model = null } = {}) {
  const findings = [];
  try {
    const events = Array.isArray(toolEvents) ? toolEvents : [];
    const failed = events.filter(e => e && e.result && !e.result.ok);

    // Tool failures with full context — the only generation-level finding
    // left after the Phase 2 detector removal. Everything prose-shaped
    // (narration, tool-call-as-text, tool-implying tasks) is enforced in
    // the generation loop and the completion verifier, not inferred here.
    // (taskTitle/taskDescription/rawOutput/outputHasEvidence/via remain in
    // the signature for caller compatibility; telemetry no longer reads
    // prose.)
    for (const ev of failed) {
      const f = recordToolEvent({ tool: ev.tool, args: ev.args || {}, result: ev.result, agentId, taskId });
      if (f) findings.push(f);
    }
  } catch { /* fail-open */ }
  return { findings };
}

// ─── Summary for standup / self-healer / verification ────────────────────────

function summarize(windowHours = 24) {
  // US-109 (Oct 12, 2026 — #724): telemetry is computed from the receipts
  // ledger (engine/receipts.js) — the auditor is telemetry over recorded
  // events, not a recorder of inferences. Receipts became the DEFAULT in
  // Phase 3 (the Phase 1 flag flip); MACF_AUDIT_SOURCE=legacy restores the
  // old audit-log aggregation for comparison. The receipts mode is
  // fail-closed (a corrupt ledger throws, per Pillar 1).
  if (process.env.MACF_AUDIT_SOURCE !== 'legacy') {
    return require('./receipts').summarizeFromReceipts(windowHours);
  }
  const out = { windowHours, total: 0, byType: {}, byClass: {}, autoFixed: 0, recent: [] };
  try {
    const file = path.join(stateDir(), '.tool-usage-audit.jsonl');
    if (!fs.existsSync(file)) return out;
    const cutoff = Date.now() - windowHours * 3600 * 1000;
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (new Date(e.ts).getTime() < cutoff) continue;
      out.total++;
      out.byType[e.type] = (out.byType[e.type] || 0) + 1;
      if (e.errorClass) out.byClass[e.errorClass] = (out.byClass[e.errorClass] || 0) + 1;
      if (e.autoFix && e.autoFix.fixed) out.autoFixed++;
      out.recent.push(e);
    }
    out.recent = out.recent.slice(-10);
  } catch { /* fail-open */ }
  return out;
}

module.exports = {
  auditGeneration,
  recordToolEvent,
  recordMalformedCall,
  classifyToolError,
  attemptFix,
  summarize,
  // test hooks
  _SANDBOX_CANDIDATES: SANDBOX_CANDIDATES,
  _FIXABLE_ROOTS: FIXABLE_ROOTS,
  _stateDir: stateDir,
};
