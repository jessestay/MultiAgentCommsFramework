'use strict';

/**
 * utils/jesseGate.js — the single Jesse-gate predicate (M3, Vikunja #771).
 *
 * A task is Jesse-gated only when it is ADDRESSED to Jesse: the team may
 * prepare everything around it, but the task itself is his action. The
 * gate is an enumerated allowlist, deliberately narrow:
 *
 * - The title LEADS with a gate marker (an optional [Role] tag may come
 *   first): "[Jesse-gated]", "[needs jesse]", "Jesse action", "Needs
 *   Jesse", "Jesse-only", "For Jesse".
 * - OR the description carries an explicit bracketed tag:
 *   "[Jesse-gated]" or "[needs jesse]".
 *
 * Everything else is team work — including tasks whose title or
 * description mentions an approval STEP inside a workflow (the #82
 * shape: "[CRO] 40 audit outreach drafts → Jesse approval → sends") and
 * tasks whose prose says approval is not required. The pre-M3 rule
 * regex-tested title + description for any of these phrases anywhere,
 * which permanently deadlocked #82 and #122: their contracts were
 * unreachable because the engine refused to work them at all.
 *
 * Both the work engine and the self-healer use THIS module so the two
 * components can never disagree about the gate again.
 */

const GATE_MARKER = '(?:\\[jesse(?:[- ]gated)?\\]|\\[needs jesse\\]|jesse action\\b|needs jesse\\b|jesse-only\\b|for jesse\\b)';
const GATE_TITLE_LEAD_RE = new RegExp(`^\\s*(?:\\[[^\\]]+\\]\\s*)?${GATE_MARKER}`, 'i');
const GATE_DESC_TAG_RE = /\[jesse(?:[- ]gated)?\]|\[needs jesse\]/i;

function isJesseGatedTitle(title) {
  return GATE_TITLE_LEAD_RE.test(String(title || ''));
}

function isJesseGated(task) {
  if (!task) return false;
  if (isJesseGatedTitle(task.title)) return true;
  return GATE_DESC_TAG_RE.test(String(task.description || ''));
}

module.exports = { isJesseGatedTitle, isJesseGated, GATE_TITLE_LEAD_RE, GATE_DESC_TAG_RE };
