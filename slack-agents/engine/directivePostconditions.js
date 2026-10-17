/**
 * directivePostconditions.js — #807 Phase 3 (US-P3.1/P3.2/P3.3).
 *
 * The #724 contract system verifies Vikunja tasks, but Slack directives —
 * the dominant work flow — finalized on PROXIES: a URL or marker in the
 * reply text, or any tool receipt since the directive arrived. Nothing
 * checked that the artifact the directive actually NAMED exists. That is
 * how "validated" completions shipped without deliverables (the Graham
 * drafts, the #122 design doc, the #658 verdict).
 *
 * This module derives a machine-checkable postcondition set from the
 * directive text itself — deterministically, the same conservatism as
 * taskContract parsing (no prose inference): sandbox-relative artifact
 * paths the directive names (deliverable specs, backticked paths, bare
 * path tokens with deliverable extensions). Finalize verifies them with
 * the completion.js checkers against the real filesystem. An unmet
 * postcondition is a missing_artifacts failure carrying the exact gap —
 * never a completion.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Postcondition outcomes ledger (#807 US-P3.5/P3.6) ─────────────────────
// Every postcondition the finalize gate checks is appended here — pass
// AND fail. This is the ledger the learner and the healer read: delivery
// quality is scored from verified world-state, not from how a reply
// classified. Location mirrors engine/receipts.js stateDir semantics.
function stateDir() {
  if (process.env.MACF_STATE_DIR) return process.env.MACF_STATE_DIR;
  return path.join(__dirname, '..', '.state');
}
function outcomesPath() {
  return process.env.MACF_POSTCONDITION_OUTCOMES_FILE || path.join(stateDir(), 'postcondition-outcomes.jsonl');
}

function recordPostconditionOutcomes(agentId, directiveTs, results) {
  try {
    const file = outcomesPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const at = new Date().toISOString();
    const lines = (results || []).map(r => JSON.stringify({
      at, agentId: agentId || null, directiveTs: directiveTs || null,
      type: r.type, path: r.path || null, url: r.url || null, satisfied: !!r.satisfied,
    })).join('\n');
    if (lines) fs.appendFileSync(file, lines + '\n');
  } catch { /* ledger is evidence plumbing — never break finalize */ }
}

function readOutcomes() {
  try {
    return fs.readFileSync(outcomesPath(), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}

/** Per-agent postcondition stats (optionally since an epoch-ms floor). */
function postconditionStatsByAgent(agentId, sinceMs = 0) {
  const rows = readOutcomes().filter(r => r.agentId === agentId && (Date.parse(r.at) || 0) >= sinceMs);
  const satisfied = rows.filter(r => r.satisfied).length;
  return { checked: rows.length, satisfied, failed: rows.length - satisfied, rate: rows.length ? satisfied / rows.length : 0 };
}

/** Distinct agentIds present in the outcomes ledger. */
function postconditionAgents() {
  return [...new Set(readOutcomes().map(r => r.agentId).filter(Boolean))];
}

/** US-P3.6 headline metric: postconditions verified satisfied on a day (YYYY-MM-DD, UTC). */
function dailyVerifiedPostconditions(dayISO) {
  return readOutcomes().filter(r => r.satisfied && (r.at || '').startsWith(dayISO)).length;
}

const DELIVERABLE_EXT = '(?:md|markdown|txt|pdf|html|json|csv)';
// Path tokens: at least one directory segment, deliverable extension.
// The lookbehind-ish prefix class keeps URLs (http://...) out: a token
// starting right after ':' or '/' of a URL scheme won't match because
// the char before must be a boundary (start, whitespace, quote, tick,
// paren, colon of "deliverable:", etc.) and the first segment cannot
// contain a dot-only host pattern like "example.com/x" — hosts end in a
// TLD segment; requiring the FINAL extension to be a deliverable type
// and at least one path segment keeps ordinary links out in practice.
const PATH_TOKEN_RE = /(?:^|[\s`"'(>])((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:md|markdown|txt|pdf|html|json|csv))(?=$|[\s`"'),.;:\]])/g;
const BARE_FILE_RE = new RegExp('(?:deliverable|file|artifact|path)[:\\s]+\\x60?([A-Za-z0-9_.-]+\\.' + DELIVERABLE_EXT + ')\\x60?', 'gi');

function derivePostconditions(text) {
  if (!text || typeof text !== 'string') return [];
  const found = new Map();
  const add = (p) => {
    if (!p) return;
    if (p.includes('..') || p.startsWith('/') || /^[a-z]+:\/\//i.test(p)) return;
    if (p.split('/').some(seg => !seg || seg === '.')) return;
    found.set(p, { type: 'file_exists', path: p });
  };
  let m;
  PATH_TOKEN_RE.lastIndex = 0;
  while ((m = PATH_TOKEN_RE.exec(text)) !== null) add(m[1]);
  BARE_FILE_RE.lastIndex = 0;
  while ((m = BARE_FILE_RE.exec(text)) !== null) {
    // Bare filenames only count when the directive frames them as a
    // deliverable/file/artifact (the regex anchor) — and they resolve
    // against the sandbox root.
    add(m[1]);
  }
  return [...found.values()];
}

/**
 * Verify postconditions against the world via completion.js CHECKERS.
 * Returns { allSatisfied, results, failures } — results/failures carry
 * the postcondition fields + { satisfied, observed } so a failure reads
 * as the exact, structured gap (US-104 shape).
 */
function verifyPostconditions(postconditions, ctx = {}) {
  const { CHECKERS } = require('./completion');
  const results = [];
  for (const pc of postconditions || []) {
    const checker = CHECKERS[pc.type];
    if (!checker) {
      results.push({ ...pc, satisfied: false, observed: { error: `no checker for ${pc.type}` } });
      continue;
    }
    try {
      const r = checker(pc, ctx);
      results.push({ ...pc, satisfied: !!r.satisfied, observed: r.observed });
    } catch (e) {
      results.push({ ...pc, satisfied: false, observed: { error: e.message.slice(0, 200) } });
    }
  }
  return {
    allSatisfied: results.every(r => r.satisfied),
    results,
    failures: results.filter(r => !r.satisfied),
  };
}

/**
 * The strategy re-route note (US-P3.3): appended to a retried directive's
 * text so the next attempt starts from the observed failure and takes a
 * DIFFERENT approach instead of re-running the failed one verbatim.
 */
function strategyNote(reason, failures, attempt) {
  const gaps = (failures || []).map(f => `${f.type}:${f.path || f.url || ''} observed=${JSON.stringify(f.observed || {})}`).join('; ');
  return `\n\n[RETRY ${attempt} — STRATEGY CHANGE REQUIRED: the previous attempt failed (${reason})${gaps ? ` — unmet postconditions: ${gaps}` : ''}. Do NOT repeat the failed approach. Use different tools or a different path, verify the artifact exists with a tool before replying, and return evidence of the verified result.]`;
}

module.exports = { derivePostconditions, verifyPostconditions, strategyNote, recordPostconditionOutcomes, postconditionStatsByAgent, postconditionAgents, dailyVerifiedPostconditions, outcomesPath };
