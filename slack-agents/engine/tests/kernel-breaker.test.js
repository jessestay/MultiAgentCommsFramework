// kernel-breaker.test.js — Phase C (Vikunja #789, US-C1/US-C2), built Oct 16,
// 2026 on Jesse's direct order ("Build the circuit breaker now, today").
//
// The A5.3 experiment (engine/phase-c-design-notes.md) proved the desktop
// LiteLLM gateway passes empty HTTP-200 completions through as success and
// never falls back — so emptiness detection and circuit breaking must live
// at the APP layer. This suite pins the breaker contract:
//   - per-route consecutive-empty counting (CEO-pinned threshold: 3)
//   - trip -> route is skipped (fail-fast) for a cooldown
//   - after the cooldown, exactly ONE probe is allowed (half-open)
//   - probe empty -> re-open with escalating cooldown; probe success -> close
//   - success at any time resets the streak
//   - state persists on disk across processes (the poller is a fresh
//     process every 5 minutes; an in-memory breaker would be useless)
//   - MACF_BREAKER_DISABLED=1 is the ops safety valve
//
// All time-dependent assertions use the module's injectable `now` parameter —
// no fake timers, no sleeps.

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-breaker-'));
process.env.MACF_BREAKER_STATE_PATH = path.join(TMP, 'circuit-breaker.json');
delete process.env.MACF_BREAKER_DISABLED;
delete process.env.MACF_BREAKER_THRESHOLD;

const breaker = require('../../utils/circuitBreaker');

const T0 = 1_700_000_000_000; // fixed epoch for deterministic time travel

beforeEach(() => {
  breaker.resetAll();
  delete process.env.MACF_BREAKER_THRESHOLD;
  delete process.env.MACF_BREAKER_DISABLED;
});

describe('circuitBreaker — counting and tripping', () => {
  test('a fresh route is closed and never skipped', () => {
    expect(breaker.shouldSkip('macf-smart-paid', T0)).toBe(false);
    expect(breaker.getRouteState('macf-smart-paid', T0).state).toBe('closed');
    expect(breaker.getRouteState('macf-smart-paid', T0).consecutiveEmpties).toBe(0);
  });

  test('empties below the threshold do not trip (threshold = 3)', () => {
    breaker.recordEmpty('r', T0);
    breaker.recordEmpty('r', T0 + 1000);
    expect(breaker.getRouteState('r', T0 + 2000).consecutiveEmpties).toBe(2);
    expect(breaker.shouldSkip('r', T0 + 2000)).toBe(false);
  });

  test('the third consecutive empty trips the breaker', () => {
    breaker.recordEmpty('r', T0);
    breaker.recordEmpty('r', T0 + 1000);
    const entry = breaker.recordEmpty('r', T0 + 2000);
    expect(entry.state).toBe('open');
    expect(breaker.shouldSkip('r', T0 + 3000)).toBe(true);
  });

  test('a success resets the streak before it can trip', () => {
    breaker.recordEmpty('r', T0);
    breaker.recordEmpty('r', T0 + 1);
    breaker.recordSuccess('r', T0 + 2);
    breaker.recordEmpty('r', T0 + 3);
    breaker.recordEmpty('r', T0 + 4);
    expect(breaker.getRouteState('r', T0 + 5).consecutiveEmpties).toBe(2);
    expect(breaker.shouldSkip('r', T0 + 5)).toBe(false);
  });

  test('routes are isolated: tripping one does not affect another', () => {
    for (let i = 0; i < 3; i++) breaker.recordEmpty('route-a', T0 + i);
    expect(breaker.shouldSkip('route-a', T0 + 10)).toBe(true);
    expect(breaker.shouldSkip('route-b', T0 + 10)).toBe(false);
  });

  test('MACF_BREAKER_THRESHOLD env overrides the trip point', () => {
    process.env.MACF_BREAKER_THRESHOLD = '2';
    breaker.recordEmpty('r', T0);
    const entry = breaker.recordEmpty('r', T0 + 1);
    expect(entry.state).toBe('open');
  });

  test('MACF_BREAKER_DISABLED=1: never trips, never skips', () => {
    process.env.MACF_BREAKER_DISABLED = '1';
    for (let i = 0; i < 6; i++) breaker.recordEmpty('r', T0 + i);
    expect(breaker.shouldSkip('r', T0 + 10)).toBe(false);
    expect(breaker.getRouteState('r', T0 + 10).state).toBe('closed');
  });
});

