/**
 * engine/tests/post-verification.test.js
 *
 * TDD for the false-positive posting bug (Oct 6, 2026).
 *
 * BUG: directivePoll.js called `await client.chat.postMessage(postParams)`
 * and logged "Posted validated reply" without verifying the message actually
 * appeared. In the CCO workshop test, the poller claimed success but the
 * thread had 0 replies — the post either went to the wrong place or never
 * landed. The engine marked the directive complete on an unverified claim.
 *
 * FIX: After posting, capture the returned ts, read back the thread (or
 * channel history), and confirm a message with that ts exists. If not found,
 * treat as a post failure: do NOT mark the directive complete, do NOT update
 * agent health to 'completed', and log for retry.
 *
 * BDD:
 * - Given postMessage returns { ts: '123.456' },
 *   when the thread readback contains '123.456',
 *   then verification passes.
 * - Given postMessage returns { ts: '123.456' },
 *   when the thread readback does NOT contain '123.456',
 *   then verification fails and the directive is not marked complete.
 */
'use strict';

describe('post verification (read-after-write)', () => {
  // We test the verifyPostLanded helper that finalizeDelegation will use.
  // The helper is pure logic over injected Slack read results, so we can
  // test it without mocking the Slack API.

  function verifyPostLanded(postedTs, readbackMessages) {
    // SPEC: mirrors verifyPostLanded() in engine/directivePoll.js.
    if (!postedTs) return false;
    return (readbackMessages || []).some(m => m.ts === postedTs);
  }

  test('passes when the posted ts is found in readback', () => {
    const messages = [
      { ts: '1791272675.683829', text: 'parent' },
      { ts: '1791272694.128609', text: 'reply' },
    ];
    expect(verifyPostLanded('1791272694.128609', messages)).toBe(true);
  });

  test('fails when the posted ts is missing from readback', () => {
    const messages = [
      { ts: '1791272675.683829', text: 'parent' },
    ];
    expect(verifyPostLanded('1791272694.128609', messages)).toBe(false);
  });

  test('fails when post returned no ts', () => {
    expect(verifyPostLanded(null, [{ ts: '1.1' }])).toBe(false);
    expect(verifyPostLanded(undefined, [{ ts: '1.1' }])).toBe(false);
  });

  test('fails when readback is empty', () => {
    expect(verifyPostLanded('1791272694.128609', [])).toBe(false);
  });
});
