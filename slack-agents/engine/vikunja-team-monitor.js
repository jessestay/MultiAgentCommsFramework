#!/usr/bin/env node
// vikunja-team-monitor.js — Poll Vikunja for team activity, detect stale tasks and deliveries.
// Runs via cron every 15 minutes. Tracks what each agent is working on, flags tasks
// that haven't been updated, and reports completions.
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');

const VIKUNJA_URL = process.env.VIKUNJA_URL || 'http://127.0.0.1:3456';
const TOKEN = process.env.VIKUNJA_TOKEN;
const STATE_PATH = path.join(__dirname, '.team-monitor-state.json');
const PROJECTS = [2, 16]; // MACF, Revenue Sprint

// Stale thresholds (hours)
const STALE_WARNING = 12;  // Flag if no update in 12h
const STALE_CRITICAL = 24; // Escalate if no update in 24h

// Root-cause fix (Oct 5, 2026): KNOWN-WAITING tasks are intentionally parked
// by Jesse's own decision, not neglected by the team. Flagging them stale
// every run is pure noise — and worse, it trains everyone to ignore the
// monitor. Tracked as active but excluded from staleness alerts; surfaced
// under KNOWN-WAITING so they stay visible without spamming the alert path.
// Add entries here when Jesse intentionally defers something; remove when
// the wait condition resolves.
const KNOWN_WAITING = {
  43: 'Intentionally deferred: Jesse confirmed Oct 3, 2026 he will NOT pay the USAA P&C bill until more revenue comes in (believes he has until the Oct 15 nonpayment cancellation notice). Re-check for resolution when revenue arrives.',
};

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return { tasks: {}, lastRun: null }; }
}

function saveState(s) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

