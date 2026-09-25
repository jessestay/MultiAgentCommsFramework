#!/bin/bash
# MACF 24/7 engine watchdog — restart the standalone engine if it isn't running.
# The engine itself is the service (internal 30-min loop, or Hatchet-driven when
# HATCHET_ENABLED=1); this is supervision only.
# Pattern lives in this file so pgrep never matches the caller's command line.
ENGINE_DIR="$HOME/workspace/macf/slack-agents"
ENGINE_LOG="$HOME/workspace/macf/engine-standalone.log"
VIKUNJA_DIR="$HOME/workspace/macf/vikunja"
# Vikunja liveness: the task board must be up or the engine fail-closes every
# cycle. The VM reboots with no boot service for Vikunja (systemd unit is gone,
# no cron), so this 15-min watchdog is its supervision too. start.sh is
# idempotent (probe-first, exits 0 when already up).
if ! curl -sf --max-time 5 -o /dev/null http://127.0.0.1:3456/api/v1/info; then
  echo "watchdog: vikunja not responding, restarting"
  # Anchored at ^ so this can never match a shell whose command line merely
  # mentions the pattern (an unanchored pkill once killed its own caller).
  pkill -f "^/home/hatch/workspace/macf/vikunja/bin/vikunja web" 2>/dev/null || true
  sleep 1
  bash "$VIKUNJA_DIR/start.sh" || echo "watchdog: vikunja restart FAILED"
fi
if pgrep -f "node engine/runStandalone\.js" >/dev/null 2>&1; then
  exit 0
fi
cd "$ENGINE_DIR" || exit 1
if [ "${HATCHET_ENABLED:-0}" = "1" ]; then
  # Hatchet mode: the embedded engine boots a bundled Postgres whose initdb
  # refuses to run as root, so the engine runs as the dedicated non-root user
  # `macf` (HOME=/home/macf). The checkout is world-readable; secrets are NOT
  # opened to the macf user on disk — this (root) shell sources .env and the
  # variables are inherited by the macf process only (see engine/HATCHET.md).
  # The log redirect is opened by this root shell before the user switch, so
  # no log-file permission change is needed.
  set -a
  # shellcheck disable=SC1091
  . "$ENGINE_DIR/.env"
  set +a
  runuser -u macf -- env HOME=/home/macf HATCHET_ENABLED=1 \
    node engine/runStandalone.js >> "$ENGINE_LOG" 2>&1 &
else
  nohup node engine/runStandalone.js >> "$ENGINE_LOG" 2>&1 &
fi
echo "watchdog: engine was down, restarted pid $!"
