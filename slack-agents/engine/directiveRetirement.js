// engine/directiveRetirement.js — Phase F (Vikunja #789): the poller
// retirement tracker.
//
// CEO decision (Oct 16, 2026, stories appendix #3): the directive
// poller is deleted only after 7 CONSECUTIVE DAYS of trigger-driven
// traffic with zero missed directives. This module is the durable,
// unfakeable accounting behind that bar. It keeps one record per
// America/Denver day under the canonical .state dir:
//
//   scanCycles          engine intake cycles that ran (engine on duty)
//   engineFinalized     directives the engine path finalized
//   fallbackActivations times the cron poller had to resume full duty
//   missedDirectives    directives the audit found unhandled
//
// A day is CLEAN only when it is finalized at rollover with
// scanCycles > 0 (the engine was genuinely on duty — silence is not
// cleanliness), fallbackActivations === 0 and missedDirectives === 0.
// Days with no record at all break the streak for the same reason.
// Today is never counted before it ends; status() reports it
// separately as `today` with a `cleanSoFar` indicator.
//
// Writes are atomic (tmp + rename) and chmod 0644: the engine (macf)
// writes during normal operation and the poller (root) writes fallback
// activations — either side must always be able to READ the record,
// and the writer is whichever process is alive (the state-dir
// ownership pattern proven by the circuit breaker + intake state).
'use strict';

const fs = require('fs');
const path = require('path');
const { stateDir } = require('../utils/checkpointAdapters');

const RETIREMENT_BAR_DAYS = 7;
const DEFAULT_TIME_ZONE = 'America/Denver';

function resolveRetirementFile() {
  if (process.env.MACF_RETIREMENT_FILE) return process.env.MACF_RETIREMENT_FILE;
  return path.join(stateDir(), 'directive-retirement.json');
}

function createRetirementTracker({ file, now = () => Date.now(), barDays = RETIREMENT_BAR_DAYS, timeZone = DEFAULT_TIME_ZONE } = {}) {
  const target = file || resolveRetirementFile();
  const dayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  let seq = 0;

  function dayKey(ms) {
    return dayFmt.format(new Date(ms));
  }

  function blankDay() {
    return {
      scanCycles: 0, engineFinalized: 0,
      fallbackActivations: 0, missedDirectives: 0,
      finalized: false, clean: false,
    };
  }

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (parsed && typeof parsed === 'object' && parsed.days) return parsed;
    } catch { /* missing/corrupt → start fresh; rollover math tolerates it */ }
    return { days: {} };
  }

  function save(data) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.tmp-${process.pid}-${++seq}`;
    fs.writeFileSync(tmp, JSON.stringify({ ...data, updatedAt: new Date(now()).toISOString() }, null, 2), 'utf8');
    fs.renameSync(tmp, target);
    try { fs.chmodSync(target, 0o644); } catch { /* best effort */ }
  }

  function isCleanDay(rec) {
    return !!rec && rec.scanCycles > 0 && rec.fallbackActivations === 0 && rec.missedDirectives === 0;
  }

  // Finalize every recorded day strictly before today. Unrecorded days
  // stay absent (status() treats an absent day as a streak break).
  function rollover(data, today) {
    for (const key of Object.keys(data.days)) {
      if (key < today && !data.days[key].finalized) {
        data.days[key].finalized = true;
        data.days[key].clean = isCleanDay(data.days[key]);
      }
    }
    return data;
  }

  function mutate(fn) {
    const data = load();
    const today = dayKey(now());
    if (!data.days[today]) data.days[today] = blankDay();
    fn(data.days[today], data);
    rollover(data, today);
    save(data);
    return data;
  }

  function recordScanCycle() {
    mutate((day) => { day.scanCycles++; });
  }

  function recordEngineFinalized(n = 1) {
    if (!(n > 0)) return;
    mutate((day) => { day.engineFinalized += n; });
  }

  function recordFallbackActivation(reason) {
    mutate((day) => {
      day.fallbackActivations++;
      day.lastFallbackAt = new Date(now()).toISOString();
      if (reason) day.lastFallbackReason = String(reason).slice(0, 200);
    });
  }

  function recordMissedDirective(detail) {
    mutate((day) => {
      day.missedDirectives++;
      day.lastMissedAt = new Date(now()).toISOString();
      if (detail) day.lastMissed = detail;
    });
  }

  function status() {
    const data = load();
    const today = dayKey(now());
    rollover(data, today);
    save(data);
    // Walk backwards from yesterday over FINALIZED days; the first
    // missing or non-clean day ends the streak.
    let streak = 0;
    const cursor = new Date(`${today}T12:00:00Z`);
    for (;;) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      const key = dayFmt.format(cursor);
      const rec = data.days[key];
      if (rec && rec.finalized && rec.clean) { streak++; continue; }
      break;
    }
    const todayRec = data.days[today] || blankDay();
    const recentDays = Object.keys(data.days)
      .filter(k => data.days[k].finalized)
      .sort()
      .slice(-14)
      .map(k => ({ date: k, ...data.days[k] }));
    return {
      barDays,
      consecutiveCleanDays: streak,
      retired: streak >= barDays,
      today: {
        date: today,
        scanCycles: todayRec.scanCycles,
        engineFinalized: todayRec.engineFinalized,
        fallbackActivations: todayRec.fallbackActivations,
        missedDirectives: todayRec.missedDirectives,
        cleanSoFar: isCleanDay(todayRec),
      },
      days: recentDays,
    };
  }

  return {
    file: target,
    dayKey,
    recordScanCycle,
    recordEngineFinalized,
    recordFallbackActivation,
    recordMissedDirective,
    status,
  };
}

module.exports = { createRetirementTracker, resolveRetirementFile, RETIREMENT_BAR_DAYS };
