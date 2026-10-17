/**
 * engine/tests/kernel-m1-758.test.js
 *
 * M1 of the execution kernel (Vikunja #771) — the #758 fix.
 * Spec: EXECUTION-KERNEL-SPEC.md, US-2 (tools-as-steps) + US-3 (verifier-gated
 * completion) applied to the Slack directive path.
 *
 * BDD scenarios:
 * - Given a model reply containing DeepSeek DSML tool-call markup (fullwidth
 *   ｜ / ▁ tokens), when the unexecuted-call detector scans it, then it is
 *   flagged as tool-call text (pre-fix: invisible — ASCII-only patterns).
 * - Given an ACTION directive (create/post/send/…) and an agent result whose
 *   only "evidence" is a boilerplate string with zero tool executions, when
 *   the poller finalizes the delegation, then nothing is posted and the
 *   directive is queued for retry (pre-fix: boilerplate passed the gate).
 * - Given an action directive and an agent that really executed a tool
 *   (receipt in the ledger inside the directive window), when the poller
 *   finalizes, then the reply is posted (sanitized) and counted.
 * - Given a non-action (advisory) directive and a written-deliverable result
 *   with an evidence marker, then the reply still posts (Oct 6, 2026
 *   assessment-evidence behavior must not regress).
 * - Given ANY directive and a response containing DSML markup, then the
 *   markup is never posted — the delegation is rejected for retry.
 * - Given a clean response with posting dirt (a stray [from:] line in the
 *   body), then the posted text is sanitized while the leading [from:]
 *   routing header is preserved.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate the receipts ledger BEFORE requiring engine modules.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-m1-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');

jest.mock('../collaboration', () => ({ suggestCollaboration: async () => {} }));

const { findUnexecutedCallSyntax } = require('../../utils/anthropic');
const receipts = require('../receipts');
const poller = require('../directivePoll');
const { finalizeDelegation, countToolReceiptsSince } = poller;

const ENGINE_DIR = path.join(__dirname, '..');
const HEALTH_PATH = path.join(ENGINE_DIR, '.agent-health.json');
const VERIFY_STATE_PATH = path.join(ENGINE_DIR, '.directive-verify-state.json');

function snapshot(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}
function restore(p, content) {
  try {
    if (content === null) fs.unlinkSync(p);
    else fs.writeFileSync(p, content);
  } catch { /* ignore */ }
}

let healthSnap, verifySnap, vikunjaTokenSnap;
beforeAll(() => {
  healthSnap = snapshot(HEALTH_PATH);
  verifySnap = snapshot(VERIFY_STATE_PATH);
  vikunjaTokenSnap = process.env.VIKUNJA_TOKEN;
  // Prevent auto-link from touching the real Vikunja board during tests.
  delete process.env.VIKUNJA_TOKEN;
});
afterAll(() => {
  restore(HEALTH_PATH, healthSnap);
  restore(VERIFY_STATE_PATH, verifySnap);
  if (vikunjaTokenSnap !== undefined) process.env.VIKUNJA_TOKEN = vikunjaTokenSnap;
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
});
beforeEach(() => {
  try { fs.unlinkSync(process.env.MACF_RECEIPTS_FILE); } catch { /* fresh */ }
});

function fakeClient() {
  const posted = [];
  return {
    posted,
    chat: {
      postMessage: async (params) => {
        posted.push(params);
        return { ts: '1700.001' };
      },
    },
    conversations: {
      history: async () => ({ messages: [{ ts: '1700.001' }] }),
      replies: async () => ({ messages: [{ ts: '1700.001' }] }),
    },
  };
}

function item(over = {}) {
  const nowSec = Date.now() / 1000;
  return {
    channel: 'C0ASH4TF604',
    m: { ts: String(nowSec - 30) },
    text: '[from: CEO → CTO] Create the status file and post it to the channel',
    msgTs: nowSec - 30,
    agentId: 'cto',
    ...over,
  };
}

const DSML = '<｜DSML｜tool_calls><｜DSML｜invoke name="fileWrite">' +
  '<｜DSML｜parameter name="path" string="true">/tmp/memo.md</｜DSML｜parameter>' +
  '</｜DSML｜invoke></｜DSML｜tool_calls>';
const CLEAN = 'The status file is written and the summary is ready for review. ' +
  'It covers the current state, the open risks, and the next steps in plain language.';

describe('US-2 detector: findUnexecutedCallSyntax sees DSML markup', () => {
  test('Given DSML invoke markup, then it is flagged', () => {
    expect(findUnexecutedCallSyntax(DSML)).not.toBeNull();
  });
  test('Given the tool▁call▁begin token form, then it is flagged', () => {
    expect(findUnexecutedCallSyntax('Working on it <｜tool▁call▁begin｜>fileWrite')).not.toBeNull();
  });
  test('Given legacy ASCII call text, then it is still flagged (regression)', () => {
    expect(findUnexecutedCallSyntax("[fileWrite(path='/tmp/x.md')]")).not.toBeNull();
    expect(findUnexecutedCallSyntax('<|tool_call>fileRead')).not.toBeNull();
  });
  test('Given clean prose, then nothing is flagged', () => {
    expect(findUnexecutedCallSyntax(CLEAN)).toBeNull();
    expect(findUnexecutedCallSyntax('The fileWrite tool writes files to the sandbox.')).toBeNull();
  });
});

