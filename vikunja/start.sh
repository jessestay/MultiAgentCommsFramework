#!/bin/bash
# Fallback starter for the Vikunja API (MACF task board).
# The primary boot mechanism is the systemd service `vikunja`
# (/etc/systemd/system/vikunja.service). If that is missing (e.g. after a VM
# replacement wiped /etc), run this script to (re)launch the API:
#   ~/workspace/macf/vikunja/start.sh
set -euo pipefail
DIR="/home/hatch/workspace/macf/vikunja"
if curl -sf -o /dev/null http://127.0.0.1:3456/api/v1/info; then
  echo "Vikunja API already responding on 127.0.0.1:3456"
  exit 0
fi
# ROOT CAUSE FIX (Oct 10, 2026): nohup ... & NO LONGER survives session teardown.
# The runtime kills the whole PROCESS GROUP when the exec session ends, and
# nohup cannot escape a PGID-based kill. This is why Vikunja kept dying silently
# hours after every restart. setsid creates a new session + PGID so the process
# survives independently. Stdin detached to /dev/null.
setsid "$DIR/bin/vikunja" web --config "$DIR/config.yml" \
  >> "$DIR/logs/web.log" 2>&1 < /dev/null &
echo "Started Vikunja API (pid $!). Logs: $DIR/logs/web.log"
sleep 3
curl -sf -o /dev/null http://127.0.0.1:3456/api/v1/info && echo "API is up."
