/**
 * Receipts Ledger (Oct 12, 2026 — Vikunja #724, Pillar 1)
 *
 * Design: docs/code-enforced-tool-use-design.md.
 *
 * Every tool execution through executeTool() issues a structured receipt at
 * the moment it happens. Completion, demo qualification, and telemetry read
 * THIS ledger — never an agent's prose. Receipts are append-only JSONL in
 * the canonical state dir (.receipts.jsonl; MACF_RECEIPTS_FILE overrides for
 * test isolation, mirroring the auditor's MACF_TOOL_AUDIT_GAP_FILE pattern).
 *
 * Issuance is fail-open for tool execution (a ledger write failure must
 * never break a tool call) but readers fail closed: if the ledger cannot be
 * read, completion verification treats postconditions as unsatisfied.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENGINE_DIR = __dirname;

// Same resolution as utils/state.js: env overrides win; the macf live-state
// dir is canonical for every user when it exists.
function stateDir() {
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) return process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (process.env.MACF_STATE_DIR) return process.env.MACF_STATE_DIR;
  const canonical = '/home/macf/workspace/macf/slack-agents/.state';
  try { if (fs.existsSync(canonical)) return canonical; } catch { /* fall through */ }
  return path.join(process.env.HOME || '/home/hatch', 'workspace', 'macf', 'slack-agents', '.state');
}

function receiptsFile() {
  return process.env.MACF_RECEIPTS_FILE || path.join(stateDir(), '.receipts.jsonl');
}

// Canonical JSON (sorted keys, recursive) so argsHash is stable across
// key-order differences in model-produced argument objects.
function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Redact bulky bodies: a fileWrite's content is summarized as its byte
// count so the ledger stays small; other fields pass through.
function summarizeArgs(args) {
  const out = {};
  for (const [k, v] of Object.entries(args || {})) {
    if (k === 'content' && typeof v === 'string') out[k] = { bytes: Buffer.byteLength(v) };
    else out[k] = v;
  }
  return out;
}

// Artifacts an execution produced, derived from the tool result — the
// record of an effect, made by the code that performed it.
function artifactsFor(tool, args, result) {
  if (!result) return [];
  if (tool === 'fileWrite' && result.ok && result.path) {
    let sha = null;
    try { sha = sha256Hex(fs.readFileSync(result.path)); } catch { /* file may race; hash the input */ }
    if (!sha && args && typeof args.content === 'string') sha = sha256Hex(args.content);
    return [{ kind: 'file', ref: result.path, sha256: sha, bytes: result.size != null ? result.size : (args && args.content ? Buffer.byteLength(args.content) : 0) }];
  }
  if (tool === 'urlCheck' && result.httpCode != null) {
    return [{ kind: 'http_check', ref: (args && args.url) || result.url, httpCode: result.httpCode }];
  }
  return [];
}

