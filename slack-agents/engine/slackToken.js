// engine/slackToken.js — resolve a Slack bot token without ever exposing it.
//
// Priority:
//   1. SLACK_BOT_TOKEN env (desktop .env path).
//   2. The stored `custom.slack` connector via authd surrogate (VM path).
//      The surrogate is an opaque hsurr:* reference, NOT the real token —
//      the egress proxy swaps it for the real credential on requests to
//      slack.com. It is only ever sent to slack.com, never printed or logged.
'use strict';

const { execFileSync } = require('child_process');

const SURROGATE_FETCH = `
import sys
import os as _os
for _p in ('/opt/hatch/skills/skill-creator/bin', '/opt/muse/skills/custom-connector-setup/bin', '/opt/hatch/workflow-skills/custom-connector-setup/bin'):
    if _os.path.exists(_p + '/dynamic_credentials.py'):
        sys.path.insert(0, _p)
        break
from dynamic_credentials import dynamic_credential_entry
entry = dynamic_credential_entry("custom.slack")
sys.stdout.write(entry["surrogate"])
`;

function getSurrogate() {
  try {
    const out = execFileSync('python3', ['-c', SURROGATE_FETCH], {
      encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (out.startsWith('hsurr:')) return out;
  } catch (_) { /* fall through */ }
  return null;
}

function resolveSlackToken() {
  if (process.env.SLACK_BOT_TOKEN) return process.env.SLACK_BOT_TOKEN;
  return getSurrogate();
}

module.exports = { resolveSlackToken };
