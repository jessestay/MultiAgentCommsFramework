// durable-f3-fallback-poller — Phase F (Vikunja #789): the cron poller
// becomes a fallback that only acts when the engine is down.
//
// With MACF_ENGINE_INTAKE=1 the engine owns scanning, registration and
// finalization. The 5-minute poller then has exactly three modes:
//
//   legacy   — flag off: today's behavior, byte-for-byte (Phase B).
//   noop     — flag on + fresh engine heartbeat: exit without working.
//              The engine is on duty; a second worker would double-post.
//   fallback — flag on + stale heartbeat: the engine is down. Record a
//              fallback activation (breaks the retirement streak), adopt
//              any intake records the dead engine left behind, and run
//              the full legacy cycle until the engine returns.
//
// Criteria encoded here:
//   F3-a  the mode decision is a pure function of (flag, heartbeat).
//   F3-b  fallback adoption + consume runs through the shared finalize
//         module (covered end-to-end in durable-f2); here: the poller
//         wires the decision + recording helpers it needs from the new
//         modules, and its legacy exports are unchanged.
//   F3-c  the shared poll-state store round-trips and is writable by
//         BOTH processes that write it (poller as root, engine as
//         macf): the saved file carries write permission for everyone,
//         so neither side can wedge the other out of the state file
//         (the Phase B 660 lesson, applied to state).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-f3-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_GAPS_PATH = path.join(TMP, '.engine-gaps.json');
delete process.env.VIKUNJA_TOKEN;

jest.mock('../collaboration', () => ({ suggestCollaboration: async () => {} }));

function impl(rel, name) {
  try { return require(rel); }
  catch (e) { throw new Error(`missing implementation ${name}: ${e.message}`); }
}

describe('US-F1.3 fallback-only poller — mode decision', () => {
  test('F3-a: decision matrix (flag off → legacy; fresh heartbeat → noop; stale → fallback)', () => {
    const poll = impl('../directivePoll', 'engine/directivePoll (Phase F fallback decision)');
    expect(typeof poll.phaseFFallbackDecision).toBe('function');
    expect(poll.phaseFFallbackDecision({ engineIntakeFlag: false, heartbeatFresh: true })).toBe('legacy');
    expect(poll.phaseFFallbackDecision({ engineIntakeFlag: false, heartbeatFresh: false })).toBe('legacy');
    expect(poll.phaseFFallbackDecision({ engineIntakeFlag: true, heartbeatFresh: true })).toBe('noop');
    expect(poll.phaseFFallbackDecision({ engineIntakeFlag: true, heartbeatFresh: false })).toBe('fallback');
  });

  test('F3-b: legacy poller exports are intact after the Phase F refactor', () => {
    const poll = impl('../directivePoll', 'engine/directivePoll');
    for (const name of ['queueRetry', 'dropPendingRetry', 'drainPendingRetry', 'drainDeadLetterRequeues',
      'recordRetryFailure', 'finalizeDelegation', 'executeDelegation', 'executeViaWorkflow', 'executeInline',
      'parseDelegationHeader', 'sanitizePostText', 'hasVerifiableEvidenceIn', 'countToolReceiptsSince',
      'linkDirectiveToTask', 'workflowModeEnabled']) {
      expect(typeof poll[name]).toBe('function');
    }
    expect(poll.MAX_REQUEUES).toBe(8);
    expect(poll.REQUEUE_COOLDOWN_MS).toBe(30 * 60 * 1000);
  });
});

describe('shared poll-state store (engine/directiveState)', () => {
  test('F3-c: round-trips state and saves a both-writers-writable file', () => {
    const st = impl('../directiveState', 'engine/directiveState');
    const file = path.join(TMP, 'poll-state-test.json');
    const state = { C0ASH4TF604: '123.456', _pendingRetry: [{ channel: 'C1', ts: '1.1' }] };
    st.savePollState(state, file);
    expect(fs.existsSync(file)).toBe(true);
    const mode = fs.statSync(file).mode;
    // owner + group + other write bits: root (poller) and macf (engine)
    // must both be able to replace this file regardless of who wrote it
    // last — a restrictive mode here wedges the handoff silently.
    expect(mode & 0o222).toBe(0o222);
    expect(st.loadPollState(file)).toEqual(state);
  });

  test('F3-c2: a missing or corrupt state file loads as empty state (never wedges)', () => {
    const st = impl('../directiveState', 'engine/directiveState');
    expect(st.loadPollState(path.join(TMP, 'does-not-exist.json'))).toEqual({});
    const bad = path.join(TMP, 'corrupt.json');
    fs.writeFileSync(bad, '{not json');
    expect(st.loadPollState(bad)).toEqual({});
  });
});
