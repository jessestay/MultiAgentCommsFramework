/**
 * Evidence gate tests (Oct 12, 2026).
 *
 * The work engine's EVIDENCE_REQUIREMENT prompt promises a validation gate;
 * hasEvidence() is that gate. These tests lock in the behavior:
 * narration-of-intent is rejected, real deliverables pass.
 */
const { hasEvidence } = require('../workEngine');

describe('hasEvidence — the deliverable validation gate', () => {
  test('rejects narration-of-intent (real task #658 failure)', () => {
    const narration = 'Responding based on context. Let me first check the project ' +
      'state to understand the PDFs I need to evaluate. Getting the agent ' +
      'state now to see what is there and then I will produce the verdict.';
    expect(hasEvidence(narration)).toBe(false);
  });

  test('rejects narration-of-intent (real task #266 failure)', () => {
    const narration = "I'm pulling the Muse for Business workshop details and " +
      'drafting the X post copy. Deadline is today and I need to keep it ' +
      'under 280 characters while highlighting the key benefits for attendees.';
    expect(hasEvidence(narration)).toBe(false);
  });

  test('rejects short acknowledgments', () => {
    expect(hasEvidence('Done')).toBe(false);
    expect(hasEvidence('On it, working now.')).toBe(false);
    expect(hasEvidence('')).toBe(false);
    expect(hasEvidence(null)).toBe(false);
  });

  test('accepts deliverable with URL and task reference', () => {
    expect(hasEvidence(
      '[FYI] Workshop promo copy drafted and verified live at ' +
      'https://staynalive.com/workshop — task #266 done. Three variants, all under 280 chars.'
    )).toBe(true);
  });

  test('accepts deliverable with demo marker, path, and metric', () => {
    expect(hasEvidence(
      '[DEMO] Built the landing page. Preview: reports/landing-v2.html. ' +
      'Projecting 1,200 signups in the first week based on current traffic.'
    )).toBe(true);
  });

  test('accepts deliverable with bare Vikunja task ref and evidence', () => {
    expect(hasEvidence(
      'Finished the audit outreach batch for #142: 40 drafts queued, ' +
      'all with tracking links https://staynalive.com/audit verified live.'
    )).toBe(true);
  });
});
