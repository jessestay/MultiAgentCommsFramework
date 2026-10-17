#!/bin/bash
# launch-engine.sh — start the MACF engine without secrets on the ps command line.
# The watchdog (root) writes non-world-readable secrets to .engine-env
# (macf:macf, 600) before invoking this via runuser. Sourcing a file keeps
# values out of /proc/<pid>/cmdline, unlike `env VAR="secret"`.
set -u
LAUNCH_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$LAUNCH_DIR/.engine-env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi
cd "$LAUNCH_DIR" || exit 1
exec node engine/runStandalone.js
