/**
 * engine/tests/assessment-evidence.test.js
 *
 * TDD for the assessment-agent dead-letter bug (Oct 6, 2026).
 *
 * BUG: The poller's evidence contract (directivePoll.js `hasVerifiableEvidenceIn`)
 * dead-lettered every directive to written-deliverable agents — CTO sat at 3%
 * delivery (1/32) and Lawyer at 11% (1/9). The agents produced full written
 * assessments via generateReport, but handleDelegation returned no `evidence`
 * / `taskId` field and the text carried no URL/post-ID/metrics, so the gate
 * marked each directive failed, retried 3x, and dead-lettered the work without
 * ever posting it.
 *
 * FIX: cto.js, lawyer.js, cuxo.js, hr.js, jobcoach.js now return an `evidence`
 * marker describing the written deliverable — the same pattern already used by
 * cfo.js ('LLM response (no tool execution)'), cco.js, cro.js, facebook.js and
 * execPM.js.
 *
 * BDD:
 * - Given an assessment agent returns a written deliverable with an evidence
 *   marker, when the poller's evidence gate evaluates it, then it passes and
 *   the directive is marked complete (not dead-lettered).
 * - Given a return with no evidence marker and no verifiable content, when the
 *   gate evaluates it, then it fails (dead-letter path preserved).
 *
 * NOTE: The gate predicate below mirrors directivePoll.js hasVerifiableEvidenceIn
 * (lines ~378-384). Requiring directivePoll.js in tests is unsafe — it runs
 * main() at load. If the real predicate changes, update this mirror.
 */
'use strict';

const path = require('path');
const AGENTS_DIR = path.join(__dirname, '..', '..', 'agents');

// Mirror of the poller's evidence acceptance predicate (directivePoll.js).
function pollerAccepts(result) {
  const text = result?.response || '';
  const evidence = result?.evidence;
  return (
    /https?:\/\/[^\s]+/.test(text) || // URL
    /\b\d{15,20}\b/.test(text) || // Post ID
    /\b\d+\s*(likes|views|clicks|signups|comments|shares)\b/i.test(text) || // Metrics
    !!(evidence && !evidence.includes('Posted response')) || // Real tool evidence
    !!(result && (result.taskId || result.evidence)) // Task or evidence marker
  );
}

// Return shapes as fixed (evidence marker describing the written deliverable).
const FIXED_RETURNS = {
  cto: {
    completed: true,
    response: '[from: CTO → execPM] Assessment text...',
    evidence: 'Technical assessment generated (LLM report, no tool execution)',
  },
  lawyer: {
    completed: true,
    response: '[from: Lawyer → execPM] Guidance text...',
    evidence: 'Legal guidance generated (LLM report, no tool execution)',
  },
  cuxo: {
    completed: true,
    response: '[from: CUXO → execPM] Assessment text...',
    evidence: 'UX assessment generated (LLM report, no tool execution)',
  },
  hr: {
    completed: true,
    response: '[from: HR → execPM] Assessment text...',
    evidence: 'HR assessment generated (LLM report, no tool execution)',
  },
  jobcoach: {
    completed: true,
    response: '[from: Job Coach → execPM] Advice text...',
    evidence: 'Career strategy advice generated (LLM report, no tool execution)',
  },
};

describe('assessment-agent evidence contract', () => {
  for (const [agentId, fixture] of Object.entries(FIXED_RETURNS)) {
    test(`${agentId}: written deliverable with evidence marker passes the poller gate`, () => {
      expect(pollerAccepts(fixture)).toBe(true);
    });
  }

  test('no evidence marker and no verifiable content still fails the gate', () => {
    expect(
      pollerAccepts({ completed: true, response: "I'm on it, pulling the files now." })
    ).toBe(false);
  });
});

describe('assessment-agent modules remain intact', () => {
  for (const agentId of Object.keys(FIXED_RETURNS)) {
    test(`${agentId}.js loads and exports handleDelegation`, () => {
      const agent = require(path.join(AGENTS_DIR, `${agentId}.js`));
      expect(typeof agent.handleDelegation).toBe('function');
    });
  }
});
