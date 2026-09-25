# Hatchet — MACF durable execution layer

**Status: implemented, flag-gated OFF.** The native in-process 30-min loop
remains the active driver. Nothing here runs until `HATCHET_ENABLED=1` is
deliberately set (a separately-authorized step).

## Why

The native engine (`workEngine`'s `setInterval`) loses the in-flight cycle on
any crash/restart and has no retry, no visibility, and no crash-resume. Hatchet
(embedded, MIT, $0 infra) wraps the *existing* cycle logic in a durable
workflow: a crash anywhere resumes the tick instead of silently stopping the
team. MACF keeps its Vikunja lock, Slack personas, PM logic, escalation rules,
and idle-revenue behavior — Hatchet only provides durable scheduling.

No custom orchestrator was built; no Paperclip spike. CIO decision, 2026-09-25.

## How it works

- `engine/hatchet.js`
  - `createHatchetClient()` — boots a full Hatchet engine in-process via
    `HatchetEmbeddedClient.init()` (bundled Postgres). No token, no account,
    no Docker, no cloud.
  - `registerEngineWorkflows(hatchet, deps)` — registers ONE durable task
    `engine-tick-task` (`retries: 3`, `backoff: { factor: 2, maxSeconds: 300 }`),
    ONE workflow `engine-tick` wrapping it, and a cron trigger
    `engine-tick-cron` with the expression from `config.HATCHET.CRON`
    (default `*/30 * * * *`, override via `HATCHET_CRON`).
  - `runEngineTick(deps)` — the tick body: acquires the Vikunja heartbeat
    lock FIRST (`engine/lock.js`, fail-closed, skips when another instance
    holds it), then invokes the EXISTING `workEngine.runCycle()`. Cycle
    internals were not rewritten.
  - `startEngineWorker(hatchet, deps)` — registers workflows, starts the
    `engine-worker`, fires ONE immediate tick (mirrors the native 90s
    first-cycle), wires SIGTERM/SIGINT → `worker.stop()` →
    `releaseLock({holderId})` → `client.stopEmbedded()` → `process.exit(0)`.
- `engine/runStandalone.js` — when `HATCHET_ENABLED=1`, boots the Hatchet
  client + worker instead of `workEngine.init()`. Flag off (default): the
  existing path runs byte-for-byte unchanged.
- `config.js` — `HATCHET = { ENABLED: process.env.HATCHET_ENABLED === '1',
  CRON: process.env.HATCHET_CRON || '*/30 * * * *' }`.

The Vikunja heartbeat lock (task #64) is unchanged: VM and desktop each run
their own embedded Hatchet; the lock still arbitrates who works. Never treat
#64 as normal work.

## The non-root story (verified 2026-09-25)

Embedded Postgres's `initdb` refuses to run as root, and the VM runs as root.
So the Hatchet-mode engine runs as the dedicated non-root user `macf`
(`uid 1000`, `HOME=/home/macf`). What was done and verified:

1. **Code readability**: the `slack-agents` checkout is world-readable
   (644/755), so `macf` can `require()` the whole engine tree — verified with
   `runuser -u macf -- node -e "require(...config/lock/workEngine)"`.
   (`chgrp`/`setfacl` are unavailable on this VM's overlay FS, so group/ACL
   grants were not possible; world-readable code + env-passed secrets is the
   working combination.)
2. **Secrets stay closed**: `slack-agents/.env` was world-readable (644) and
   has been tightened to `640 root:nogroup`. Verified `macf` gets `EACCES`
   reading it. Secrets reach the Hatchet-mode engine through **environment
   inheritance**: the watchdog (running as root) sources `.env` and launches
   `runuser -u macf -- env HOME=/home/macf HATCHET_ENABLED=1 node
   engine/runStandalone.js`. `runuser` preserves the caller's environment
   (verified) while setting `HOME/USER` to macf; `/proc/<pid>/environ` is
   owner-only, so no secret file is ever readable by others. `dotenv`'s
   failure to read `.env` as macf is harmless — the vars are already present.
3. **Slack token**: the `custom.slack` surrogate fetch (`engine/slackToken.js`)
   works as `macf` (verified) — no token file needed.
4. **Logs**: the watchdog's `>> log 2>&1` redirect is opened by the root shell
   *before* the user switch, so no log-file permission change was needed.
5. **Launch smoke test** (flag OFF, 2026-09-25): launched the native engine as
   `macf` with env inheritance; log showed `[standalone] starting` and
   `[workEngine] starting`; process killed before its first cycle. User-switch
   path proven before Hatchet is ever enabled.
6. **Watchdog** (`~/workspace/macf/engine-watchdog.sh`): when
   `HATCHET_ENABLED=1` it takes the `runuser` path above; otherwise the
   original `nohup node engine/runStandalone.js` path runs unchanged.

## Enabling (NOT yet authorized — manual steps when it is)

1. As the `macf` user, boot the embedded engine once to warm the sidecar
   download + Postgres data dir under `/home/macf` (first boot downloads the
   `hatchet-embedded` binary; still $0).
2. `rm -f /tmp/memory-*.json /tmp/shared-channel-activity.json` once, so the
   state files the engine writes are recreated owned by `macf` (today they are
   root-owned 644: readable but not writable by macf).
3. Set `HATCHET_ENABLED=1` in the watchdog's environment (the cron entry that
   runs `engine-watchdog.sh`), then let the watchdog relaunch the engine.
4. Verify: `[hatchet] embedded engine ready`, `[hatchet] worker started`,
   cron `engine-tick-cron` registered, one immediate tick, lock acquired.
5. Desktop (Windows, non-root) can run embedded Hatchet in-process with no
   user-switching — deployment recipe TBD separately.

## Tests

`tests/hatchet.test.js` (18), `tests/hatchetConfig.test.js` (4),
`tests/runStandaloneHatchet.test.js` (7). The embedded SDK is mocked in unit
tests — no real Postgres boot; the real boot was smoke-tested separately as
the `macf` user. Full suite: 221/221 green.
