// utils/stepClassifier.js — Phase A, US-A5 (Vikunja #789).
//
// Classifies step failures so the retry machinery can tell apart:
//   - 'empty'         — the route answered with nothing (HTTP 200, empty
//                       content, or a chain that exhausted on empties).
//                       Retryable: the step, not the delegation, failed.
//   - 'transport'     — timeouts, connection resets, socket errors.
//                       Retryable: the route hiccuped, work is preserved.
//   - 'non_retryable' — permission / auth / invalid-input failures.
//                       Retrying cannot fix these; fail the step.
//
// A turn result is an 'empty' failure when it carries no tool calls and
// its text is empty or whitespace-only (US-C1's rule, applied at the step
// boundary): an empty turn must never be appended to a conversation or a
// checkpoint as if it were an answer.

function classifyTurnResult(turn) {
  const t = turn && typeof turn === 'object' ? turn : {};
  const calls = Array.isArray(t.toolCalls) ? t.toolCalls : [];
  const text = typeof t.text === 'string' ? t.text : '';
  if (calls.length > 0 || text.trim().length > 0) return { ok: true };
  return { ok: false, kind: 'empty', retryable: true };
}

const NON_RETRYABLE_RE = /permission|unauthori[sz]ed|\b401\b|\b403\b|invalid[_\s-]?input|invalid request|forbidden/i;
const TRANSPORT_RE = /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|socket hang up|network error/i;
const EMPTY_RE = /empty/i;

function classifyStepError(err) {
  const msg = String((err && err.message) || err || '');
  if (NON_RETRYABLE_RE.test(msg)) return { kind: 'non_retryable', retryable: false };
  if (TRANSPORT_RE.test(msg)) return { kind: 'transport', retryable: true };
  if (EMPTY_RE.test(msg) || /all models failed/i.test(msg)) return { kind: 'empty', retryable: true };
  // Unknown errors keep the pre-Phase-A caller behavior: the step retry
  // loop in generateWithTools treats only empty/chain-exhaustion errors
  // as retryable, so an unrecognized error is not retried blindly.
  return { kind: 'non_retryable', retryable: false };
}

module.exports = { classifyTurnResult, classifyStepError };
