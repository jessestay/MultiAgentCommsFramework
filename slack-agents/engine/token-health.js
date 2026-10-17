'use strict';
// token-health.js — durable credential health for MCP servers.
//
// Why this exists (Oct 5, 2026): Jesse ordered "permanent tokens or some sort
// of solution so we don't have to keep doing this." Vendor reality:
//   - Figma PATs: 90-day MAXIMUM (Figma policy, Apr 2025). Non-expiring PATs
//     cannot be created. Permanent is impossible; rotation is mandatory.
//   - Canva (mcp-remote OAuth): refresh tokens are vendor-lifetime; ours was
//     rejected on refresh (Oct 5). No permanent token exists.
//   - n8n API keys: do NOT expire. A fresh key is permanent.
//   - Google: not configured yet; use production-mode OAuth (long-lived
//     refresh) when it is.
//
// The durable solution is therefore: longest-lived credential type per server
// + DAILY health checks + EARLY WARNING to Jesse days before breakage (with
// the exact re-auth step), instead of discovering a dead pipeline weeks later.
//
// Checks (fast, no network):
//   - mcp-remote servers (canva, buffer): ~/.mcp-auth/mcp-remote-v1/*_tokens.json
//     expires_at (ms). Warn < 7 days.
//   - figma: PAT (90-day max per Figma policy) — issue date tracked in state
//     file; warn at 75d. (Tried official mcp.figma.com OAuth Oct 5 — Figma
//     rejects dynamic client registration with 403 for non-catalog clients.)
//   - n8n: API keys do not expire — connectivity only (covered by jest suite).
//   - google: not configured yet.
// Connectivity (the real proof) comes from the jest suite
// engine/tests/mcp (run separately by the cron).
//
// State: engine/.token-health.json (manual-token issue dates; never values).
// CLI: node engine/token-health.js -> JSON summary, exit 0 (healthy) or 2 (needs attention)
//      node engine/token-health.js --record figma -> stamp FIGMA_TOKEN issue date = now

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_FILE = path.join(__dirname, '.token-health.json');

const MCP_AUTH_DIR = path.join(os.homedir(), '.mcp-auth', 'mcp-remote-v1');
const OAUTH_WARN_DAYS = 7;
// Manual-token servers (not mcp-remote): tracked by issue date.
const MANUAL_TOKENS = {
  figma: { max_days: 90, warn_days: 75, record_cmd: 'node engine/token-health.js --record figma' },
};

// Map a token-file hash prefix to a server name via the sibling client_info
// file when possible; fall back to the hash prefix.
function identifyServer(tokensPath) {
  try {
    const base = tokensPath.replace(/_tokens\.json$/, '');
    const info = JSON.parse(fs.readFileSync(base + '_client_info.json', 'utf8'));
    const raw = JSON.stringify(info).toLowerCase();
    if (raw.includes('canva')) return 'canva';
    if (raw.includes('buffer')) return 'buffer';
  } catch { /* fall through */ }
  return 'mcp-remote:' + path.basename(tokensPath).slice(0, 8);
}

function checkMcpRemoteTokens(authDir = MCP_AUTH_DIR) {
  const out = [];
  let files = [];
  try { files = fs.readdirSync(authDir).filter(f => f.endsWith('_tokens.json')); }
  catch { return [{ server: 'mcp-remote', status: 'unknown', detail: 'token store not found' }]; }
  for (const f of files) {
    const p = path.join(authDir, f);
    let d;
    try { d = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch { out.push({ server: identifyServer(p), status: 'unknown', detail: 'unreadable token file' }); continue; }
    const ms = d.expires_at;
    const server = identifyServer(p);
    if (typeof ms !== 'number') {
      out.push({ server, status: 'unknown', detail: 'no expires_at in token file' });
      continue;
    }
    const daysLeft = (ms - Date.now()) / 86400000;
    const hasRefresh = !!d.refresh_token;
    let status = 'ok';
    let detail = `access token valid ~${Math.max(0, Math.round(daysLeft * 24))}h`;
    if (daysLeft < 0 && !hasRefresh) {
      status = 'expired';
      detail = 'access token EXPIRED and no refresh token — re-authorization required';
    } else if (daysLeft < 0 && hasRefresh) {
      // Short-lived access token with a live refresh token is the NORMAL
      // steady state (Canva: 4h). mcp-remote refreshes on next use; the
      // connectivity test is the real proof. Only warn, never alarm.
      detail = 'access token expired; refresh token present — auto-renews on next use (connectivity test decides)';
    } else if (daysLeft < OAUTH_WARN_DAYS && hasRefresh) {
      detail = `access token expires in ~${daysLeft.toFixed(1)}d; refresh token present — auto-renews on use`;
    } else if (daysLeft < OAUTH_WARN_DAYS && !hasRefresh) {
      status = 'expiring';
      detail = `access token expires in ~${daysLeft.toFixed(1)}d and NO refresh token — re-authorization needed soon`;
    }
    out.push({ server, status, days_left: Math.round(daysLeft * 10) / 10, detail });
  }
  return out;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return {}; }
}

function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

function checkManualTokens(state = loadState(), now = Date.now()) {
  const out = [];
  for (const [server, cfg] of Object.entries(MANUAL_TOKENS)) {
    const issued = state[`${server}_token_issued_at`];
    if (!issued) {
      out.push({ server, status: 'unknown', detail: `no issue date recorded — run: ${cfg.record_cmd} after (re)issuing the token` });
      continue;
    }
    const ageDays = (now - issued) / 86400000;
    const left = cfg.max_days - ageDays;
    if (left < 0) out.push({ server, status: 'expired', days_left: Math.round(left * 10) / 10, detail: `token age ${Math.round(ageDays)}d exceeds ${cfg.max_days}d max — rotate now` });
    else if (ageDays >= cfg.warn_days) out.push({ server, status: 'expiring', days_left: Math.round(left * 10) / 10, detail: `token age ${Math.round(ageDays)}d of ${cfg.max_days}d max — rotate within ${Math.ceil(left)}d` });
    else out.push({ server, status: 'ok', days_left: Math.round(left * 10) / 10, detail: `token age ${Math.round(ageDays)}d of ${cfg.max_days}d max` });
  }
  return out;
}

function summarize(checks) {
  const needsJesse = checks.filter(c => c.status === 'expired' || c.status === 'expiring');
  return {
    checked_at: new Date().toISOString(),
    servers: checks,
    needs_attention: needsJesse.map(c => ({ server: c.server, status: c.status, detail: c.detail })),
    healthy: needsJesse.length === 0,
  };
}

function runAll() {
  return summarize([...checkMcpRemoteTokens(), ...checkManualTokens()]);
}

if (require.main === module) {
  if (process.argv[2] === '--record' && process.argv[3] === 'figma') {
    const s = loadState();
    s.figma_token_issued_at = Date.now();
    saveState(s);
    console.log(JSON.stringify({ recorded: 'figma', issued_at: new Date(s.figma_token_issued_at).toISOString(), max_days: 90 }));
  } else {
    const summary = runAll();
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.healthy ? 0 : 2);
  }
}

module.exports = { checkMcpRemoteTokens, checkManualTokens, summarize, runAll, loadState, saveState, OAUTH_WARN_DAYS, MANUAL_TOKENS };
