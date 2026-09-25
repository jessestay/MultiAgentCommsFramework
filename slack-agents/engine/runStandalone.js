// engine/runStandalone.js — run the 24/7 work engine NOW, without the Socket bot.
//
// Usage: node engine/runStandalone.js
// Uses only the Slack Web API (chat.postMessage etc.) — no Socket Mode
// connection, so it never fights the desktop bot for the Socket slot.
// The Vikunja heartbeat lock (lock.js) guarantees only one engine copy
// works the board at a time.
'use strict';

require('dotenv').config();

const { WebClient } = require('@slack/web-api');
const { resolveSlackToken } = require('./slackToken');
const workEngine = require('./workEngine');
const tasks = require('../utils/tasks');
const { releaseLock } = require('./lock');

function main() {
  const token = resolveSlackToken();
  if (!token) {
    console.error('[standalone] no Slack token available (SLACK_BOT_TOKEN unset and custom.slack surrogate unavailable). Exiting.');
    process.exit(1);
    return; // exit() may be stubbed in tests — never start the engine below
  }
  if (!tasks.isEnabled()) {
    console.error('[standalone] Vikunja is not configured (VIKUNJA_URL/VIKUNJA_TOKEN) — nothing to work from. Exiting.');
    process.exit(1);
    return; // exit() may be stubbed in tests — never start the engine below
  }

  const client = new WebClient(token);
  console.log('[standalone] starting 24/7 work engine (Web API mode, no Socket)');
  workEngine.init({ client });

  const shutdown = (signal) => {
    console.log(`[standalone] ${signal} — shutting down`);
    workEngine.stop();
    releaseLock().finally(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Keep the process alive; the engine's own interval does the work.
  setInterval(() => {}, 1_000_000).unref();
}

if (require.main === module) {
  main();
}

module.exports = { main };
