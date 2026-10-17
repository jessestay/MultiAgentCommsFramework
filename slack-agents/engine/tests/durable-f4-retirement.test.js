// durable-f4-retirement — Phase F (Vikunja #789, CEO decision Oct 16:
// "Phase F retirement window = 7 consecutive days of trigger-driven
// traffic with zero missed directives before the poller is deleted").
//
// The 7 days cannot elapse inside a build. What ships here is the
// machinery that makes the bar observable and unfakeable:
//
//   - a durable per-day record under .state (scan cycles, engine-
//     finalized directives, fallback activations, missed directives);
//   - a day counts CLEAN only if the engine was actually on duty
//     (≥1 scan cycle), no fallback activation happened, and no
//     directive was missed;
//   - days are finalized at rollover (America/Denver); a day with no
//     record at all breaks the streak — silence is not cleanliness;
//   - status() reports the current consecutive-clean-day streak and
//     whether the 7-day bar is met.
//
// Criteria encoded here:
//   F4-a  a clean day at rollover extends the streak by one.
//   F4-b  a fallback activation that day breaks the streak.
//   F4-c  a missed directive that day breaks the streak.
//   F4-d  a day with no scan cycles (engine never on duty) is not clean.
//   F4-e  seven consecutive clean days ⇒ retired = true; six ⇒ false.
//   F4-f  the tracker file is world-readable after every write (the
//         poller-as-root / engine-as-macf handoff rule).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function impl(rel, name) {
  try { return require(rel); }
  catch (e) { throw new Error(`missing implementation ${name}: ${e.message}`); }
}

const DAY_MS = 24 * 3600 * 1000;
// A fixed "now" at Denver midday (18:00Z = 12:00 MDT) so day keys are
// unambiguous in the America/Denver timezone the tracker uses.
const T0 = Date.parse('2026-10-20T18:00:00Z');

function makeTracker(startMs = T0) {
  const rt = impl('../directiveRetirement', 'engine/directiveRetirement');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'macf-f4-')), 'retirement.json');
  let nowMs = startMs;
  const tracker = rt.createRetirementTracker({ file, now: () => nowMs });
  return { tracker, file, advance: (ms) => { nowMs += ms; }, rt };
}

function cleanDay(t, advance) {
  t.recordScanCycle();
  t.recordEngineFinalized(3);
  advance(DAY_MS);
}

describe('US-F1.3 retirement tracker — clean-day accounting', () => {
  test('F4-a: a clean day extends the streak at rollover', () => {
    const { tracker, advance } = makeTracker();
    cleanDay(tracker, advance);
    const s = tracker.status();
    expect(s.consecutiveCleanDays).toBe(1);
    expect(s.retired).toBe(false);
  });

  test('F4-b: a fallback activation breaks the streak', () => {
    const { tracker, advance } = makeTracker();
    cleanDay(tracker, advance);
    tracker.recordScanCycle();
    tracker.recordFallbackActivation('engine heartbeat stale');
    advance(DAY_MS);
    const s = tracker.status();
    expect(s.consecutiveCleanDays).toBe(0);
  });

  test('F4-c: a missed directive breaks the streak', () => {
    const { tracker, advance } = makeTracker();
    cleanDay(tracker, advance);
    tracker.recordScanCycle();
    tracker.recordMissedDirective({ channel: 'C0ASH4TF604', ts: '1.234' });
    advance(DAY_MS);
    expect(tracker.status().consecutiveCleanDays).toBe(0);
  });

  test('F4-d: a day the engine never ran is not clean', () => {
    const { tracker, advance } = makeTracker();
    cleanDay(tracker, advance);
    advance(DAY_MS); // a full day with no records at all
    const s = tracker.status();
    expect(s.consecutiveCleanDays).toBe(0);
  });

  test('F4-e: seven consecutive clean days meet the retirement bar; six do not', () => {
    const { tracker, advance } = makeTracker();
    for (let i = 0; i < 6; i++) cleanDay(tracker, advance);
    expect(tracker.status().consecutiveCleanDays).toBe(6);
    expect(tracker.status().retired).toBe(false);
    cleanDay(tracker, advance);
    const s = tracker.status();
    expect(s.consecutiveCleanDays).toBe(7);
    expect(s.retired).toBe(true);
    expect(s.barDays).toBe(7);
  });

  test('F4-f: the tracker file is world-readable after writes', () => {
    const { tracker, file } = makeTracker();
    tracker.recordScanCycle();
    const mode = fs.statSync(file).mode;
    expect(mode & 0o004).not.toBe(0);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(Object.keys(parsed.days)).toHaveLength(1);
  });

  test('F4-g: today is reported separately and never counts toward the streak before rollover', () => {
    const { tracker } = makeTracker();
    tracker.recordScanCycle();
    tracker.recordEngineFinalized(2);
    const s = tracker.status();
    expect(s.consecutiveCleanDays).toBe(0);
    expect(s.today.scanCycles).toBe(1);
    expect(s.today.engineFinalized).toBe(2);
    expect(s.today.cleanSoFar).toBe(true);
  });
});
