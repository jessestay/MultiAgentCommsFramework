#!/bin/bash
# Gateway watchdog — ensures meta-gateway.py never stays down.
# Checks every 2 minutes: TCP liveness first (connection refused = dead process
# → kill and restart). An HTTP probe follows for diagnostics only — a slow Meta
# upstream must never be mistaken for a dead gateway.
# Logs to ~/workspace/macf/slack-agents/meta-gateway-watchdog.log

GATEWAY_URL="http://127.0.0.1:4001/v1/chat/completions"
GATEWAY_DIR="$HOME/workspace/macf/slack-agents"
LOG="$GATEWAY_DIR/meta-gateway-watchdog.log"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1" >> "$LOG"
}

# Test if gateway process is alive and accepting connections
# Two-tier check (root-caused Oct 5, 2026 — the old check mistook a slow Meta
# upstream for a dead gateway: curl's 30s timeout fires while Meta is still
# thinking, curl prints 000, and the watchdog killed a HEALTHY gateway —
# causing the restart flapping seen in the log):
# 1. TCP connect: if connection refused → gateway process dead → restart.
#    This is the only reliable dead-process detector.
# 2. HTTP probe (informational only): if we get ANY HTTP response (even 500),
#    gateway is alive. A 000 here with a live TCP port means Meta is slow —
#    restarting the gateway cannot fix an upstream API issue, so DON'T restart.

if ! (echo > /dev/tcp/127.0.0.1/4001) 2>/dev/null; then
  # Connection refused — gateway process is dead
  log "Gateway not responding (connection refused), restarting..."
else
  HTTP_CODE=$(timeout 20 curl -s -o /dev/null -w "%{http_code}" -X POST "$GATEWAY_URL" \
    -H "Content-Type: application/json" \
    -d '{"model":"muse-spark-1.3","messages":[{"role":"user","content":"ping"}],"max_tokens":5}' \
    2>/dev/null)
  if [ "$HTTP_CODE" = "000" ]; then
    # TCP port accepted our connection, so the process is alive — the probe
    # just timed out, i.e. Meta upstream is slow. NOT a restart trigger.
    log "Gateway TCP alive but HTTP probe timed out (slow Meta upstream?) — NOT restarting"
  elif [ "$HTTP_CODE" != "200" ]; then
    # Got HTTP response but not 200 — gateway is alive, upstream Meta has an issue.
    # Restarting won't fix Meta. Log it and leave the gateway alone.
    log "Gateway alive (HTTP $HTTP_CODE) but Meta upstream error — NOT restarting (restart cannot fix upstream)"
  fi
  exit 0
fi

# Kill existing (anchored to avoid matching our own command line)
pkill -f "^python3 meta-gateway.py$" 2>/dev/null
sleep 3

# Restart with setsid (new session + PGID) so exec-session teardown can't kill it
# Use >> (append) not > (overwrite) to preserve diagnostic history
cd "$GATEWAY_DIR"
setsid nohup python3 meta-gateway.py >> meta-gateway.log 2>&1 < /dev/null &
sleep 5

# Verify — check if gateway accepts connections (not if Meta returns 200)
VERIFY_CODE=$(timeout 30 curl -s -o /dev/null -w "%{http_code}" -X POST "$GATEWAY_URL" \
  -H "Content-Type: application/json" \
  -d '{"model":"muse-spark-1.3","messages":[{"role":"user","content":"ping"}],"max_tokens":5}' \
  2>/dev/null)

if [ "$VERIFY_CODE" != "000" ]; then
  log "Gateway restarted successfully (HTTP $VERIFY_CODE)"
else
  log "Gateway restart FAILED (connection refused)"
fi
