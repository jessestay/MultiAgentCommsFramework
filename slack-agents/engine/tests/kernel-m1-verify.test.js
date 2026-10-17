/**
 * engine/tests/kernel-m1-verify.test.js
 *
 * M1 of the execution kernel (Vikunja #771) — directiveVerify advisory hole.
 *
 * BDD: Given a verification claim with NO external artifacts (no URL, no
 * post ID, no task ref), when the verifier classifies it, then the claim is
 * UNVERIFIABLE — never "verified". Pre-fix, a claim with >= 100 words and a
 * keyword like "assessment" was auto-verified, so a long markup-laden reply
 * could be stamped verified without anything checkable existing.
 *
 * Advisory work is not punished either: unverifiable is a neutral terminal
 * disposition (no health credit, no health blame). Verified status is
 * reserved for claims backed by an externally checkable artifact.
 *
 * This file also pins that directiveVerify is safe to require (its main()
 * must only run when executed directly) — pre-fix, requiring it ran the
 * verifier against live state.
 */
'use strict';

const { dispositionForArtifactlessClaim } = require('../directiveVerify');

describe('M1 directiveVerify: artifact-less claims are never auto-verified', () => {
  test('Given a long keyword-rich advisory claim, then the disposition is unverifiable, not verified', () => {
    const text = ('Assessment and review: my analysis and conclusion after a full review of the ' +
      'findings is that the recommendation stands. This observation covers the assessment in ' +
      'detail with a verdict and a finding for every section under review. ').repeat(3);
    expect(text.split(/\s+/).length).toBeGreaterThanOrEqual(100);
    expect(dispositionForArtifactlessClaim(text)).toBe('unverifiable');
  });
  test('Given a short claim, then the disposition is also unverifiable', () => {
    expect(dispositionForArtifactlessClaim('Done — assessment posted.')).toBe('unverifiable');
  });
  test('Given an empty claim, then the disposition is unverifiable', () => {
    expect(dispositionForArtifactlessClaim('')).toBe('unverifiable');
    expect(dispositionForArtifactlessClaim(undefined)).toBe('unverifiable');
  });
});
