// utils/circuitBreaker.js — App-level circuit breaker for LLM routes.
// Phase C of the durable architecture (Vikunja #789, US-C1/US-C2), built
// Oct 16, 2026 on Jesse's direct order after the Graham #761 test died of
// empty-response streaks.
//
// WHY THIS EXISTS (A5.3 experiment, engine/phase-c-design-notes.md): the
// desktop LiteLLM gateway passes empty HTTP-200 completions through as
// SUCCESS and never falls back — LiteLLM fallbacks trigger on exceptions
// only. Before this module, the app layer had no memory across calls: every
// chatTurn rediscovered a streaking route by burning attempts (and up to
// 60s timeouts) on it, delegation after delegation, all night.
//
// CONTRACT:
//   - Per-route consecutive-EMPTY counting. Threshold default 3
//     (CEO-pinned; MACF_BREAKER_THRESHOLD overrides).
//   - At the threshold the route OPENS: callers skip it instantly
//     (fail-fast) for a cooldown (default 2 min, MACF_BREAKER_COOLDOWN_MS).
//   - After the cooldown, exactly ONE probe is allowed (half-open). Probe
//     success closes the breaker and resets everything; probe empty
//     re-opens with a doubled cooldown (capped, default 15 min,
//     MACF_BREAKER_COOLDOWN_MAX_MS).
//   - A success at any time resets the streak.
//   - Transport ERRORS do not touch the breaker — they already fall
//     through per-call (downModels in litellm.js). This breaker exists for
//     the failure mode errors can't express: "200 OK, said nothing."
//   - State is a JSON file shared across processes (the directive poller
//     is a fresh process every 5 min; the engine is long-running). Writes
//     are atomic (tmp + rename) and world-readable (root crons and the
//     macf engine share the tree — see utils/state.js, Oct 12 lesson).
//   - Trip and close transitions append to circuit-breaker-events.jsonl
//     beside the state file — the CEO alert seam (an empty streak is a
//     provider incident, not a task failure).
//   - MACF_BREAKER_DISABLED=1 is the ops safety valve: every call no-ops
//     and nothing is ever skipped.
'use strict';

const fs = require('fs');
const path = require('path');

function stateFilePath() {
  if (process.env.MACF_BREAKER_STATE_PATH) return process.env.MACF_BREAKER_STATE_PATH;
  if (process.env.MACF_STATE_DIR) return path.join(process.env.MACF_STATE_DIR, 'circuit-breaker.json');
  const canonical = '/home/hatch/workspace/macf/slack-agents/.state';
  if (fs.existsSync(canonical)) return path.join(canonical, 'circuit-breaker.json');
  return path.join(process.env.HOME || '/home/hatch', 'workspace', 'macf', 'slack-agents', '.state', 'circuit-breaker.json');
}

function eventsFilePath() {
  return path.join(path.dirname(stateFilePath()), 'circuit-breaker-events.jsonl');
}

function cfg() {
  const threshold = parseInt(process.env.MACF_BREAKER_THRESHOLD || '3', 10);
  const cooldown = parseInt(process.env.MACF_BREAKER_COOLDOWN_MS || '120000', 10);
  const cooldownMax = parseInt(process.env.MACF_BREAKER_COOLDOWN_MAX_MS || '900000', 10);
  return {
    disabled: process.env.MACF_BREAKER_DISABLED === '1',
    threshold: Number.isInteger(threshold) && threshold >= 1 ? threshold : 3,
    cooldownMs: Number.isInteger(cooldown) && cooldown > 0 ? cooldown : 120000,
    cooldownMaxMs: Number.isInteger(cooldownMax) && cooldownMax > 0 ? cooldownMax : 900000,
  };
}

function freshEntry(route, baseCooldownMs) {
  return {
    route,
    state: 'closed', // closed | open | half-open
    consecutiveEmpties: 0,
    trips: 0,
    openedAt: 0,
    openUntil: 0,
    cooldownMs: baseCooldownMs,
    // #807 Phase 1 (US-P1.2): LIFETIME per-route totals alongside the
    // streak state — the empty-rate metric the Phase 1 audit found missing
    // (streaks alone can't show a route's overall reliability).
    totals: { success: 0, empty: 0 },
  };
}

function totalsOf(entry) {
  const t = entry && entry.totals;
  return {
    success: t && Number.isInteger(t.success) ? t.success : 0,
    empty: t && Number.isInteger(t.empty) ? t.empty : 0,
  };
}

function loadAll() {
  try {
    const raw = fs.readFileSync(stateFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.routes && typeof parsed.routes === 'object') {
      return parsed;
    }
  } catch (e) { /* missing or corrupt -> fresh state; never crash the caller */ }
  return { routes: {} };
}

function saveAll(data) {
  const file = stateFilePath();
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  try { fs.chmodSync(tmp, 0o644); } catch { /* best effort */ }
  fs.renameSync(tmp, file);
}

