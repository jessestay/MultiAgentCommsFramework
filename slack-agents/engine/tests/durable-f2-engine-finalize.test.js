// durable-f2-engine-finalize — Phase F (Vikunja #789): the engine-side
// finalize loop.
//
// Phase B left finalization in the poller: it awaited each intake
// record's settlement and ran finalizeDelegation (validation, posting,
// verifier queueing, retry/dead-letter bookkeeping). Phase F moves that
// consumption into the engine: a finalize loop lists settled intake
// records and runs them through THE SAME finalizeDelegation code the
// poller uses (extracted to engine/directiveFinalize.js — one
// implementation, two drivers), then marks each record finalized so it
// is never finalized twice.
//
// Criteria encoded here:
//   F2-a  a completed record is finalized through the shared path: the
//         validated reply is posted, health records a completion, the
//         record is marked finalized.
//   F2-b  a failed record is finalized with a null result — the shared
//         retry machinery engages (retry counted, directive queued for
//         retry), exactly as a poller-side failure does.
//   F2-c  an already-finalized record is never finalized twice.
//   F2-d  a roadblock record is consumed silently: no post, no retry
//         bookkeeping — mirroring the poller's fire-and-forget routing.
//   F2-e  the engine cycle's drain stage registers retry-queue and due
//         dead-letter requeue entries into the intake (execution stays
//         in the workflow path); a registration failure re-queues the
//         entry instead of losing it.
//   F2-f  fallback adoption: intake records left unsettled by a dead
//         engine are force-settled as failed (stale only — fresh ones
//         are left for the returning engine), so the consume stage can
//         route them into the retry machinery; nothing is stranded.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-f2-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_GAPS_PATH = path.join(TMP, '.engine-gaps.json');
delete process.env.VIKUNJA_TOKEN;

jest.mock('../collaboration', () => ({ suggestCollaboration: async () => {} }));

function impl(rel, name) {
  try { return require(rel); }
  catch (e) { throw new Error(`missing implementation ${name}: ${e.message}`); }
}

const CH = 'C0ASH4TF604';
const ENGINE_DIR = path.join(__dirname, '..');
const HEALTH_PATH = path.join(ENGINE_DIR, '.agent-health.json');
const VERIFY_PATH = path.join(ENGINE_DIR, '.directive-verify-state.json');

function snapshot(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function restore(p, content) {
  try { if (content === null) fs.unlinkSync(p); else fs.writeFileSync(p, content); } catch { /* ignore */ }
}
let healthSnap, verifySnap;
beforeAll(() => { healthSnap = snapshot(HEALTH_PATH); verifySnap = snapshot(VERIFY_PATH); });
afterAll(() => { restore(HEALTH_PATH, healthSnap); restore(VERIFY_PATH, verifySnap); });

// Fake Slack client whose postMessage lands and verifies: history
// readback contains the posted ts (finalizeDelegation verifies posts).
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
        lastPostedTs = `1700000000.${String(posted.length + 1).padStart(6, '0')}`;
        posted.push(params);
        return { ts: lastPostedTs };
      }),
    },
  };
}

const fakeAgents = {
  cto: { handleDelegation: async () => ({ response: 'unused' }), init: jest.fn() },
  cmo: { handleDelegation: async () => ({ response: 'unused' }), init: jest.fn() },
};

function makeFinalize() {
  const finMod = impl('../directiveFinalize', 'engine/directiveFinalize');
  finMod.init({ getAgent: (id) => fakeAgents[id] || null, agentIds: Object.keys(fakeAgents) });
  return finMod;
}

async function makeIntake() {
  const { createIntakeStore } = impl('../directiveIntake', 'engine/directiveIntake');
  return createIntakeStore(fs.mkdtempSync(path.join(os.tmpdir(), 'macf-f2-intake-')));
}

async function registerAndSettle(intake, over, settle) {
  const rec = {
    channel: CH, ts: '900.001', msgTs: 900.001, agentId: 'cto',
    text: '[from: CEO → CTO] ship it https://example.com/task',
    checkpointRunId: `directive:${CH}:900.001`,
    ...over,
  };
  await intake.register(rec);
  if (settle) await intake.update(`${rec.channel}:${rec.ts}`, settle);
  return rec;
}

