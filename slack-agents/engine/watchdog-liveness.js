/**
 * watchdog-liveness.js — #807 Phase 4 (US-P4.2): the zombie-engine probe.
 *
 * The Oct 16, 2026 failure: Hatchet's embedded Postgres died while the
 * node engine + sidecar stayed alive. The watchdog's only engine check
 * was process presence, so it never restarted a stack that could execute
 * nothing (the log filled with PG connection-refused while every
 * watchdog run reported healthy).
 *
 * This probe judges LIVENESS, not presence:
 *   - a postgres postmaster for the engine-home data dir exists, AND
 *   - the engine heartbeat (.state/directive-intake/engine-heartbeat.json)
 *     is fresher than HEARTBEAT_STALE_MS.
 * A bad evaluation records a strike; STRIKES_TO_KILL consecutive bad
 * evaluations return 'zombie' and the watchdog kills + relaunches the
 * stack (the documented repair). The strike rule means a slow boot or a
 * single transient read can never trigger a kill. A healthy evaluation
 * resets the count.
 *
 * CLI (used by engine-watchdog.sh): prints the verdict word; exit codes
 * 0=healthy, 2=strike, 3=zombie. PG presence can be forced for tests
 * with MACF_PG_PRESENT=1/0.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HEARTBEAT_STALE_MS = 240000;
const STRIKES_TO_KILL = 2;

function heartbeatFile() {
  return process.env.MACF_HEARTBEAT_FILE
    || path.join(__dirname, '..', '.state', 'directive-intake', 'engine-heartbeat.json');
}
function stateFile() {
  return process.env.MACF_LIVENESS_STATE || path.join(__dirname, '.watchdog-liveness.json');
}

function pgPresent() {
  if (process.env.MACF_PG_PRESENT === '1') return true;
  if (process.env.MACF_PG_PRESENT === '0') return false;
  try {
    for (const pid of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(pid) || Number(pid) === process.pid) continue;
      try {
        const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
        if (cmd.includes('postgres') && cmd.includes('-D') && cmd.includes('engine-home')) return true;
      } catch { /* process vanished mid-scan */ }
    }
  } catch { /* /proc unavailable — treat as present (fail-open) */ return true; }
  return false;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return { strikes: 0 }; }
}
function saveState(s) {
  try { fs.writeFileSync(stateFile(), JSON.stringify(s)); } catch { /* best-effort */ }
}

function evaluateLiveness(opts = {}) {
  const pg = typeof opts.pgPresent === 'boolean' ? opts.pgPresent : pgPresent();
  const reasons = [];
  if (!pg) reasons.push('pg_missing');
  let heartbeatAgeMs = Infinity;
  try {
    const hb = JSON.parse(fs.readFileSync(heartbeatFile(), 'utf8'));
    if (typeof hb.at === 'number') heartbeatAgeMs = Date.now() - hb.at;
  } catch { /* missing/unreadable = stale */ }
  if (!(heartbeatAgeMs <= HEARTBEAT_STALE_MS)) reasons.push('heartbeat_stale');

  const state = loadState();
  if (!reasons.length) {
    if (state.strikes) saveState({ strikes: 0, lastHealthyAt: new Date().toISOString() });
    return { verdict: 'healthy', strikes: 0, reasons: [], heartbeatAgeMs };
  }
  const strikes = (state.strikes || 0) + 1;
  saveState({ strikes, lastBadAt: new Date().toISOString(), reasons });
  return {
    verdict: strikes >= STRIKES_TO_KILL ? 'zombie' : 'strike',
    strikes,
    reasons,
    heartbeatAgeMs: heartbeatAgeMs === Infinity ? null : heartbeatAgeMs,
  };
}

if (require.main === module) {
  const v = evaluateLiveness();
  console.log(JSON.stringify(v));
  process.exit(v.verdict === 'healthy' ? 0 : v.verdict === 'strike' ? 2 : 3);
}

module.exports = { evaluateLiveness, HEARTBEAT_STALE_MS, STRIKES_TO_KILL };