describe('circuitBreaker — half-open probing and escalation', () => {
  function trip(route, now) {
    for (let i = 0; i < 3; i++) breaker.recordEmpty(route, now + i);
    return breaker.getRouteState(route, now + 3);
  }

  test('an open route is skipped until its cooldown elapses', () => {
    const entry = trip('r', T0);
    expect(breaker.shouldSkip('r', entry.openUntil - 1)).toBe(true);
    expect(breaker.getRouteState('r', entry.openUntil - 1).state).toBe('open');
  });

  test('after the cooldown exactly one probe is allowed', () => {
    const entry = trip('r', T0);
    const t = entry.openUntil + 1;
    expect(breaker.shouldSkip('r', t)).toBe(false); // the probe
    expect(breaker.getRouteState('r', t).state).toBe('half-open');
    expect(breaker.shouldSkip('r', t + 1)).toBe(true); // no second probe while one is in flight
  });

  test('a failed probe re-opens with an escalated cooldown', () => {
    const entry = trip('r', T0);
    const t = entry.openUntil + 1;
    breaker.shouldSkip('r', t); // take the probe
    const reopened = breaker.recordEmpty('r', t + 1);
    expect(reopened.state).toBe('open');
    expect(reopened.cooldownMs).toBeGreaterThan(entry.cooldownMs);
    expect(reopened.openUntil).toBe(t + 1 + reopened.cooldownMs);
    expect(breaker.shouldSkip('r', t + 2)).toBe(true);
  });

  test('a successful probe closes the breaker and resets the cooldown', () => {
    const entry = trip('r', T0);
    const t = entry.openUntil + 1;
    breaker.shouldSkip('r', t);
    breaker.recordEmpty('r', t + 1); // failed probe -> escalated
    const reopened = breaker.getRouteState('r', t + 2);
    const t2 = reopened.openUntil + 1;
    expect(breaker.shouldSkip('r', t2)).toBe(false); // second probe
    const closed = breaker.recordSuccess('r', t2 + 1);
    expect(closed.state).toBe('closed');
    expect(closed.consecutiveEmpties).toBe(0);
    expect(closed.cooldownMs).toBe(entry.cooldownMs); // back to base
    expect(breaker.shouldSkip('r', t2 + 2)).toBe(false);
  });
});

describe('circuitBreaker — persistence and robustness', () => {
  test('state survives a fresh module instance (cross-process reality)', () => {
    for (let i = 0; i < 3; i++) breaker.recordEmpty('r', T0 + i);
    jest.resetModules();
    const fresh = require('../../utils/circuitBreaker');
    expect(fresh.shouldSkip('r', T0 + 10)).toBe(true);
    expect(fresh.getRouteState('r', T0 + 10).trips).toBe(1);
  });

  test('a corrupt state file is treated as fresh state, never a crash', () => {
    fs.writeFileSync(process.env.MACF_BREAKER_STATE_PATH, '{not json!!');
    expect(breaker.shouldSkip('r', T0)).toBe(false);
    const entry = breaker.recordEmpty('r', T0);
    expect(entry.consecutiveEmpties).toBe(1);
  });

  test('tripping appends a trip event to the events log (CEO alert seam)', () => {
    for (let i = 0; i < 3; i++) breaker.recordEmpty('r', T0 + i);
    for (let i = 0; i < 2; i++) breaker.recordEmpty('r2', T0 + i); // no trip
    const eventsPath = path.join(TMP, 'circuit-breaker-events.jsonl');
    const lines = fs.readFileSync(eventsPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const evt = JSON.parse(lines[0]);
    expect(evt.type).toBe('trip');
    expect(evt.route).toBe('r');
  });

  test('closing after a trip appends a close event', () => {
    for (let i = 0; i < 3; i++) breaker.recordEmpty('r', T0 + i);
    const entry = breaker.getRouteState('r', T0 + 3);
    const t = entry.openUntil + 1;
    breaker.shouldSkip('r', t);
    breaker.recordSuccess('r', t + 1);
    const eventsPath = path.join(TMP, 'circuit-breaker-events.jsonl');
    const types = fs.readFileSync(eventsPath, 'utf8').trim().split('\n').map(l => JSON.parse(l).type);
    expect(types).toEqual(['trip', 'close']);
  });
});