function emitEvent(type, entry, now) {
  try {
    const evt = {
      type, // 'trip' | 'close'
      route: entry.route,
      at: new Date(now).toISOString(),
      trips: entry.trips,
      cooldownMs: entry.cooldownMs,
      consecutiveEmpties: entry.consecutiveEmpties,
    };
    fs.appendFileSync(eventsFilePath(), JSON.stringify(evt) + '\n', 'utf8');
    console.log(`[circuitBreaker] ${type.toUpperCase()} route=${entry.route} trips=${entry.trips} cooldownMs=${entry.cooldownMs}`);
  } catch (e) { /* the alert seam must never break the call path */ }
}

function entryFor(data, route) {
  if (!data.routes[route]) data.routes[route] = freshEntry(route, cfg().cooldownMs);
  const entry = data.routes[route];
  // Legacy entries (written before US-P1.2) gain zeroed totals on first touch.
  if (!entry.totals) entry.totals = totalsOf(entry);
  return entry;
}

function view(entry) {
  return {
    route: entry.route,
    state: entry.state,
    consecutiveEmpties: entry.consecutiveEmpties,
    trips: entry.trips,
    openedAt: entry.openedAt,
    openUntil: entry.openUntil,
    cooldownMs: entry.cooldownMs,
    totals: totalsOf(entry),
  };
}

/** Stored state for a route (no transitions performed). */
function getRouteState(route, now = Date.now()) { // eslint-disable-line no-unused-vars
  const data = loadAll();
  const entry = data.routes[route];
  if (!entry) return view(freshEntry(route, cfg().cooldownMs));
  return view(entry);
}

/**
 * Should the caller skip this route right now?
 * Side effect: when an open route's cooldown has elapsed, this call claims
 * the single half-open probe slot and returns false (probe may proceed);
 * concurrent callers then see half-open and skip until an outcome lands.
 */
function shouldSkip(route, now = Date.now()) {
  if (cfg().disabled) return false;
  const data = loadAll();
  const entry = data.routes[route];
  if (!entry || entry.state === 'closed') return false;
  if (entry.state === 'half-open') return true; // probe already in flight
  // state === 'open'
  if (now < entry.openUntil) return true;
  entry.state = 'half-open';
  saveAll(data);
  return false;
}

/** Record an empty (HTTP 200, no content, no tool calls) result. */
function recordEmpty(route, now = Date.now()) {
  const c = cfg();
  const data = loadAll();
  const entry = entryFor(data, route);
  if (c.disabled) return view(entry);
  entry.totals.empty += 1; // US-P1.2 lifetime totals (every recorded empty counts)
  if (entry.state === 'half-open') {
    // Failed probe: re-open with escalating cooldown.
    entry.state = 'open';
    entry.cooldownMs = Math.min(entry.cooldownMs * 2, c.cooldownMaxMs);
    entry.openedAt = now;
    entry.openUntil = now + entry.cooldownMs;
    entry.trips += 1;
    entry.consecutiveEmpties = c.threshold;
    saveAll(data);
    emitEvent('trip', entry, now);
    return view(entry);
  }
  if (entry.state === 'open') {
    // An attempt slipped through while open (e.g. claimed probe in another
    // process before the state write landed). Count it but do not extend
    // the current cooldown.
    entry.consecutiveEmpties += 1;
    saveAll(data);
    return view(entry);
  }
  entry.consecutiveEmpties += 1;
  if (entry.consecutiveEmpties >= c.threshold) {
    entry.state = 'open';
    entry.cooldownMs = c.cooldownMs;
    entry.openedAt = now;
    entry.openUntil = now + entry.cooldownMs;
    entry.trips += 1;
    saveAll(data);
    emitEvent('trip', entry, now);
    return view(entry);
  }
  saveAll(data);
  return view(entry);
}

/** Record a successful (non-empty) result. Resets the streak; closes an
 *  open/half-open breaker and restores the base cooldown. */
function recordSuccess(route, now = Date.now()) {
  const c = cfg();
  const data = loadAll();
  const entry = entryFor(data, route);
  entry.totals.success += 1; // US-P1.2 lifetime totals
  const wasOpen = entry.state === 'open' || entry.state === 'half-open';
  entry.state = 'closed';
  entry.consecutiveEmpties = 0;
  entry.openUntil = 0;
  entry.openedAt = 0;
  entry.cooldownMs = c.cooldownMs;
  saveAll(data);
  if (wasOpen) emitEvent('close', entry, now);
  return view(entry);
}

/** Clear all breaker state + events (tests and ops resets). */
function resetAll() {
  try { fs.unlinkSync(stateFilePath()); } catch { /* absent is fine */ }
  try { fs.unlinkSync(eventsFilePath()); } catch { /* absent is fine */ }
}

module.exports = {
  shouldSkip,
  recordEmpty,
  recordSuccess,
  getRouteState,
  resetAll,
  _stateFilePath: stateFilePath,
  _eventsFilePath: eventsFilePath,
};
