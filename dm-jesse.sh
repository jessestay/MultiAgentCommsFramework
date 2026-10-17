#!/bin/bash
# dm-jesse.sh — send a Slack DM to Jesse (dual-delivery leg for investor updates).
# Usage: dm-jesse.sh "message text"
# Retries up to 3 times; exits non-zero if all fail so the caller KNOWS.
set -u
MSG="${1:?usage: dm-jesse.sh \"message text\"}"
for i in 1 2 3; do
  OUT=$(cd ~/workspace/macf/slack-agents && node -e "
require('/home/hatch/workspace/macf/slack-agents/node_modules/dotenv').config({ path: '/home/hatch/workspace/macf/slack-agents/.env' });
const { WebClient } = require('@slack/web-api');
const { resolveSlackToken } = require('./engine/slackToken');
(async () => {
  const client = new WebClient(resolveSlackToken());
  const r = await client.chat.postMessage({ channel: 'D0C2QE4PQJK', text: process.argv[1] });
  console.log('DM SENT: ' + r.ts);
})().catch(e => { console.log('DM FAILED: ' + (e.data && e.data.error)); process.exit(1); });
" "$MSG" 2>&1 | tail -1)
  echo "$OUT"
  case "$OUT" in DM\ SENT:*) exit 0;; esac
  sleep 3
done
echo "dm-jesse.sh: all 3 attempts failed" >&2
exit 1
