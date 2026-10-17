/**
 * Completion Verification (Oct 12, 2026 — Vikunja #724, Pillar 2)
 *
 * Design: docs/code-enforced-tool-use-design.md, Pillar 2.
 *
 * "Done" is a transition the engine takes when the world checks out — not
 * a string the model emits. This module owns:
 *   - the postcondition checker registry: each checker consults the WORLD
 *     (filesystem, live HTTP) or the LEDGER (engine/receipts.js) and
 *     returns { satisfied, observed } with the ground-truth value;
 *   - verifyTask(): contract requiredTools + postconditions → structured
 *     results/failures (US-104: failures are data the next attempt reads);
 *   - completeVerifiedTask(): the VERIFYING → DONE transition.
 *
 * vikunja.completeTask() has exactly ONE call site in the codebase: inside
 * completeVerifiedTask / completeLegacyTask below (grep-verifiable). The
 * deliverable text is never consulted here — a glowing fake "deliverable"
 * alongside failing postconditions verifies nothing.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// (http_status uses async execFile — see the checker)

const ENGINE_DIR = __dirname;

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sandboxDir() {
  return require('../utils/agentTools').SANDBOX;
}

// ─── Postcondition checkers ─────────────────────────────────────────────────
// Each: (postcondition, ctx) → { satisfied, observed }. ctx = { taskId }.
// Result objects spread the postcondition's own fields (type, url, path…)
// so a failure reads exactly like US-104's structured shape:
//   { type: 'http_status', url, expected: [200], observed: 404 }

const CHECKERS = {
  // Ground truth: the filesystem, cross-checked against the ledger hash.
  file_exists(pc, ctx) {
    const resolved = path.join(sandboxDir(), pc.path || '');
    let st = null;
    try { st = fs.statSync(resolved); } catch { /* missing */ }
    if (!st) return { satisfied: false, observed: { exists: false, size: 0 } };
    const size = st.size;
    const observed = { exists: true, size };
    if (size < (pc.minBytes || 0)) return { satisfied: false, observed };
    // If a receipt recorded a hash for this file on this task, the bytes on
    // disk must still be the bytes the agent actually wrote.
    try {
      const receipts = require('./receipts');
      const arts = receipts.artifactsForTask(ctx.taskId, 'file')
        .filter(a => a.ref === resolved && a.sha256);
      if (arts.length) {
        const expectedSha = arts[arts.length - 1].sha256;
        const actualSha = sha256Hex(fs.readFileSync(resolved));
        observed.sha256 = actualSha;
        observed.expectedSha256 = expectedSha;
        if (actualSha !== expectedSha) return { satisfied: false, observed };
      }
    } catch (e) {
      // Ledger unreadable → fail closed (Pillar 1).
      return { satisfied: false, observed: { ...observed, ledgerError: e.message } };
    }
    return { satisfied: true, observed };
  },

  // Ground truth: a live HTTP check through the same curl path as urlCheck.
  // Async (execFile, not execFileSync): a sync call would freeze the engine
  // event loop for up to 10s per check — and deadlock outright when the
  // target is served by this same process.
  async http_status(pc) {
    const { execFile } = require('child_process');
    let code = 0;
    try {
      const { stdout } = await new Promise((resolve, reject) => {
        execFile('curl', [
          '-s', '-o', '/dev/null', '-w', '%{http_code}',
          '--max-time', '10', '--max-redirs', '3', '-L',
          // Loopback must never ride the egress proxy (it blackholes local
          // addresses — the same trap litellm.tunnelProxyUrl guards against).
          '--noproxy', '127.0.0.1,localhost',
          pc.url,
        ], { encoding: 'utf8', timeout: 15000 }, (err, stdout, stderr) => {
          // curl exits non-zero on some HTTP outcomes only with -f; without
          // it, stdout carries the code even for 4xx/5xx. A hard transport
          // failure leaves stdout empty → code 0.
          if (stdout) resolve({ stdout });
          else reject(err || new Error('curl produced no output'));
        });
      });
      code = parseInt(String(stdout).trim(), 10) || 0;
    } catch { code = 0; }
    const expect = Array.isArray(pc.expect) ? pc.expect : [200];
    return { satisfied: expect.includes(code), observed: code, expected: expect };
  },

  // Ground truth: the receipts ledger. pc.tool '*' matches any tool
  // (the floor contract's "at least one real execution" bar, M3).
  receipt_count(pc, ctx) {
    const receipts = require('./receipts');
    const count = receipts.receiptsForTask(ctx.taskId)
      .filter(r => (pc.tool === '*' || r.tool === pc.tool) && (!pc.status || r.status === pc.status)).length;
    return { satisfied: count >= (pc.min || 1), observed: count, expected: pc.min || 1 };
  },

  // Ground truth: Vikunja itself.
  async vikunja_task_exists(pc) {
    try {
      const vikunja = require('../utils/vikunja');
      const t = await vikunja.getTask('execPM', pc.taskId);
      return { satisfied: !!t, observed: t ? { exists: true, id: t.id } : { exists: false } };
    } catch (e) {
      return { satisfied: false, observed: { exists: false, error: e.message } };
    }
  },

  // Ground truth: an external-effect receipt (e.g. a Slack post) exists.
  artifact_posted(pc, ctx) {
    const receipts = require('./receipts');
    const arts = receipts.artifactsForTask(ctx.taskId, pc.kind);
    return { satisfied: arts.length >= 1, observed: { count: arts.length, kind: pc.kind } };
  },
};

