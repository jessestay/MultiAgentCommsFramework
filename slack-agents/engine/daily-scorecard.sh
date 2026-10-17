#!/bin/bash
# Daily delivery scorecard updater — runs via cron, updates CEO_REPAIR_QUEUE.md
# Counts verified deliveries and completed tasks for yesterday.

ENGINE_DIR="$HOME/workspace/macf/slack-agents/engine"
QUEUE_FILE="$HOME/workspace/macf/CEO_REPAIR_QUEUE.md"
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d)

# Count verified in verify state
VERIFIED=$(python3 -c "
import json
try:
    with open('$ENGINE_DIR/.directive-verify-state.json') as f:
        d = json.load(f)
    print(len(d.get('verified', [])))
except: print(0)
")

# Update scorecard table (append row if not exists)
if ! grep -q "| $YESTERDAY |" "$QUEUE_FILE"; then
    # Insert before the Target line
    sed -i "/^\*\*Target:/i | $YESTERDAY | $VERIFIED | TBD | Auto-updated |" "$QUEUE_FILE"
    echo "Scorecard updated: $YESTERDAY = $VERIFIED verified"
else
    echo "Scorecard already has $YESTERDAY"
fi
