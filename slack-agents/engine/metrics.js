#!/usr/bin/env node
// engine/metrics.js — The one metric that matters (P2.7, Oct 12, 2026).
//
// Replaces the "demos found/missing" theater with two honest numbers:
//   1. Tasks completed WITH EVIDENCE per 24h (done + has a comment/deliverable)
//   2. Median age of active tasks (hours since created)
//
// If #1 is zero, the system says zero — no more green checkmarks on heartbeats.
// Usage: node engine/metrics.js
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const DORMANT_RE = /hold-001|on hold|\bparked\b|guardrail/i;

async function main() {
  const TOKEN = (process.env.VIKUNJA_TOKEN || '').split('\n')[0].trim();
  if (!TOKEN) {
    console.error('[metrics] no Vikunja token');
    process.exit(1);
  }
  const base = process.env.VIKUNJA_URL || 'http://127.0.0.1:3456';
  const H = { 'Authorization': `Bearer ${TOKEN}` };
  const dayAgo = Date.now() - 24 * 3600 * 1000;

  let doneWithEvidence = 0;
  let doneTotal = 0;
  const activeAgesH = [];

  for (const pid of [2, 16]) {
    const res = await fetch(`${base}/api/v1/projects/${pid}/tasks`, { headers: H });
    if (!res.ok) continue;
    const data = await res.json();
    const tasks = Array.isArray(data) ? data : (data.tasks || []);
    for (const t of tasks) {
      const haystack = `${t.title || ''} ${t.description || ''}`;
      if (DORMANT_RE.test(haystack)) continue; // parked: not in the metric
      if (t.done) {
        doneTotal++;
        // Evidence = completed in last 24h AND has a substantive comment or description
        const doneAt = new Date(t.updated || 0).getTime();
        if (doneAt > dayAgo) {
          const cr = await fetch(`${base}/api/v1/tasks/${t.id}/comments`, { headers: H });
          const comments = cr.ok ? await cr.json() : [];
          const hasComment = comments.some(c => (c.comment || '').length > 50);
          const hasDesc = (t.description || '').length > 50;
          if (hasComment || hasDesc) doneWithEvidence++;
        }
      } else {
        const created = new Date(t.created || Date.now()).getTime();
        activeAgesH.push((Date.now() - created) / 3600 / 1000);
      }
    }
  }

  activeAgesH.sort((a, b) => a - b);
  const medianAgeH = activeAgesH.length
    ? activeAgesH[Math.floor(activeAgesH.length / 2)]
    : 0;

  const line = `[METRIC] tasks-completed-with-evidence/24h=${doneWithEvidence} ` +
    `(done-total-active-window=${doneTotal}) ` +
    `median-active-task-age-h=${medianAgeH.toFixed(1)} ` +
    `active-tasks=${activeAgesH.length}`;
  console.log(line);

  // Persist for the morning digest.
  const fs = require('fs');
  const path = require('path');
  try {
    fs.writeFileSync(
      path.join(__dirname, '.engine-metrics.json'),
      JSON.stringify({
        ts: new Date().toISOString(),
        doneWithEvidence24h: doneWithEvidence,
        medianActiveTaskAgeH: Number(medianAgeH.toFixed(1)),
        activeTasks: activeAgesH.length,
      }, null, 2)
    );
  } catch (e) {
    console.error('[metrics] persist failed:', e.message);
  }
}

if (require.main === module) {
  main().then(() => process.exit(0))
    .catch(e => { console.error('[metrics] fatal:', e.message); process.exit(1); });
}

module.exports = { main };
