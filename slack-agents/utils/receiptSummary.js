// utils/receiptSummary.js — Phase A, US-A3 (Vikunja #789).
//
// Turns one attempt's tool receipts (engine/receipts.js shape:
// { receiptId, ts, agentId, taskId, tool, status: 'ok'|'error',
//   errorClass, artifacts: [{ kind, ref, ... }] }) into a short
// plain-text summary that rides along on a dead-letter requeue, so the
// fresh attempt starts oriented: what the previous attempt actually did.
//
// Honesty rules (the #758 lesson — claims are not evidence):
//   - artifact refs are listed ONLY from receipts with status 'ok' — a
//     failed execution's artifacts are never claimed as produced;
//   - failed executions are named as failed, never as progress;
//   - an attempt with no receipts, or none that succeeded, states
//     plainly that no tool work completed — it never fabricates.

const MAX_SUMMARY_CHARS = 1000;
const MAX_ARTIFACT_REFS = 10;

function summarizeReceipts(receipts) {
  const list = (Array.isArray(receipts) ? receipts : [])
    .filter(r => r && typeof r === 'object');
  const header = 'Previous attempt (receipt summary):';
  if (list.length === 0) {
    return `${header} no tool work completed — the attempt recorded no tool executions.`;
  }
  const ok = list.filter(r => r.status === 'ok');
  const failed = list.filter(r => r.status !== 'ok');

  const toolCounts = new Map();
  for (const r of list) {
    const tool = r.tool || 'unknown';
    toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
  }
  const toolsPart = `tools executed: ${[...toolCounts.entries()]
    .map(([tool, n]) => (n > 1 ? `${tool} x${n}` : tool)).join(', ')}`;

  const parts = [toolsPart];
  if (ok.length > 0) {
    const refs = [];
    for (const r of ok) {
      for (const a of (Array.isArray(r.artifacts) ? r.artifacts : [])) {
        if (a && a.ref) refs.push(String(a.ref));
      }
    }
    if (refs.length > 0) {
      const shown = refs.slice(0, MAX_ARTIFACT_REFS);
      const extra = refs.length > MAX_ARTIFACT_REFS ? ` (+${refs.length - MAX_ARTIFACT_REFS} more)` : '';
      parts.push(`artifacts produced: ${shown.join(', ')}${extra}`);
    }
  }
  if (failed.length > 0) {
    const failedTools = [...new Set(failed.map(r => r.tool || 'unknown'))].join(', ');
    parts.push(`failed executions: ${failedTools} (${failed.length} failed)`);
  }
  if (ok.length === 0) {
    return `${header} no tool work completed successfully. ${parts.join('; ')}.`;
  }
  const out = `${header} ${parts.join('; ')}.`;
  return out.length > MAX_SUMMARY_CHARS ? `${out.slice(0, MAX_SUMMARY_CHARS - 3)}...` : out;
}

module.exports = { summarizeReceipts };
