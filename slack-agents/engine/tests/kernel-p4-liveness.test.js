// kernel-p4-liveness.test.js — #807 Phase 4 (US-P4.2).
//
// The zombie state (Oct 16, 2026): engine node + sidecar alive, embedded
// Postgres dead — the watchdog saw processes and never restarted, while
// the engine could execute nothing. watchdog-liveness.js is the probe:
// PG presence + heartbeat freshness, with a 2-strike rule so a slow boot
// is never killed. Verdicts: healthy / strike / zombie.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-p4-'));
const HB = path.join(TMP, 'heartbeat.json');
const STATE = path.join(TMP, 'liveness.json');
process.env.MACF_HEARTBEAT_FILE = HB;
process.env.MACF_LIVENESS_STATE = STATE;

const { evaluateLiveness } = require('../watchdog-liveness');

function setHeartbeat(ageMs) {
  fs.writeFileSync(HB, JSON.stringify({ at: Date.now() - ageMs }));
}

describe('US-P4.2 — watchdog liveness probe', () => {
  beforeEach(() => { try { fs.unlinkSync(STATE); } catch { /* fresh */ } });

  test('PG present + fresh heartbeat → healthy, strikes reset', () => {
    setHeartbeat(5000);
    const v = evaluateLiveness({ pgPresent: true });
    expect(v.verdict).toBe('healthy');
    expect(v.strikes).toBe(0);
  });

  test('PG dead + fresh heartbeat → first strike, not yet zombie', () => {
    setHeartbeat(5000);
    const v = evaluateLiveness({ pgPresent: false });
    expect(v.verdict).toBe('strike');
    expect(v.strikes).toBe(1);
    expect(v.reasons).toContain('pg_missing');
  });

  test('second consecutive bad evaluation → zombie', () => {
    setHeartbeat(5000);
    evaluateLiveness({ pgPresent: false });
    const v = evaluateLiveness({ pgPresent: false });
    expect(v.verdict).toBe('zombie');
    expect(v.strikes).toBe(2);
  });

  test('stale heartbeat (>240s) is a zombie sign even with PG present', () => {
    setHeartbeat(300000);
    const v = evaluateLiveness({ pgPresent: true });
    expect(v.verdict).toBe('strike');
    expect(v.reasons).toContain('heartbeat_stale');
  });

  test('recovery clears strikes', () => {
    setHeartbeat(5000);
    evaluateLiveness({ pgPresent: false });
    const v = evaluateLiveness({ pgPresent: true });
    expect(v.verdict).toBe('healthy');
    const after = evaluateLiveness({ pgPresent: false });
    expect(after.strikes).toBe(1);
  });

  test('missing heartbeat file counts as stale', () => {
    try { fs.unlinkSync(HB); } catch { /* already gone */ }
    const v = evaluateLiveness({ pgPresent: true });
    expect(v.reasons).toContain('heartbeat_stale');
  });
});