describe('US-3 evidence gate: countToolReceiptsSince reads the ledger', () => {
  test('Given no receipts, then the count is zero', () => {
    expect(countToolReceiptsSince('cto', Date.now() - 60000)).toBe(0);
  });
  test('Given a successful tool receipt in the window, then it counts', () => {
    receipts.issueReceipt({
      agentId: 'cto', tool: 'fileWrite',
      args: { path: 'x.txt' }, result: { ok: true, path: 'x.txt' },
    });
    expect(countToolReceiptsSince('cto', Date.now() - 60000)).toBe(1);
  });
  test('Given only a failed receipt, then it does not count', () => {
    receipts.issueReceipt({
      agentId: 'cto', tool: 'urlCheck',
      args: { url: 'https://example.invalid' }, result: { ok: false, error: 'boom' },
    });
    expect(countToolReceiptsSince('cto', Date.now() - 60000)).toBe(0);
  });
  test('Given a receipt outside the window, then it does not count', () => {
    receipts.issueReceipt({
      agentId: 'cto', tool: 'fileWrite',
      args: { path: 'x.txt' }, result: { ok: true, path: 'x.txt' },
    });
    expect(countToolReceiptsSince('cto', Date.now() + 60000)).toBe(0);
  });
});

describe('M1 poller gate: finalizeDelegation', () => {
  test('Given an action directive and boilerplate-only evidence, then nothing posts and a retry is queued', async () => {
    const client = fakeClient();
    const state = {};
    const result = {
      response: CLEAN,
      evidence: 'Technical assessment generated (LLM report, no tools needed)',
      agentId: 'cto',
    };
    const processed = await finalizeDelegation(client, state, item(), result);
    expect(processed).toBe(0);
    expect(client.posted).toHaveLength(0);
    expect((state._pendingRetry || []).length).toBe(1);
  });

  test('Given an action directive and a real tool receipt, then the reply posts', async () => {
    receipts.issueReceipt({
      agentId: 'cto', tool: 'fileWrite',
      args: { path: 'status.txt' }, result: { ok: true, path: 'status.txt' },
    });
    const client = fakeClient();
    const state = {};
    const result = {
      response: CLEAN,
      evidence: 'Technical assessment with 1 tool execution(s): fileWrite',
      agentId: 'cto',
    };
    const processed = await finalizeDelegation(client, state, item(), result);
    expect(processed).toBe(1);
    expect(client.posted).toHaveLength(1);
    expect(client.posted[0].text).toContain('status file is written');
  });

  test('Given an action directive and DSML markup as the response, then markup never posts', async () => {
    const client = fakeClient();
    const state = {};
    const result = { response: DSML, evidence: 'done', agentId: 'cto' };
    const processed = await finalizeDelegation(client, state, item(), result);
    expect(processed).toBe(0);
    expect(client.posted).toHaveLength(0);
    expect((state._pendingRetry || []).length).toBe(1);
  });

  test('Given a sub-result whose only evidence is a bare taskId, then an action reply is NOT posted (live-run regression, Oct 15)', async () => {
    const client = fakeClient();
    const state = {};
    const action = item({ text: '[from: CEO -> CMO] Please create the launch memo and write it to a file.' });
    const result = {
      response: 'Here is my analysis of the launch memo situation and what I recommend we do next.',
      agentId: 'cmo',
      subResults: [{ agentId: 'lawyer', result: { response: 'I looked into it thoroughly and completely.', taskId: 12345 } }],
    };
    await finalizeDelegation(client, state, action, result);
    expect(client.posted).toHaveLength(0);
    expect((state._pendingRetry || []).length).toBe(1);
  });

  test('Given an advisory directive and a written deliverable with an evidence marker, then it still posts (Oct 6 regression guard)', async () => {
    const client = fakeClient();
    const state = {};
    const advisory = item({
      text: '[from: CEO → CTO] Review the gateway approach and give your assessment',
    });
    const result = {
      response: 'Assessment: the gateway approach is sound overall, with two risks worth ' +
        'watching. The retry behavior is the main one, followed by timeout tuning on the ' +
        'slower routes. My recommendation is to keep the current shape and revisit after a week of data.',
      evidence: 'Technical assessment generated (LLM report, no tools needed)',
      agentId: 'cto',
    };
    const processed = await finalizeDelegation(client, state, advisory, result);
    expect(processed).toBe(1);
    expect(client.posted).toHaveLength(1);
  });

  test('Given an advisory directive but a DSML markup response, then it is rejected too', async () => {
    const client = fakeClient();
    const state = {};
    const advisory = item({
      text: '[from: CEO → CTO] Review the gateway approach and give your assessment',
    });
    const result = { response: DSML, evidence: 'assessment complete', agentId: 'cto' };
    const processed = await finalizeDelegation(client, state, advisory, result);
    expect(processed).toBe(0);
    expect(client.posted).toHaveLength(0);
  });

  test('Given a clean response with posting dirt in the body, then the post is sanitized and the header survives', async () => {
    receipts.issueReceipt({
      agentId: 'cto', tool: 'fileWrite',
      args: { path: 'status.txt' }, result: { ok: true, path: 'status.txt' },
    });
    const client = fakeClient();
    const state = {};
    const result = {
      response: '[from: CTO → CEO] The status file is written and posted below for the team.\n' +
        '[from: CTO → Lawyer] please also review the attached summary\n' +
        'The summary itself is complete and covers all of the open items in order.',
      evidence: 'Technical assessment with 1 tool execution(s): fileWrite',
      agentId: 'cto',
    };
    const processed = await finalizeDelegation(client, state, item(), result);
    expect(processed).toBe(1);
    expect(client.posted).toHaveLength(1);
    const postedText = client.posted[0].text;
    expect(postedText).toContain('[from: CTO → CEO]');
    expect(postedText).not.toContain('[from: CTO → Lawyer]');
    expect(postedText).toContain('summary itself is complete');
  });
});
