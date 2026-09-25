#!/bin/bash
# MACF 24/7 engine watchdog — restart the standalone engine if it isn't running.
# The engine itself is the service (internal 30-min loop, or Hatchet-driven when
# HATCHET_ENABLED=1); this is supervision only.
# Pattern lives in this file so pgrep never matches the caller's command line.
ENGINE_DIR="$HOME/workspace/macf/slack-agents"
ENGINE_LOG="$HOME/workspace/macf/engine-standalone.log"
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
