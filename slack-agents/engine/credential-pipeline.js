// engine/credential-pipeline.js — Credential PIPELINE health, not just token expiry.
//
// Root cause of the Oct 12, 2026 Canva incident: token-health.js checks token
// EXPIRY ("refresh token present → auto-renews") but never checks whether the
// thing that performs the refresh is alive. The desktop went down at ~05:02,
// the 30-min refresh+sync chain broke, and the cached Canva token (3-4h TTL)
// died at ~05:33 with no advance warning — the daily check only snapshots.
//
// This script computes the countdown the old monitor never did:
//   (cached token time-to-live) vs (refresh pipeline freshness)
// Exit 0: pipeline healthy or tokens have comfortable TTL.
// Exit 2: PIPELINE EMERGENCY — refresh chain broken AND a token expires
//         within LEAD_MINUTES. The caller must escalate to Jesse with the
//         countdown, not file it under generic "desktop down" noise.
//
// Usage: node engine/credential-pipeline.js [--json]
// Wired into refresh-and-sync-mcp.sh (runs every 30 min).
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const AUTH_DIR = path.join(os.homedir(), '.mcp-auth', 'mcp-remote-v1');
// Server order matches sync-mcp-tokens.sh hash order.
const SERVERS = [
  { name: 'canva', hash: '67a2071180bfcf76a3985779a9a38813' },
  { name: 'buffer', hash: '80231cc2e2c48a2ad3af48bba960953f' },
];
const LEAD_MINUTES = 120;   // warn when a token dies within 2h
const STALE_SYNC_MINUTES = 45; // pipeline "broken" if no successful sync in 45 min

function checkServer({ name, hash }) {
  const file = path.join(AUTH_DIR, `${hash}_tokens.json`);
  let stat;
  try { stat = fs.statSync(file); }
  catch { return { server: name, status: 'no_token', detail: 'no cached token file on VM (OAuth never completed)' }; }
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return { server: name, status: 'unreadable', detail: e.message }; }
  const exp = data.expires_at || data.expiresAt || (data.token && data.token.expires_at);
  const now = Date.now();
  const ttlMin = exp ? Math.round((Number(exp) - now) / 60000) : null;
  const syncAgeMin = Math.round((now - stat.mtimeMs) / 60000);
  return { server: name, status: 'ok', ttlMin, syncAgeMin, expired: ttlMin !== null && ttlMin <= 0 };
}

function main() {
  const results = SERVERS.map(checkServer);
  const emergencies = results.filter(r =>
    r.status === 'ok' && r.ttlMin !== null && r.ttlMin <= LEAD_MINUTES && r.syncAgeMin > STALE_SYNC_MINUTES
  );
  const asJson = process.argv.includes('--json');
  if (asJson) {
    console.log(JSON.stringify({ results, emergencies: emergencies.map(e => e.server) }, null, 2));
  } else {
    for (const r of results) {
      if (r.status !== 'ok') console.log(`[credential-pipeline] ${r.server}: ${r.status} — ${r.detail}`);
      else console.log(`[credential-pipeline] ${r.server}: TTL ${r.ttlMin} min, last sync ${r.syncAgeMin} min ago${r.expired ? ' (EXPIRED)' : ''}`);
    }
    if (emergencies.length) {
      for (const e of emergencies) {
        console.log(`[credential-pipeline] EMERGENCY: ${e.server} token ${e.expired ? 'EXPIRED' : `expires in ${e.ttlMin} min`} and no successful refresh+sync for ${e.syncAgeMin} min — refresh chain is broken. Jesse action needed at next desktop access.`);
      }
    } else {
      console.log('[credential-pipeline] pipeline healthy (or tokens have comfortable TTL)');
    }
  }
  process.exit(emergencies.length ? 2 : 0);
}

if (require.main === module) main();
module.exports = { checkServer, LEAD_MINUTES, STALE_SYNC_MINUTES };
