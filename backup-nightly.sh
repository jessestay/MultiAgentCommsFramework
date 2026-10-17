#!/bin/bash
# MACF nightly backup -> Google Drive "MACF Backups" folder.
# Approved by Jesse Oct 16, 2026 (relocation + watchdog fix + nightly Drive backup).
# Scope: state that cannot be regenerated - Vikunja DB (consistent sqlite
# snapshot), directive poll state, agent config (.env, needed to rebuild
# without re-issuing every token), CEO memory + standing files, goal/cron
# definitions. Retention: Drive keeps 7 days; local staging keeps last 3.
set -u
HOME_DIR=/home/hatch
OUT=$HOME_DIR/workspace/macf/backups
STAGE=$OUT/.staging
DATE=$(date +%F)
NAME="macf-backup-$DATE.tar.gz"
FOLDER_ID=$(cat "$OUT/.drive-folder-id")
rm -rf "$STAGE"; mkdir -p "$STAGE/macf-backup"

# 1) Vikunja DB - consistent snapshot via sqlite backup API (WAL-safe)
python3 - "$HOME_DIR/workspace/macf/vikunja/data/vikunja.db" "$STAGE/macf-backup/vikunja.db" <<'PYEOF'
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
dst = sqlite3.connect(sys.argv[2])
src.backup(dst); dst.close(); src.close()
PYEOF
[ -s "$STAGE/macf-backup/vikunja.db" ] || { echo "BACKUP FAIL: vikunja snapshot"; exit 1; }

# 2) live state + config + memory + standing files
cp "$HOME_DIR/workspace/macf/slack-agents/engine/.directive-poll-state.json" "$STAGE/macf-backup/" 2>/dev/null
cp "$HOME_DIR/workspace/macf/slack-agents/.env" "$STAGE/macf-backup/slack-agents.env" 2>/dev/null
mkdir -p "$STAGE/macf-backup/root-files"
for f in MEMORY.md AGENTS.md USER.md SOUL.md IDENTITY.md PROACTIVE_PREFERENCES.md; do
  [ -f "$HOME_DIR/$f" ] && cp "$HOME_DIR/$f" "$STAGE/macf-backup/root-files/"
done
cp -a "$HOME_DIR/memory" "$STAGE/macf-backup/memory"
mkdir -p "$STAGE/macf-backup/goals"
for g in "$HOME_DIR"/workspace/goals/*/; do
  gn=$(basename "$g")
  if [ -f "$g/GOAL.md" ] || [ -d "$g/crons" ]; then mkdir -p "$STAGE/macf-backup/goals/$gn"; fi
  [ -f "$g/GOAL.md" ] && cp "$g/GOAL.md" "$STAGE/macf-backup/goals/$gn/"
  [ -d "$g/crons" ] && cp -a "$g/crons" "$STAGE/macf-backup/goals/$gn/"
done

# 3) tarball (must live inside the home dir for the Drive upload)
tar -czf "$OUT/$NAME" -C "$STAGE" macf-backup || { echo "BACKUP FAIL: tar"; exit 1; }
SIZE=$(stat -c %s "$OUT/$NAME")
echo "tarball: $OUT/$NAME ($SIZE bytes)"

# 4) upload into the private folder (create-with-upload)
RESP=$(/opt/hatch/bin/hatch_gws_cli drive files create --params '{"ignoreDefaultVisibility":true}' --json "{\"name\":\"$NAME\",\"parents\":[\"$FOLDER_ID\"]}" --upload "$OUT/$NAME" --upload-content-type application/gzip 2>&1) || { echo "BACKUP FAIL: drive upload: $RESP"; exit 1; }
FID=$(printf '%s' "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$FID" ] || { echo "BACKUP FAIL: no file id in upload response: $RESP"; exit 1; }
echo "uploaded: $NAME id=$FID"

# 5) retention - trash Drive backups older than 7 days (best effort)
/opt/hatch/bin/hatch_gws_cli drive files list --params "{\"q\":\"'$FOLDER_ID' in parents and trashed=false\",\"fields\":\"files(id,name,createdTime)\"}" 2>/dev/null | python3 -c "
import json,sys,datetime
try: files = json.load(sys.stdin).get('files', [])
except Exception: files = []
cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)
for f in files:
    if not f['name'].startswith('macf-backup-'): continue
    ct = datetime.datetime.fromisoformat(f['createdTime'].replace('Z','+00:00'))
    if ct < cutoff: print(f['id'])
" | while read -r old; do
  if [ -n "$old" ]; then
    /opt/hatch/bin/hatch_gws_cli drive files update --params "{\"fileId\":\"$old\"}" --json '{"trashed":true}' >/dev/null 2>&1 && echo "retention: trashed $old"
  fi
done

# 6) local cleanup: keep last 3 tarballs
ls -t "$OUT"/macf-backup-*.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm -f
rm -rf "$STAGE"
echo "BACKUP OK: $NAME ($SIZE bytes) -> Drive folder MACF Backups"
