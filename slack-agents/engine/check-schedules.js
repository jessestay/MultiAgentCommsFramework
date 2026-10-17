#!/usr/bin/env node
// engine/check-schedules.js — Verify engine schedules exist; self-heal if missing.
//
// Jesse's law (Oct 10, 2026): "It should have also been detected as missing
// by TDD and BDD." This is the runtime self-healing layer: it checks every
// schedule declared in schedules.json against the runtime's known schedules
// and reports (or repairs) any gap.
//
// The critical invariant: if autonomous-agent-driver is missing, agents go
// silent within the hour. That specific failure must NEVER go undetected.
//
// Usage:
//   node engine/check-schedules.js           # report only, exit 1 if missing
//   node engine/check-schedules.js --heal    # report + write heal-request file
//
// --heal writes engine/.schedule-heal-request.json listing missing schedules.
// The watchdog (or CEO) picks this up and recreates them via the cron tools.
// The script itself never creates runtime schedules directly — it has no API
// access. Detection is the guarantee; recreation is the operator's job.
//
// Exit codes: 0 = all present, 1 = one or more missing, 2 = manifest error.
'use strict';

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, 'schedules.json');
const HEAL_REQUEST_PATH = path.join(__dirname, '.schedule-heal-request.json');

// Runtime cron definition copies (read-only mirrors of saved jobs).
const CRON_DIRS = [
  path.join(process.env.HOME || '/home/hatch', 'workspace/cron.d'),
  path.join(process.env.HOME || '/home/hatch', 'workspace/system-cron.d'),
];

function collectKnownIds() {
  const ids = new Set();
  const goalsDir = path.join(process.env.HOME || '/home/hatch', 'workspace/goals');
  const dirs = [...CRON_DIRS];
  try {
    for (const g of fs.readdirSync(goalsDir)) {
      const cd = path.join(goalsDir, g, 'crons');
      if (fs.existsSync(cd)) dirs.push(cd);
    }
  } catch (e) { /* goals dir unreadable — skip */ }
  for (const d of dirs) {
    let files = [];
    try { files = fs.readdirSync(d); } catch (e) { continue; }
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      // "<id>__<schedule>.md" — id is the part before __
      const base = f.slice(0, -3);
      const idx = base.indexOf('__');
      ids.add(idx >= 0 ? base.slice(0, idx) : base);
    }
    // One level deeper (hourly/, minutely/, daily/ subdirs)
    for (const f of files) {
      const sub = path.join(d, f);
      let stat;
      try { stat = fs.statSync(sub); } catch (e) { continue; }
      if (!stat.isDirectory()) continue;
      let subfiles = [];
      try { subfiles = fs.readdirSync(sub); } catch (e) { continue; }
      for (const sf of subfiles) {
        if (!sf.endsWith('.md')) continue;
        const base = sf.slice(0, -3);
        const idx = base.indexOf('__');
        ids.add(idx >= 0 ? base.slice(0, idx) : base);
      }
    }
  }
  return ids;
}

function main() {
  const heal = process.argv.includes('--heal');

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    console.error(`[check-schedules] FATAL: cannot read manifest: ${e.message}`);
    process.exit(2);
  }

  const known = collectKnownIds();
  const missing = [];
  const present = [];

  for (const s of manifest.schedules) {
    if (known.has(s.id)) {
      present.push(s.id);
      console.log(`[check-schedules] OK       ${s.id} (${s.cadence})`);
    } else {
      missing.push(s);
      console.log(`[check-schedules] MISSING  ${s.id} (${s.cadence}) — ${s.title}`);
    }
  }

  console.log(`[check-schedules] ---`);
  console.log(`[check-schedules] present=${present.length} missing=${missing.length}`);

  // The critical invariant: the autonomous driver must never be silently absent.
  const driverMissing = missing.some(s => s.id === 'autonomous-agent-driver');
  if (driverMissing) {
    console.error('[check-schedules] CRITICAL: autonomous-agent-driver is NOT scheduled. Agents will go silent within the hour.');
  }

  if (missing.length > 0 && heal) {
    const request = {
      requested_at: new Date().toISOString(),
      missing: missing.map(s => ({
        id: s.id,
        title: s.title,
        cadence: s.cadence,
        command: s.command,
        owner: s.owner,
        purpose: s.purpose,
      })),
    };
    fs.writeFileSync(HEAL_REQUEST_PATH, JSON.stringify(request, null, 2));
    console.log(`[check-schedules] heal request written: ${HEAL_REQUEST_PATH}`);
  }

  process.exit(missing.length > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { collectKnownIds, MANIFEST_PATH, HEAL_REQUEST_PATH };
