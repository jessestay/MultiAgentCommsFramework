#!/bin/bash
# Sync refreshed MCP tokens from desktop to VM.
# The desktop runs mcp-token-refresher.js every 30 min (not behind egress proxy).
# This script pulls the refreshed tokens to the VM where mcp-remote runs.
# Run via cron every 30 min, offset 15 min from desktop refresh.

set -e
DESKTOP_AUTH="C:\\Users\\stay\\.mcp-auth\\mcp-remote-v1"
VM_AUTH="$HOME/.mcp-auth/mcp-remote-v1"

mkdir -p "$VM_AUTH"

# Pull each token file from desktop
for hash in 67a2071180bfcf76a3985779a9a38813 80231cc2e2c48a2ad3af48bba960953f; do
  echo "[sync] Pulling ${hash}_tokens.json from desktop..."
  ~/.ssh/desktop-ssh.sh "powershell -c \"Get-Content '${DESKTOP_AUTH}\\${hash}_tokens.json' -Raw\"" 2>/dev/null > "${VM_AUTH}/${hash}_tokens.json.tmp"
  if [ -s "${VM_AUTH}/${hash}_tokens.json.tmp" ]; then
    mv "${VM_AUTH}/${hash}_tokens.json.tmp" "${VM_AUTH}/${hash}_tokens.json"
    chmod 600 "${VM_AUTH}/${hash}_tokens.json"
    echo "[sync] Synced ${hash}"
  else
    echo "[sync] Failed to pull ${hash}"
    rm -f "${VM_AUTH}/${hash}_tokens.json.tmp"
  fi
done

echo "[sync] Done at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