function newReceiptId() {
  return `rcpt_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

function appendReceipt(receipt) {
  try {
    const file = receiptsFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(receipt) + '\n');
    try { fs.chmodSync(file, 0o644); } catch { /* best effort */ }
    // Rotation discipline (same pattern as the auditor log): past ~5MB keep
    // the newest 3000 lines.
    try {
      const st = fs.statSync(file);
      if (st.size > 5 * 1024 * 1024) {
        const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
        fs.writeFileSync(file, lines.slice(-3000).join('\n') + '\n');
        try { fs.chmodSync(file, 0o644); } catch { /* best effort */ }
      }
    } catch { /* best effort */ }
  } catch { /* fail-open: a ledger failure must never break a tool call */ }
  return receipt;
}

/**
 * Issue a receipt for one executeTool() execution. Called on EVERY exit
 * path of executeTool — success, tool failure, validation failure, and the
 * unknown-tool path (the #722 early-return blind spot must not regress).
 */
function issueReceipt({ agentId = null, taskId = null, tool, args = {}, result = {}, errorClass = null, durationMs = null } = {}) {
  let cls = errorClass || result.errorClass || null;
  if (!result.ok && !cls) {
    // Classify with the auditor's taxonomy (lazy require: the auditor
    // requires this module for its receipts-mode summary — avoid a cycle).
    try { cls = require('./toolUsageAuditor').classifyToolError(result.error).cls; } catch { cls = 'other'; }
  }
  const receipt = {
    receiptId: newReceiptId(),
    ts: new Date().toISOString(),
    agentId,
    taskId,
    tool,
    argsHash: sha256Hex(canonicalStringify(args || {})),
    argsSummary: summarizeArgs(args),
    status: result.ok ? 'ok' : 'error',
    errorClass: result.ok ? null : cls,
    durationMs: durationMs != null ? durationMs : (result.durationMs != null ? result.durationMs : null),
    artifacts: result.ok || tool === 'urlCheck' ? artifactsFor(tool, args, result) : [],
  };
  return appendReceipt(receipt);
}

/**
 * Record an effect that happens outside executeTool (a Slack post, a
 * Vikunja write) so completions and demos can rest on it too.
 */
function recordExternalReceipt({ agentId = null, taskId = null, kind, ref, extra = {} } = {}) {
  const receipt = {
    receiptId: newReceiptId(),
    ts: new Date().toISOString(),
    agentId,
    taskId,
    tool: `external:${kind}`,
    argsHash: sha256Hex(canonicalStringify({ kind, ref })),
    argsSummary: { kind, ref },
    status: 'ok',
    errorClass: null,
    durationMs: null,
    artifacts: [{ kind, ref, ...extra }],
  };
  return appendReceipt(receipt);
}

// ─── Reads (fail closed: read errors propagate to the caller) ───────────────

function readAllReceipts() {
  const file = receiptsFile();
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    // Fail closed (Pillar 1): a corrupt ledger line means the ledger cannot
    // be trusted — readers throw rather than treating evidence as absent.
    out.push(JSON.parse(line));
  }
  return out;
}

function receiptsForTask(taskId, { since } = {}) {
  const all = readAllReceipts().filter(r => r.taskId === taskId || String(r.taskId) === String(taskId));
  if (!since) return all;
  const cutoff = new Date(since).getTime();
  return all.filter(r => new Date(r.ts).getTime() >= cutoff);
}

function artifactsForTask(taskId, kind) {
  const out = [];
  for (const r of receiptsForTask(taskId)) {
    for (const a of r.artifacts || []) {
      if (!kind || a.kind === kind) out.push({ ...a, receiptId: r.receiptId, agentId: r.agentId, ts: r.ts });
    }
  }
  return out;
}

function hasSuccessfulTool(taskId, tool) {
  return receiptsForTask(taskId).some(r => r.tool === tool && r.status === 'ok');
}

// Telemetry over the ledger (US-109): per-agent / per-class / per-tool
// counts computed from recorded events, exactly matching the ledger.
function summarizeFromReceipts(windowHours = 24) {
  const out = { windowHours, total: 0, byType: {}, byClass: {}, byAgent: {}, autoFixed: 0, recent: [] };
  const cutoff = Date.now() - windowHours * 3600 * 1000;
  for (const r of readAllReceipts()) {
    if (new Date(r.ts).getTime() < cutoff) continue;
    out.total++;
    out.byType[r.tool] = (out.byType[r.tool] || 0) + 1;
    if (r.agentId) out.byAgent[r.agentId] = (out.byAgent[r.agentId] || 0) + 1;
    if (r.errorClass) out.byClass[r.errorClass] = (out.byClass[r.errorClass] || 0) + 1;
    out.recent.push(r);
  }
  out.recent = out.recent.slice(-10);
  return out;
}

module.exports = {
  issueReceipt,
  recordExternalReceipt,
  receiptsForTask,
  artifactsForTask,
  hasSuccessfulTool,
  readAllReceipts,
  summarizeFromReceipts,
  // test hooks
  _receiptsFile: receiptsFile,
  _canonicalStringify: canonicalStringify,
};