describe('US-F1/F2 engine finalize loop — consumeSettledIntakeRecords', () => {
  test('F2-a: a completed record is finalized via the shared path and marked finalized', async () => {
    const fin = makeFinalize();
    const intake = await makeIntake();
    await registerAndSettle(intake, {}, {
      status: 'completed',
      result: { response: '[from: CTO → CEO] The task is complete and the deliverable is ready for review at https://example.com/deliverable for the team.' },
    });
    const client = fakeClient();
    const state = {};
    const out = await fin.consumeSettledIntakeRecords({ intake, state, client });
    expect(out.directives).toBe(1);
    expect(client.posted.length).toBe(1);
    expect(client.posted[0].text).toContain('https://example.com/deliverable');
    const rec = await intake.get(`${CH}:900.001`);
    expect(rec.finalizedAt).toBeTruthy();
    // Watermark advanced by the shared finalize path, as in the poller.
    expect(state[CH]).toBe('900.001');
  });

  test('F2-b: a failed record engages the shared retry machinery', async () => {
    const fin = makeFinalize();
    const intake = await makeIntake();
    await registerAndSettle(intake, { ts: '900.002', msgTs: 900.002 }, {
      status: 'failed', error: 'step exploded',
    });
    const client = fakeClient();
    const state = {};
    const out = await fin.consumeSettledIntakeRecords({ intake, state, client });
    expect(out.directives).toBe(1);
    expect(client.posted.length).toBe(0);
    expect(state._retries[`${CH}:900.002`]).toBe(1);
    expect(state._pendingRetry.some(e => e.channel === CH && e.ts === '900.002')).toBe(true);
    const rec = await intake.get(`${CH}:900.002`);
    expect(rec.finalizedAt).toBeTruthy();
  });

  test('F2-c: an already-finalized record is never finalized twice', async () => {
    const fin = makeFinalize();
    const intake = await makeIntake();
    await registerAndSettle(intake, { ts: '900.003', msgTs: 900.003 }, {
      status: 'completed',
      result: { response: '[from: CTO → CEO] The task is complete and the result is posted at https://example.com/once for review.' },
      finalizedAt: new Date().toISOString(),
    });
    const client = fakeClient();
    const out = await fin.consumeSettledIntakeRecords({ intake, state: {}, client });
    expect(out.directives).toBe(0);
    expect(client.posted.length).toBe(0);
  });

  test('F2-d: a roadblock record is consumed silently', async () => {
    const fin = makeFinalize();
    const intake = await makeIntake();
    await registerAndSettle(intake, {
      ts: '900.004', msgTs: 900.004, agentId: 'execPM', kind: 'roadblock',
      text: '[from: CMO → Exec PM] CAPABILITY REQUEST: token',
    }, { status: 'completed', result: { response: 'routed' } });
    const client = fakeClient();
    const state = {};
    const out = await fin.consumeSettledIntakeRecords({ intake, state, client });
    expect(out.roadblocks).toBe(1);
    expect(out.directives).toBe(0);
    expect(client.posted.length).toBe(0);
    expect(state._pendingRetry || []).toHaveLength(0);
    const rec = await intake.get(`${CH}:900.004`);
    expect(rec.finalizedAt).toBeTruthy();
  });

  test('F2-f: adoption force-settles stale unsettled records; fresh ones are left alone', async () => {
    const fin = makeFinalize();
    const intake = await makeIntake();
    const now = Date.now();
    await registerAndSettle(intake, { ts: '900.005', msgTs: 900.005 }, null);
    await intake.update(`${CH}:900.005`, {
      status: 'dispatched',
      dispatchedAt: new Date(now - 20 * 60 * 1000).toISOString(),
      registeredAt: new Date(now - 20 * 60 * 1000).toISOString(),
    });
    await registerAndSettle(intake, { ts: '900.006', msgTs: 900.006 }, null);
    const out = await fin.adoptOrphanedIntakeRecords({ intake, staleMs: 10 * 60 * 1000, now });
    expect(out.forceFailed).toBe(1);
    const stale = await intake.get(`${CH}:900.005`);
    expect(stale.status).toBe('failed');
    expect(stale.adoptedByFallback).toBe(true);
    const fresh = await intake.get(`${CH}:900.006`);
    expect(fresh.status).toBe('registered');
  });
});

describe('US-F1 engine cycle — drain stage registers queued work', () => {
  test('F2-e: pending retries and due dead-letter requeues are registered; failures re-queue', async () => {
    const scanMod = impl('../directiveScan', 'engine/directiveScan');
    const fin = makeFinalize();
    const intake = await makeIntake();
    const client = fakeClient();
    const scanner = scanMod.createDirectiveScanner({
      client: { conversations: { history: jest.fn(async () => ({ messages: [] })), replies: jest.fn(async () => ({ messages: [] })) }, chat: client.chat },
      intake, channels: [CH],
    });
    const state = {
      _pendingRetry: [{
        channel: CH, ts: '910.001', msgTs: 910.001, agentId: 'cto',
        text: '[from: CEO → CTO] retry me https://example.com/r', requeues: 0,
      }],
      _deadLetter: [{
        channel: CH, ts: '910.002', agentId: 'cmo',
        text: '[from: CEO → CMO] requeue me', fullText: '[from: CEO → CMO] requeue me https://example.com/q',
        msgTs: 910.002, requeues: 1,
        requeueAt: new Date(Date.now() - 1000).toISOString(),
        failedAt: new Date().toISOString(), reason: 'no_result',
        receiptSummary: 'Previous attempt did: fileWrite report.md',
      }],
    };
    const out = await scanMod.runIntakeCycle({
      client, intake, scanner, finalize: fin,
      loadState: () => state,
      saveState: () => {},
      retirement: null,
    });
    expect(out.drainedRegistered).toBe(2);
    const retry = await intake.get(`${CH}:910.001`);
    expect(retry).not.toBeNull();
    expect(retry.status).toBe('registered');
    const requeue = await intake.get(`${CH}:910.002`);
    expect(requeue).not.toBeNull();
    // US-A3: the receipt summary leads the requeued text.
    expect(requeue.text.startsWith('Previous attempt did: fileWrite report.md')).toBe(true);
    expect(requeue.requeues).toBe(2);
    // Queues were drained by the shared drain functions.
    expect(state._pendingRetry).toHaveLength(0);
    expect(state._deadLetter).toHaveLength(0);
  });
});
