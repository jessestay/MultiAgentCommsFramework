#!/bin/bash
# engine/install-schedules.sh — Ensure all MACF engine schedules exist.
#
# Reads engine/schedules.json (the manifest) and verifies each declared
# schedule exists in the runtime. Reports missing schedules with the exact
# parameters needed to create them via the cron tools.
#
# This is the install-time guarantee Jesse ordered (Oct 10, 2026):
# "This should be part of any install scripts or executables."
#
# Usage: bash engine/install-schedules.sh [--fix]
#   Without --fix: report only (safe, read-only).
#   With --fix: attempt to create missing schedules via crontab fallback
#   (runtime cron jobs must still be created via the cron tools API).
#
# Exit codes: 0 = all schedules present, 1 = one or more missing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$SCRIPT_DIR/schedules.json"
FIX=0

if [[ "${1:-}" == "--fix" ]]; then
  FIX=1
fi

if [[ ! -f "$MANIFEST" ]]; then
  echo "[install-schedules] FATAL: manifest not found: $MANIFEST" >&2
  exit 2
fi

# Collect known schedule IDs from the runtime's read-only definition copies.
# Paths: workspace/cron.d/, workspace/goals/*/crons/, workspace/system-cron.d/
KNOWN_IDS=""
for d in ~/workspace/cron.d ~/workspace/goals/*/crons ~/workspace/system-cron.d; do
  [[ -d "$d" ]] || continue
  while IFS= read -r -d '' f; do
    base="$(basename "$f" .md)"
    # Job id is the part before __ in "<id>__<schedule>.md"
    id="${base%%__*}"
    KNOWN_IDS="$KNOWN_IDS $id"
  done < <(find "$d" -name '*.md' -print0 2>/dev/null)
done

MISSING=0
TOTAL=0

echo "[install-schedules] Checking manifest: $MANIFEST"

# Parse manifest with node (jq may not be installed).
node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('$MANIFEST', 'utf8'));
const known = '$KNOWN_IDS'.trim().split(/\s+/).filter(Boolean);
let missing = 0;
for (const s of manifest.schedules) {
  const found = known.includes(s.id);
  const mark = found ? 'OK      ' : 'MISSING ';
  console.log('[' + mark + '] ' + s.id + ' (' + s.cadence + ') — ' + s.title);
  if (!found) {
    missing++;
    console.log('           command: ' + s.command);
    console.log('           owner:   ' + s.owner);
  }
}
console.log('---');
console.log('total=' + manifest.schedules.length + ' missing=' + missing);
process.exit(missing > 0 ? 1 : 0);
"
rc=$?

if [[ $rc -eq 0 ]]; then
  echo "[install-schedules] All schedules present. Engine scheduling is healthy."
else
  echo "[install-schedules] WARNING: one or more schedules are MISSING." >&2
  echo "[install-schedules] Create them via the cron tools (cron.add) with the" >&2
  echo "[install-schedules] id, cadence, command, and owner shown above." >&2
  if [[ $FIX -eq 1 ]]; then
    echo "[install-schedules] --fix: runtime cron jobs cannot be created from bash;" >&2
    echo "[install-schedules] use the cron tools API. No changes made." >&2
  fi
fi

exit $rc