async function getTasks(projectId) {
  const res = await fetch(`${VIKUNJA_URL}/api/v1/projects/${projectId}/tasks`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  if (!res.ok) throw new Error(`Vikunja API ${res.status} for project ${projectId}`);
  return res.json();
}

async function getComments(taskId) {
  const res = await fetch(`${VIKUNJA_URL}/api/v1/tasks/${taskId}/comments`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  if (!res.ok) return [];
  const c = await res.json();
  return Array.isArray(c) ? c : [];
}

function hoursSince(dateStr) {
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
}

// Cosmetic liveness touches (directive poller auto-comments) must NOT reset
// the staleness clock: they prove the poller ran, not that the owner did work.
// Root-cause fix (Oct 3, 2026): without this, cosmetic touches masked #80/#87
// going 16h+ without a real update.
function isCosmeticTouch(text) {
  return /active\s+via\s+directive\s+poll/i.test(text || '');
}

// Effective update time = last SUBSTANTIVE change. Cosmetic poller comments
// are skipped. A task.updated bump newer than the newest comment means a
// non-comment change (description/fields) happened — that's substantive.
async function effectiveUpdated(t) {
  try {
    const comments = await getComments(t.id);
    const newestCommentCreated = comments.length
      ? comments.reduce((m, c) => (c.created > m ? c.created : m), comments[0].created)
      : null;
    const newestCosmetic = comments.length &&
      comments.every(c => isCosmeticTouch(c.comment || c.text || ''));
    const latestSubstantive = comments
      .filter(c => !isCosmeticTouch(c.comment || c.text || ''))
      // Root-cause fix (Oct 3, 2026): initial value was `null`, and
      // `isoString > null` is ALWAYS false (Number('2026-…') is NaN), so the
      // reduce never advanced and every task with comments fell back to
      // t.created — producing false 100h+ "critical stale" alerts for tasks
      // with same-day substantive updates (#43, #75, …). '' compares correctly
      // against ISO timestamps and is falsy, so filter(Boolean) below still
      // drops it when there are no substantive comments.
      .reduce((m, c) => (c.created > m ? c.created : m), '');
    const nonCommentEdit = newestCommentCreated && t.updated > newestCommentCreated
      ? t.updated
      : null;
    const eff = [latestSubstantive, nonCommentEdit]
      .filter(Boolean)
      .sort()
      .pop() || t.created || t.updated;
    return { eff, cosmeticOnly: !!newestCosmetic };
  } catch (e) {
    return { eff: t.updated, cosmeticOnly: false }; // fail closed to old behavior
  }
}

function extractOwner(title) {
  // Task titles like "[CMO] Workshop promo" or "[execPM] Tracker"
  const m = title.match(/^\[([^\]]+)\]/);
  return m ? m[1].toLowerCase() : 'unassigned';
}

// Root-cause fix (Oct 11, 2026): the project task list does NOT carry the
// assignees field, so deriving owners from title prefixes produced false
// "[unassigned]" owners (e.g. #63, #75). Same class of bug the self-healer
// was fixed for on Oct 5. Fetch the full task and use its real assignees;
// fall back to the title prefix only when the API call fails.
async function getTaskOwner(t) {
  try {
    const res = await fetch(`${VIKUNJA_URL}/api/v1/tasks/${t.id}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    if (res.ok) {
      const full = await res.json();
      if (Array.isArray(full.assignees) && full.assignees.length > 0) {
        return full.assignees
          .map(a => (a.username || '').toLowerCase())
          .filter(Boolean)
          .join(',');
      }
    }
  } catch { /* fall through to title-prefix fallback */ }
  return extractOwner(t.title || '');
}

async function main() {
  if (!TOKEN) {
    console.error('[team-monitor] No VIKUNJA_TOKEN');
    process.exit(1);
  }

  const state = loadState();
  const now = new Date().toISOString();
  const report = {
    timestamp: now,
    stale: [],
    delivered: [],
    active: [],
    knownWaiting: [],
  };

  for (const pid of PROJECTS) {
    let tasks;
    try {
      tasks = await getTasks(pid);
    } catch (e) {
      console.error(`[team-monitor] Failed to fetch project ${pid}:`, e.message);
      continue;
    }

    for (const t of tasks) {
      const key = `${pid}:${t.id}`;
      const prev = state.tasks[key];
      const owner = await getTaskOwner(t);
      // Use substantive (cosmetic-touch-excluded) update time for staleness.
      const { eff: substantiveUpdated, cosmeticOnly } = await effectiveUpdated(t);
      const hours = hoursSince(substantiveUpdated);

      // Detect delivery (was not done, now done)
      if (t.done && prev && !prev.done) {
        report.delivered.push({
          id: t.id,
          title: t.title,
          owner,
          project: pid,
        });
      }

      // Track active tasks
      if (!t.done) {
        const entry = {
          id: t.id,
          title: t.title,
          owner,
          project: pid,
          updated: t.updated,
          substantiveUpdated,
          hoursStale: Math.round(hours * 10) / 10,
          cosmeticOnly,
        };
        report.active.push(entry);

        // Root-cause fix (Oct 3, 2026): the ENGINE LOCK task is a lock marker
        // ("do not complete") held by the engine — its description heartbeat is
        // not team work and its never-changing state is by design, not neglect.
        // Flagging it critical-stale every run is pure noise, so it is tracked
        // as active but excluded from staleness alerts.
        const isLockTask = /engine lock/i.test(t.title || '');
        const knownWaitingReason = KNOWN_WAITING[t.id];
        // P1.6 (Oct 12, 2026 — WIP cap): tasks parked via the [PARKED]
        // description marker are intentionally out of the active set until
        // throughput is proven. Visible, not alerted — same as known-waiting.
        const isWipParked = /hold-001|on hold|\bparked\b|guardrail/i
          .test(`${t.title || ''} ${t.description || ''}`);

        if (knownWaitingReason) {
          // Intentionally parked by Jesse's decision — visible, not alerted.
          report.knownWaiting.push({ ...entry, reason: knownWaitingReason });
        } else if (isWipParked) {
          report.knownWaiting.push({ ...entry, reason: 'WIP cap parked Oct 12 (#716) — restore by removing [PARKED] marker' });
        } else if (!isLockTask && hours >= STALE_CRITICAL) {
          report.stale.push({ ...entry, severity: 'CRITICAL' });
        } else if (!isLockTask && hours >= STALE_WARNING) {
          report.stale.push({ ...entry, severity: 'WARNING' });
        }
      }

      // Update state
      state.tasks[key] = {
        done: t.done,
        updated: t.updated,
        title: t.title,
      };
    }
  }

  state.lastRun = now;
  saveState(state);

  // Output report
  console.log(`[team-monitor] ${now}`);
  // P1.6: "active" means actionable — parked tasks are reported separately.
  const actionable = report.active.length - report.knownWaiting.length;
  console.log(`  Active tasks: ${actionable} actionable (${report.active.length} total incl. parked)`);
  console.log(`  Stale: ${report.stale.length}`);
  console.log(`  Known-waiting (intentionally parked, not alerted): ${report.knownWaiting.length}`);
  console.log(`  Delivered this run: ${report.delivered.length}`);

  if (report.delivered.length > 0) {
    console.log('\n  DELIVERED:');
    report.delivered.forEach(d => {
      console.log(`    ✅ #${d.id} [${d.owner}] ${d.title.substring(0, 60)}`);
    });
  }

  if (report.stale.length > 0) {
    console.log('\n  STALE TASKS:');
    // Sort by most stale first
    report.stale.sort((a, b) => b.hoursStale - a.hoursStale);
    report.stale.forEach(s => {
      console.log(`    ${s.severity === 'CRITICAL' ? '🔴' : '🟡'} #${s.id} [${s.owner}] ${s.title.substring(0, 50)} — ${s.hoursStale}h stale (substantive)${s.cosmeticOnly ? ' ⚠ cosmetic liveness touches only' : ''}`);
    });
  }

  if (report.knownWaiting.length > 0) {
    console.log('\n  KNOWN-WAITING:');
    report.knownWaiting.forEach(w => {
      console.log(`    ⏸ #${w.id} [${w.owner}] ${w.title.substring(0, 50)} — ${w.hoursStale}h since update — ${w.reason}`);
    });
  }

  // By owner summary
  const byOwner = {};
  report.active.forEach(t => {
    if (!byOwner[t.owner]) byOwner[t.owner] = 0;
    byOwner[t.owner]++;
  });
  console.log('\n  BY OWNER:');
  Object.entries(byOwner).sort((a, b) => b[1] - a[1]).forEach(([owner, count]) => {
    console.log(`    ${owner}: ${count} active`);
  });
}

main().catch(e => {
  console.error('[team-monitor] Fatal:', e.message);
  process.exit(1);
});
