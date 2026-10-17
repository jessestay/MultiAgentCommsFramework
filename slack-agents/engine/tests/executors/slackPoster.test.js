/**
 * slack-poster executor tests (Phase 3, Vikunja #724) — US-107.
 *
 * Deterministic: posts a prepared message through the injected postMessage
 * bridge and records a slack_message receipt — the receipt is what the
 * artifact_posted postcondition and receipt-based demo relay read.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-poster-test-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');

const executors = require('../../executors');
const receipts = require('../../receipts');
const { templates } = require('../../taskContract');

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

test('posts the prepared text and records the slack_message receipt', async () => {
  const tid = 870000 + Math.floor(Math.random() * 9999);
  const contract = templates.slackPost({ taskId: tid, channel: 'marketing', text: 'Workshop seats are live: https://staynalive.com/workshop' });
  const task = { id: tid, title: 'Post the workshop announcement', description: '' };

  const posted = [];
  const postMessage = async ({ channel, text }) => { posted.push({ channel, text }); return { ts: '1712345678.000100' }; };

  const out = await executors.dispatch('slack-poster', { task, contract, agentId: 'cmo', postMessage });

  expect(out.ok).toBe(true);
  expect(posted).toEqual([{ channel: 'marketing', text: 'Workshop seats are live: https://staynalive.com/workshop' }]);
  const arts = receipts.artifactsForTask(tid, 'slack_message');
  expect(arts).toHaveLength(1);
  expect(arts[0].ref).toBe('marketing/1712345678.000100');
  expect(out.deliverable.channel).toBe('marketing');
  expect(out.deliverable.messageTs).toBe('1712345678.000100');
});

test('missing prepared text → structural failure, nothing posted', async () => {
  const tid = 880000 + Math.floor(Math.random() * 9999);
  const contract = templates.slackPost({ taskId: tid, channel: 'marketing' });
  const task = { id: tid, title: 'Post something', description: '' };
  const postMessage = jest.fn(async () => ({ ts: 'x' }));
  const out = await executors.dispatch('slack-poster', { task, contract, agentId: 'cmo', postMessage });
  expect(out.ok).toBe(false);
  expect(out.errorClass).toBe('invalid_contract');
  expect(postMessage).not.toHaveBeenCalled();
});
