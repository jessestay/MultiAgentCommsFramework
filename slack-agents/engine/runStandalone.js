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
const { HATCHET } = require('../config');
const { releaseLock } = require('./lock');

function main() {
  return mainAsync().catch((err) => {
    console.error('[standalone] fatal:', err && err.message);
    process.exit(1);
  });
}

async function mainAsync() {
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

  // Hatchet mode: the durable engine-tick workflow drives the cycle. The
  // worker owns the process lifecycle (including SIGTERM/SIGINT and the
  // immediate first tick), so none of the native wiring below runs.
  // HATCHET is read at module load (top-level require) so tests can
  // re-require with fresh env via jest.isolateModules.
  if (HATCHET.ENABLED) {
    console.log('[standalone] HATCHET_ENABLED=1 — booting embedded Hatchet engine');
    const hatchet = require('./hatchet');
    const lock = require('./lock');
    const client = await hatchet.createHatchetClient();
    // The work engine needs its Slack client even in Hatchet mode — without
    // init(), every tick skips with "no Slack client yet". (Bug found live
    // 2026-09-25: Hatchet engine ran but all cycles were no-ops.)
    const slackClient = new WebClient(token);
    workEngine.init({ client: slackClient });
    await hatchet.startEngineWorker(client, {
      runCycle: workEngine.runCycle,
      acquireLock: lock.acquireLock,
      releaseLock: lock.releaseLock,
      holderId: lock.holderId(),
    });
    return;
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

  // Keep the process alive: this no-op interval stays ref'd so the event
  // loop never drains, even if the engine's own interval is stopped.
  // (Never unref() it — an unref'd timer keeps nothing alive.)
  setInterval(() => {}, 1_000_000);
}

if (require.main === module) {
  main();
}

module.exports = { main };