// ─── Verification ───────────────────────────────────────────────────────────

/**
 * verifyTask({ taskId, contract, agentId, ...ignored }) →
 *   { satisfied, results: [...], failures: [...] }
 * Extra context (deliverable text, model claims) is accepted and IGNORED:
 * checkers consult the world and the ledger only.
 */
async function verifyTask({ taskId, contract } = {}) {
  const results = [];
  const c = contract || {};
  const ctx = { taskId };

  for (const req of c.requiredTools || []) {
    const receipts = require('./receipts');
    const count = receipts.receiptsForTask(taskId)
      .filter(r => r.tool === req.tool && r.status === 'ok').length;
    results.push({
      type: 'required_tool', tool: req.tool,
      satisfied: count >= (req.minSuccess || 1),
      observed: count, expected: req.minSuccess || 1,
    });
  }

  for (const pc of c.postconditions || []) {
    const checker = CHECKERS[pc.type];
    if (!checker) {
      // Unknown postcondition type fails closed — never silently skipped.
      results.push({ ...pc, satisfied: false, observed: { error: `unknown postcondition type: ${pc.type}` } });
      continue;
    }
    try {
      const r = await checker(pc, ctx);
      results.push({ ...pc, satisfied: !!r.satisfied, observed: r.observed, ...(r.expected !== undefined ? { expected: r.expected } : {}) });
    } catch (e) {
      results.push({ ...pc, satisfied: false, observed: { error: e.message } });
    }
  }

  const failures = results.filter(r => !r.satisfied);
  return { satisfied: failures.length === 0, results, failures };
}

/**
 * The VERIFYING → DONE transition — and the ONLY place in the codebase
 * that calls vikunja.completeTask for contracted work. Verifies first;
 * completes only when every check passes.
 *
 * LOOP GUARD (M3, Vikunja #771): a LOOP task (title "LOOP: ...") is
 * recurring — a verified run completes the RUN, never the task. The
 * pre-#724 prose path had this guard; the #724 rewrite dropped it, so
 * verified loop tasks were being marked done and never ran again. For
 * a LOOP task this returns completed:true with loop:true and does NOT
 * call vikunja.completeTask; the caller returns the task to OPEN.
 */
async function completeVerifiedTask({ taskId, contract, agentId = null, taskTitle = '' } = {}) {
  const verdict = await verifyTask({ taskId, contract });
  if (!verdict.satisfied) {
    return { completed: false, results: verdict.results, failures: verdict.failures };
  }
  // Auditable completion (M3, US-9): every verified completion carries
  // a verification ID derived from the verdict itself, so the
  // completion message and the task record cite the proof, not a claim.
  const verificationId = `ver_${taskId}_${sha256Hex(Buffer.from(
    JSON.stringify(verdict.results) + '|' + new Date().toISOString()
  )).slice(0, 10)}`;
  if (/^LOOP:/i.test(String(taskTitle || ''))) {
    return { completed: true, loop: true, verificationId, results: verdict.results, failures: [] };
  }
  const vikunja = require('../utils/vikunja');
  await vikunja.completeTask('execPM', taskId);
  return { completed: true, verificationId, results: verdict.results, failures: [] };
}

/**
 * Legacy (uncontracted) completion — Phase 2 transitional. The legacy path
 * in workEngine routes through here so vikunja.completeTask keeps a single
 * home while uncontracted tasks still complete under the old protocol.
 * Removed with the legacy path in Phase 3.
 */
async function completeLegacyTask(taskId) {
  const vikunja = require('../utils/vikunja');
  return vikunja.completeTask('execPM', taskId);
}

// ─── BLOCKED gap ────────────────────────────────────────────────────────────
// Same file/shape the tool auditor and self-healer already read.

function gapFile() {
  return process.env.MACF_TOOL_AUDIT_GAP_FILE || path.join(ENGINE_DIR, '.engine-gaps.json');
}

function recordVerificationBlocked({ taskId, agentId = null, failures = [] } = {}) {
  try {
    const file = gapFile();
    let gaps = [];
    try { gaps = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { gaps = []; }
    if (!Array.isArray(gaps)) gaps = [];
    const cutoff = Date.now() - 3600 * 1000;
    const existing = gaps.find(g =>
      g.source === 'completion' && g.type === 'VERIFICATION_BLOCKED' &&
      g.taskId === taskId && new Date(g.timestamp).getTime() > cutoff);
    const detail = `task #${taskId} BLOCKED: verification failed after max attempts — ` +
      failures.map(f => `${f.type}${f.tool ? ':' + f.tool : ''} observed=${JSON.stringify(f.observed)}`).join('; ').slice(0, 300);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.lastSeen = new Date().toISOString();
      existing.message = detail;
    } else {
      gaps.push({
        timestamp: new Date().toISOString(),
        source: 'completion',
        type: 'VERIFICATION_BLOCKED',
        agent: agentId,
        taskId,
        errorClass: 'verification_failed',
        count: 1,
        message: detail,
      });
    }
    fs.writeFileSync(file, JSON.stringify(gaps.slice(-200), null, 2));
    try { fs.chmodSync(file, 0o644); } catch { /* best effort */ }
  } catch { /* fail-open: gap logging must never break the engine */ }
}

module.exports = {
  CHECKERS,
  verifyTask,
  completeVerifiedTask,
  completeLegacyTask,
  recordVerificationBlocked,
};
