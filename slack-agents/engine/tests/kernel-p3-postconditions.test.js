// kernel-p3-postconditions.test.js — #807 Phase 3 (US-P3.1/P3.2/P3.3).
//
// Directives finalize on postconditions, not proxies: when a directive
// names its deliverable artifacts, those artifacts must exist in the
// world before finalize can call it complete. Dead-letters carry the
// postcondition set + observed failures + full text; retries carry a
// strategy-change note built from the observed gap.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-p3-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_GAPS_PATH = path.join(TMP, '.engine-gaps.json');
delete process.env.VIKUNJA_TOKEN;

jest.mock('../collaboration', () => ({ suggestCollaboration: async () => {} }));

const { derivePostconditions, verifyPostconditions } = require('../directivePostconditions');
const finalize = require('../directiveFinalize');
const { SANDBOX } = require('../../utils/agentTools');

const ENGINE_DIR = path.join(__dirname, '..');
const HEALTH_PATH = path.join(ENGINE_DIR, '.agent-health.json');
const VERIFY_PATH = path.join(ENGINE_DIR, '.directive-verify-state.json');
function snapshot(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function restore(p, c) { try { if (c === null) fs.unlinkSync(p); else fs.writeFileSync(p, c); } catch { /* ignore */ } }
let healthSnap, verifySnap;
beforeAll(() => { healthSnap = snapshot(HEALTH_PATH); verifySnap = snapshot(VERIFY_PATH); finalize.init({ getAgent: () => ({}), agentIds: ['cto'] }); });
afterAll(() => { restore(HEALTH_PATH, healthSnap); restore(VERIFY_PATH, verifySnap); });

function fakeClient() {
  const posted = [];
  let lastPostedTs = null;
  return {
    posted,
    conversations: {
      history: jest.fn(async () => ({ messages: lastPostedTs ? [{ ts: lastPostedTs }] : [] })),
      replies: jest.fn(async () => ({ messages: lastPostedTs ? [{ ts: lastPostedTs }] : [] })),
    },
    chat: {
      postMessage: jest.fn(async (params) => {
        lastPostedTs = `1792200000.${String(posted.length + 1).padStart(6, '0')}`;
        posted.push(params);
        return { ts: lastPostedTs };
      }),
    },
  };
}

const CH = 'C0ASH4TF604';
function item(text, ts) {
  return { channel: CH, m: { ts }, text, msgTs: ts, agentId: 'cto' };
}
const RESULT = { response: 'The requested work is complete and the deliverable has been written and verified. [DEMO] Supporting reference: https://example.com/proof for the record.', threadTs: null };

describe('US-P3.1 — derive + verify postconditions', () => {
  test('derives file_exists for a named deliverable path', () => {
    const pcs = derivePostconditions('[CTO] → Write the spec. Deliverable: research/token-spec-735.md in the sandbox.');
    expect(pcs).toEqual([{ type: 'file_exists', path: 'research/token-spec-735.md' }]);
  });

  test('URLs do not become postconditions', () => {
    const pcs = derivePostconditions('[CMO] → Check https://staynalive.com/muse-for-business-workshop and report.');
    expect(pcs).toEqual([]);
  });

  test('plain prose derives nothing', () => {
    expect(derivePostconditions('[CFO] → Summarize the quarter in a thread reply.')).toEqual([]);
  });

  test('verify: existing file satisfies, missing file fails with observed state', () => {
    const name = `p3-verify-${Date.now()}.md`;
    fs.mkdirSync(path.join(SANDBOX, 'research'), { recursive: true });
    fs.writeFileSync(path.join(SANDBOX, 'research', name), 'present', 'utf8');
    const ok = verifyPostconditions([{ type: 'file_exists', path: `research/${name}` }]);
    expect(ok.allSatisfied).toBe(true);
    const missing = verifyPostconditions([{ type: 'file_exists', path: 'research/definitely-absent-807.md' }]);
    expect(missing.allSatisfied).toBe(false);
    expect(missing.failures[0].observed.exists).toBe(false);
    fs.unlinkSync(path.join(SANDBOX, 'research', name));
  });
});

describe('US-P3.1 — finalize gate', () => {
  test('named deliverable missing → NOT finalized, retry carries the strategy note', async () => {
    const client = fakeClient();
    const state = {};
    const ts = '1792200100.000100';
    const processed = await finalize.finalizeDelegation(client, state, item('[CTO] → Write it. Deliverable: research/p3-absent-807.md', ts), RESULT);
    expect(processed).toBe(0);
    expect(client.posted.length).toBe(0);
    expect(state._retries[`${CH}:${ts}`]).toBe(1);
    const pending = (state._pendingRetry || []).find(e => e.ts === ts);
    expect(pending).toBeTruthy();
    expect(pending.text).toContain('STRATEGY CHANGE REQUIRED');
    expect(pending.text).toContain('research/p3-absent-807.md');
  });

  test('named deliverable present → finalized and posted', async () => {
    const name = `p3-present-${Date.now()}.md`;
    fs.mkdirSync(path.join(SANDBOX, 'research'), { recursive: true });
    fs.writeFileSync(path.join(SANDBOX, 'research', name), 'real content', 'utf8');
    const client = fakeClient();
    const state = {};
    const ts = '1792200101.000100';
    const processed = await finalize.finalizeDelegation(client, state, item(`[CTO] → Write it. Deliverable: research/${name}`, ts), RESULT);
    expect(processed).toBe(1);
    expect(client.posted.length).toBe(1);
    fs.unlinkSync(path.join(SANDBOX, 'research', name));
  });

  test('no named artifacts → legacy evidence gate still finalizes', async () => {
    const client = fakeClient();
    const state = {};
    const ts = '1792200102.000100';
    const processed = await finalize.finalizeDelegation(client, state, item('[CTO] → Summarize the gateway state in a reply.', ts), RESULT);
    expect(processed).toBe(1);
    expect(client.posted.length).toBe(1);
  });
});

describe('US-P3.2 — dead-letters carry the full gap', () => {
  test('dead-letter entry stores postconditions, failures, and full text', () => {
    const state = {};
    const ts = '1792200103.000100';
    const it = item('[CTO] → Write it. Deliverable: research/p3-absent-807.md', ts);
    const extra = {
      postconditions: [{ type: 'file_exists', path: 'research/p3-absent-807.md' }],
      postconditionFailures: [{ type: 'file_exists', path: 'research/p3-absent-807.md', satisfied: false, observed: { exists: false, size: 0 } }],
    };
    finalize.recordRetryFailure(state, it, 'missing_artifacts', () => {}, extra);
    finalize.recordRetryFailure(state, it, 'missing_artifacts', () => {}, extra);
    finalize.recordRetryFailure(state, it, 'missing_artifacts', () => {}, extra);
    const dead = finalize.recordRetryFailure(state, it, 'missing_artifacts', () => {}, extra);
    expect(dead).toBe(true);
    const entry = state._deadLetter.find(e => e.ts === ts);
    expect(entry).toBeTruthy();
    expect(entry.fullText).toContain('research/p3-absent-807.md');
    expect(entry.postconditions).toEqual(extra.postconditions);
    expect(entry.postconditionFailures[0].observed.exists).toBe(false);
  });
});
