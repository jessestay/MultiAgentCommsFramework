/**
 * engine/tests/cco-classifier.test.js
 *
 * TDD for the draft/publish intent classifier bug (Oct 6, 2026).
 *
 * BUG: The CCO's handleDelegation matched:
 *   if (lowerRequest.includes('x') && (lowerRequest.includes('publish') ||
 *       lowerRequest.includes('post') || lowerRequest.includes('tweet')) &&
 *       lowerRequest.includes('workshop'))
 *
 * The directive "Write the Oct 11 Muse for Business workshop promo NOW.
 * Produce EXACTLY: 1) X post (under 280 characters)..." contains:
 * - 'x' (from "X post" — the CONTENT TYPE)
 * - 'post' (from "X post" — the CONTENT TYPE)
 * - 'workshop' (the topic)
 *
 * The classifier treated the content type "X post" as a publish ACTION.
 * "Write", "produce", "draft" are DRAFT intents. Only explicit publish
 * verbs ("publish to X", "post this to X", "tweet this") with the workshop
 * context should trigger the publishing path.
 *
 * BDD:
 * - Given a directive says "Write X post", when classified,
 *   then it is DRAFT intent (no publishing).
 * - Given a directive says "Publish this to X", when classified,
 *   then it is PUBLISH intent.
 */
'use strict';

// Extract the classifier logic for testing. The actual code lives in
// agents/cco.js handleDelegation. This test documents the expected behavior
// and drives the refactor to a testable function.

const ccoModule = require('../../agents/cco');
// Use the real implementation from agents/cco.js.
function classifiesAsPublish(request) {
  return ccoModule.isPublishIntent(request.toLowerCase());
}

describe('CCO draft/publish intent classifier', () => {
  test('DRAFT: "Write X post" does not trigger publishing', () => {
    const directive = 'Write the Oct 11 Muse for Business workshop promo NOW. ' +
      'Produce EXACTLY: 1) X post (under 280 characters) 2) Facebook post 3) TikTok script.';
    // This SHOULD be false (draft intent), but the buggy classifier returns true.
    expect(classifiesAsPublish(directive)).toBe(false);
  });

  test('DRAFT: "Draft X post" does not trigger publishing', () => {
    expect(classifiesAsPublish('Draft an X post about the workshop')).toBe(false);
  });

  test('PUBLISH: "Publish to X" triggers publishing', () => {
    expect(classifiesAsPublish('Publish the workshop promo to X now')).toBe(true);
  });

  test('PUBLISH: "Post this to X" triggers publishing', () => {
    expect(classifiesAsPublish('Post this workshop announcement to X')).toBe(true);
  });
});
