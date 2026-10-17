#!/bin/bash
# Refresh MCP tokens on desktop (bypasses egress proxy), then sync to VM.
# Runs every 30 min via cron.

set -e
echo "[mcp-refresh] Starting at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Step 1: Run refresher on desktop
echo "[mcp-refresh] Running refresher on desktop..."
~/.ssh/desktop-ssh.sh 'powershell -c "node C:\Users\stay\mcp-token-refresher.js"' 2>&1 | head -5

# Step 2: Sync tokens back to VM
echo "[mcp-refresh] Syncing tokens to VM..."
~/workspace/macf/slack-agents/engine/sync-mcp-tokens.sh 2>&1

# Step 3: Credential PIPELINE health (Oct 12, 2026 — the Canva incident).
# Token expiry alone never warned Jesse: the daily check trusts "refresh token
# present", but the refresh CHAIN (desktop refresher + this sync) is what keeps
# short-lived tokens alive. If the chain is broken and a token is dying,
# exit 2 with a countdown so the cron worker escalates it as a credential
# emergency — not generic "desktop down" noise.
echo "[mcp-refresh] Checking credential pipeline health..."
node ~/workspace/macf/slack-agents/engine/credential-pipeline.js 2>&1 || {
  echo "[mcp-refresh] CREDENTIAL PIPELINE EMERGENCY (see above) — escalate to Jesse"
  exit 2
}

echo "[mcp-refresh] Done"
