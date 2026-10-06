/**
 * engine/tests/integration/slack-post-verify.integration.js
 *
 * INTEGRATION TEST (hits real Slack API).
 *
 * Unlike unit tests that mock the Slack client, this verifies the actual
 * deployed behavior: a post lands in the right channel/thread, and the
 * verification readback finds it.
 *
 * SAFETY: Uses a dedicated test thread. All test messages are prefixed with
 * [INTEGRATION-TEST] and posted in a thread under a pinned test parent, so
 * they don't pollute the channel. The test cleans up by deleting its messages.
 *
 * RUN: npx jest engine/tests/integration/ --forceExit
 * SKIP in CI unless SLACK_INTEGRATION_TEST=1 is set.
 */
'use strict';

const { WebClient } = require('@slack/web-api');

const TEST_CHANNEL = 'C0ASDH1HC1Y'; // #marketing
const TEST_PARENT_TS = '1791280954.701789'; // Pinned test directive thread

describe('Slack post integration (real API)', () => {
  let client;

  beforeAll(async () => {
    if (process.env.SLACK_INTEGRATION_TEST !== '1') {
      console.log('Skipping integration test (set SLACK_INTEGRATION_TEST=1 to run)');
      return;
    }
    const { resolveSlackToken } = require('../../engine/slackToken');
    const token = await resolveSlackToken();
    client = new WebClient(token);
  });

  test('postMessage to thread lands and is verifiable', async () => {
    if (process.env.SLACK_INTEGRATION_TEST !== '1') return;

    // Post a test reply in the thread
    const postRes = await client.chat.postMessage({
      channel: TEST_CHANNEL,
      thread_ts: TEST_PARENT_TS,
      text: '[INTEGRATION-TEST] Verifying post lands in thread',
      unfurl_links: false,
    });
    expect(postRes.ok).toBe(true);
    expect(postRes.ts).toBeDefined();

    // Read back the thread and verify the post landed
    const replies = await client.conversations.replies({
      channel: TEST_CHANNEL,
      ts: TEST_PARENT_TS,
      limit: 20,
    });
    const found = (replies.messages || []).some(m => m.ts === postRes.ts);
    expect(found).toBe(true);

    // Cleanup: delete the test message
    await client.chat.delete({ channel: TEST_CHANNEL, ts: postRes.ts });
  });

  test('postMessage to wrong channel is detectable', async () => {
    if (process.env.SLACK_INTEGRATION_TEST !== '1') return;

    // This documents the Oct 6 bug: posting to #content instead of #marketing
    // The verification must catch channel mismatches.
    const wrongChannel = 'C0ASH4TF604'; // #management
    const postRes = await client.chat.postMessage({
      channel: wrongChannel,
      thread_ts: TEST_PARENT_TS, // Thread doesn't exist here
      text: '[INTEGRATION-TEST] Wrong channel test',
      unfurl_links: false,
    }).catch(e => ({ ok: false, error: e.message }));

    // Slack should reject thread_ts that doesn't exist in the channel,
    // OR the verification readback should fail to find it.
    // Either way, the bug is detectable.
    if (postRes.ok) {
      const replies = await client.conversations.replies({
        channel: TEST_CHANNEL,
        ts: TEST_PARENT_TS,
        limit: 20,
      }).catch(() => ({ messages: [] }));
      const found = (replies.messages || []).some(m => m.ts === postRes.ts);
      expect(found).toBe(false); // Must NOT be in the right thread
      await client.chat.delete({ channel: wrongChannel, ts: postRes.ts }).catch(() => {});
    } else {
      expect(postRes.error).toMatch(/thread_not_found|channel_not_found/i);
    }
  });
});
