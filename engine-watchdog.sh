#!/bin/bash
# MACF 24/7 engine watchdog — restart the standalone engine if it isn't running.
# The engine itself is the service (internal 30-min loop, or Hatchet-driven when
# HATCHET_ENABLED=1); this is supervision only.
# Pattern lives in this file so pgrep never matches the caller's command line.
ENGINE_DIR="$HOME/workspace/macf/slack-agents"
ENGINE_LOG="$HOME/workspace/macf/engine-standalone.log"
VIKUNJA_DIR="$HOME/workspace/macf/vikunja"
# Flywheel BLOCKS server-side cron: ping wp-cron externally so FluentCRM
# recurrences actually fire. MUST stay before the pgrep early-exit below —
# when it sat after the exit, the ping never fired on a healthy engine and
# FluentCRM recurrence silently broke (Sep 28-29, 2026). (Re-applied Oct 1,
# 2026 after a hard reset wiped the uncommitted wiring.)
curl -sf --max-time 10 -o /dev/null "https://staynalive.com/wp-cron.php?doing_wp_cron" \
  || echo "watchdog: wp-cron ping FAILED"
# n8n supervision: the outreach-machine's watch.sh was written but never wired
# into any schedule, so n8n died unwatched. Probe-first, idempotent.
bash "$HOME/workspace/outreach-machine/watch.sh" || echo "watchdog: n8n watch FAILED"
# VM-local Meta gateway: the engine now uses http://127.0.0.1:4001 (meta-gateway.py)
# instead of the desktop SSH tunnel (:4000). Check the gateway is responding.
# If down, restart it. (Updated Oct 2, 2026 — desktop tunnel retired.)
if ! curl -sf --max-time 5 -o /dev/null http://127.0.0.1:4001/v1/chat/completions -X POST -H "Content-Type: application/json" -d '{"model":"test","messages":[]}' 2>/dev/null; then
  # The gateway might be down — try a simple TCP check first (the POST above
  # may fail for other reasons). If the port isn't listening, restart.
  if ! (echo > /dev/tcp/127.0.0.1/4001) 2>/dev/null; then
    echo "watchdog: meta gateway down, restarting"
    pkill -f "meta-gateway.py" 2>/dev/null || true
    sleep 1
    setsid nohup python3 "$ENGINE_DIR/meta-gateway.py" >> "$ENGINE_DIR/meta-gateway.log" 2>&1 < /dev/null &
    sleep 3
    if (echo > /dev/tcp/127.0.0.1/4001) 2>/dev/null; then
      echo "watchdog: meta gateway restarted"
    else
      echo "watchdog: meta gateway restart FAILED"
    fi
  fi
fi
# Vikunja liveness: the task board must be up or the engine fail-closes every
# cycle. The VM reboots with no boot service for Vikunja (systemd unit is gone,
# no cron), so this 15-min watchdog is its supervision too. start.sh is
# idempotent (probe-first, exits 0 when already up).
if ! curl -sf --max-time 5 -o /dev/null http://127.0.0.1:3456/api/v1/info; then
  echo "watchdog: vikunja not responding, restarting"
  # Anchored at ^ so this can never match a shell whose command line merely
  # mentions the pattern (an unanchored pkill once killed its own caller).
  pkill -f "^/home/hatch/workspace/macf/vikunja/bin/vikunja web" 2>/dev/null || true
  sleep 1
  bash "$VIKUNJA_DIR/start.sh" || echo "watchdog: vikunja restart FAILED"
fi
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
  #
  # VM RESILIENCE (2026-09-25): the VM snapshot-restores the system filesystem
  # on reboot, wiping /etc/passwd, /home/macf, and resetting /home/hatch to
  # drwxrws--- (which locks macf out). Self-heal all of it here:
  if ! id macf >/dev/null 2>&1; then
    echo "[watchdog] recreating missing user macf (VM snapshot-restore wiped it)" >> "$WATCHDOG_LOG"
    useradd -m -s /bin/bash macf
  fi
  # The overlay FS blocks chgrp; macf is the only non-root shell user, so
  # other-access bits are safe. o+x on $HOME = traverse-only (no listing).
  chmod o+x "$HOME" 2>/dev/null
  # NOTE: .env stays 600 (root-only). The macf engine process inherits all
  # vars from this root shell's environment (set -a + source above), so it
  # does not need to read .env directly. Never chmod o+r the .env.
  # The embedded sidecar binary lives in the persistent workspace (the VM
  # wipes /home/macf on reboot, and the SDK's fetch() doesn't use the proxy
  # so re-download fails). Supply it directly to skip the download.
  export HATCHET_CLIENT_EMBEDDED_BINARY_PATH="$ENGINE_DIR/../hatchet-sidecar/hatchet-embedded-sidecar_linux_amd64"
  set -a
  # shellcheck disable=SC1091
  . "$ENGINE_DIR/.env"
  set +a
  # FIX (Oct 2, 2026): Pass LITELLM vars through to the engine. Previously the
  # engine was not receiving the updated LITELLM_BASE_URL (pointing to the
  # VM-local Meta gateway), causing it to use the stale desktop tunnel URL.
  # setsid is REQUIRED (not just nohup): the runtime kills the whole process
  # GROUP of a finished exec session, and nohup cannot escape that. Observed
  # Oct 2, 2026: 13 engine kills with "Session terminated, killing shell..."
  # in the log (Sep 29, Oct 1, Oct 2) — every engine the watchdog started
  # via plain `nohup ... &` died when the launching exec session was torn
  # down, looping the engine through restart-kill-restart. setsid puts the
  # engine in a new session/PGID, so no session teardown can reach it.
  setsid runuser -u macf -- env HOME=/home/macf HATCHET_ENABLED=1 \
    LITELLM_BASE_URL="$LITELLM_BASE_URL" LITELLM_MASTER_KEY="$LITELLM_MASTER_KEY" \
    nohup node engine/runStandalone.js >> "$ENGINE_LOG" 2>&1 < /dev/null &
    # NOTE: nohup is REQUIRED. Without it, the engine dies when the invoking
    # exec session ends (observed live: "Session terminated, killing shell..."
    # took the embedded Postgres down). Never launch the engine from a
    # `background: true` exec — the runtime kills the whole process tree on
    # session completion. Use a normal foreground exec; the & backgrounds it
    # and it reparents to init. (Oct 2, 2026: nohup alone is NO LONGER
    # sufficient — the runtime now kills by process group; the setsid above
    # is what actually protects the engine.)
else
  setsid nohup node engine/runStandalone.js >> "$ENGINE_LOG" 2>&1 < /dev/null &
fi
echo "watchdog: engine was down, restarted pid $!"
