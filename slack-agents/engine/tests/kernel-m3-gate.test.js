/**
 * engine/tests/kernel-m3-gate.test.js
 *
 * M3 of the execution kernel (Vikunja #771) — Jesse-gate narrowing.
 * Spec: EXECUTION-KERNEL-SPEC.md, US-5 (universal contracts): the gate
 * regex /jesse action|needs jesse|jesse-only|jesse approval/i was tested
 * against title + description, so any task whose prose mentioned an
 * approval step (tasks #82 and #122 are the live examples) was treated
 * as Jesse-gated forever and could never be worked or contracted.
 *
 * The gate is now an enumerated allowlist: a task is Jesse-gated only
 * when it is ADDRESSED to Jesse — a gate marker leading the title
 * (optionally after a [Role] tag), or an explicit [Jesse-gated] /
 * [needs jesse] tag in the description. Incidental prose about an
 * approval step inside a team workflow never gates the task.
 *
 * BDD scenarios use the real #82/#122 shapes verbatim.
 */
'use strict';

const { isJesseGatedTitle, isJesseGated: isGatedUtil } = require('../../utils/jesseGate');
const workEngine = require('../workEngine');

const TASK_82 = {
  title: '[CRO] 40 audit outreach drafts → Jesse approval → sends',
  description: 'Convert the 40 parallel audit outreach drafts into a closed pipeline: ' +
    'drafts complete → Jesse approval → sends → replies triaged. ACCEPTANCE CRITERIA: ' +
    '40 personalized AI audit outreach drafts completed (draft stage, NOT sent without Jesse approval).',
};
const TASK_122 = {
  title: 'Build n8n troll-overfeeding automation (draft mode)',
  description: 'Jesse-direct request. Source: TikTok video. Build the automation in draft mode; ' +
    'nothing goes live without review.',
};

describe('M3 Jesse-gate: workflow tasks mentioning an approval step are NOT gated', () => {
  test('Given task #82 (approval is a step in a team workflow), then it is not gated', () => {
    expect(isGatedUtil(TASK_82)).toBe(false);
    expect(workEngine.isJesseGated(TASK_82)).toBe(false);
  });
  test('Given task #122 (gate words only in description prose), then it is not gated', () => {
    expect(isGatedUtil(TASK_122)).toBe(false);
    expect(workEngine.isJesseGated(TASK_122)).toBe(false);
  });
  test('Given incidental approval prose in a description, then it is not gated', () => {
    expect(isGatedUtil({
      title: 'Routine internal report',
      description: 'Jesse approval is not required for this draft. Do not wait on Jesse approval.',
    })).toBe(false);
  });
});

describe('M3 Jesse-gate: tasks addressed to Jesse ARE gated', () => {
  test('Given a title leading with a gate marker after a role tag, then gated', () => {
    expect(isGatedUtil({ title: '[CEO] Jesse action: sign the partnership agreement', description: '' })).toBe(true);
    expect(workEngine.isJesseGated({ title: '[CEO] Jesse action: sign the partnership agreement', description: '' })).toBe(true);
  });
  test('Given a title leading with "Needs Jesse", then gated', () => {
    expect(isJesseGatedTitle('Needs Jesse: approve the Q4 budget')).toBe(true);
  });
  test('Given a [Jesse-gated] title tag, then gated', () => {
    expect(isJesseGatedTitle('[Jesse-gated] Renew the SSL certificate')).toBe(true);
  });
  test('Given an explicit [Jesse-gated] tag in the description, then gated', () => {
    expect(isGatedUtil({
      title: 'Prepare the board packet',
      description: '[Jesse-gated] Do not file until Jesse signs.',
    })).toBe(true);
  });
  test('Given a dormant task, then the workEngine gate stays off (existing override)', () => {
    expect(workEngine.isJesseGated({
      title: 'Jesse action: parked item',
      description: 'Status: on hold per HOLD-001.',
    })).toBe(false);
  });
});
