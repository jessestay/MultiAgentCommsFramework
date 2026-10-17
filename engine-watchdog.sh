#!/bin/bash
# MACF 24/7 engine watchdog — restart the standalone engine if it isn't running.
# The engine itself is the service (internal 30-min loop, or Hatchet-driven when
# HATCHET_ENABLED=1); this is supervision only.
# Pattern lives in this file so pgrep never matches the caller's command line.
ENGINE_DIR="$HOME/workspace/macf/slack-agents"
ENGINE_LOG="$HOME/workspace/macf/engine-standalone.log"
VIKUNJA_DIR="$HOME/workspace/macf/vikunja"
DESKTOP_HEALTH_STATE="$ENGINE_DIR/engine/.desktop-health-state.json"
WATCHDOG_LOG="$HOME/workspace/macf/engine-watchdog.log" # FIX (Oct 6, 2026): was referenced but never defined — the macf-user-recreate log line failed with "No such file or directory" on the one run it mattered (VM snapshot-restore wiped /etc/passwd).
# Desktop health monitoring (Oct 6, 2026): the engine depends on Jesse's desktop
# for the LiteLLM gateway (Qwen-first routing), MCP token refresh, and Desktop
# Commander. When the desktop goes unreachable, classify the outage, diagnose
# the pattern, and attempt recovery — don't just report "desktop down."
# Uses engine/desktop-health.js (12/12 jest tests). State persists across runs
# for pattern detection (persistent vs flapping vs recovered).
if [ -f "$ENGINE_DIR/engine/desktop-probe.js" ]; then
  # Probe lives in its own file (Oct 6, 2026 fix): the old inline node -e
  # inside bash double quotes had unescaped backticks, so bash executed
  # `nc -X connect -x %h %p` as a shell command ("nc: missing port number")
  # and ate the ${...} expansions — node got a SyntaxError and this whole
  # section silently never ran. Never inline node -e with backticks/${}
  # inside bash double quotes again.
  DESKTOP_HEALTH_JSON=$(node "$ENGINE_DIR/engine/desktop-probe.js" "$DESKTOP_HEALTH_STATE" 2>/tmp/desktop-probe.err)
  DH_RC=$?
  if [ "$DH_RC" -ne 0 ]; then
    echo "watchdog: desktop probe FAILED (rc=$DH_RC): $(head -c 300 /tmp/desktop-probe.err 2>/dev/null)"
  elif [ -n "$DESKTOP_HEALTH_JSON" ]; then
    DH_STATUS=$(echo "$DESKTOP_HEALTH_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['classification']['status'])" 2>/dev/null)
    DH_ESCALATE=$(echo "$DESKTOP_HEALTH_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(str(d['escalate']).lower())" 2>/dev/null)
    if [ "$DH_STATUS" != "HEALTHY" ]; then
      echo "watchdog: desktop health = $DH_STATUS"
      echo "$DESKTOP_HEALTH_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print('  diagnosis:', d['diagnosis']['message']); print('  recovery:', d['recovery']['reason'])" 2>/dev/null
      if [ "$DH_ESCALATE" = "true" ]; then
        echo "watchdog: ESCALATE — desktop down 3+ consecutive checks, Jesse may need to check it"
      fi
    fi
  fi
fi
# LLM path canary (Oct 12, 2026 — CEO mechanism repair): the desktop probe
# above tests reachability only; it reported HEALTHY all afternoon while the
# gateway route was dead and directives failed. The canary makes one real
# minimal generation through the engine's route stack, attempts the bounded
# cache-reset repair on total failure, and files a CEO-visible engine gap
# the same cycle when the path is down. Always exits 0.
CANARY_JSON=$(timeout 150 node "$ENGINE_DIR/engine/llm-canary.js" 2>/tmp/llm-canary.err | tail -1)
if [ -n "$CANARY_JSON" ]; then
  echo "watchdog: llm canary: $CANARY_JSON"
else
  echo "watchdog: llm canary FAILED to run: $(head -c 200 /tmp/llm-canary.err 2>/dev/null)"
fi

# Flywheel BLOCKS server-side cron: ping wp-cron externally so FluentCRM
# recurrences actually fire. MUST stay before the pgrep early-exit below —
# when it sat after the exit, the ping never fired on a healthy engine and
# FluentCRM recurrence silently broke (Sep 28-29, 2026). (Re-applied Oct 1,
# 2026 after a hard reset wiped the uncommitted wiring.)
# NOTE (Oct 4, 2026 ~22:20 MDT): wp-cron.php now answers 200 but takes ~100s —
# the cron queue got heavy (site itself is fine: homepage 200 in <1s). The old
# 25s timeout therefore raced and logged false FAILED pings even though the
# trigger fired and the server-side run completed (wp-cron.php runs with
# ignore_user_abort, so it continues after our client gives up). The ping's job
# is to TRIGGER the cron run, not to measure it: treat a client-side timeout as
# SLOW (trigger fired), and only report FAILED on real connection/HTTP errors.
# Suspected cause: the approved 212-contact FluentCRM blast draining in cron
# batches (UNVERIFIED from the VM — Flywheel-side). Re-timeout if the queue
# keeps growing; consider splitting trigger vs. health if SLOW persists.
# NOTE (Oct 8, 2026 ~21:35 MDT): wp-cron.php is now ERRORING intermittently,
# not just slow — observed curl rc=22 (HTTP error) from the watchdog and an
# HTTP 504 at ~60s on manual retest. The gateway kills the request at ~60s,
# well before the 170s client timeout, so a 504 likely means the PHP cron run
# was killed server-side too (the "SLOW = trigger fired, server-side run
# continues" assumption does NOT hold for gateway timeouts). If FAILED persists
# across cycles, the FluentCRM cron queue is stuck or a cron job is hanging
# server-side — needs a Flywheel/WordPress-side look (FluentCRM dashboard or
# wp-cron manager), not fixable from this VM.
curl -sf -o /dev/null --max-time 170 "https://staynalive.com/wp-cron.php?doing_wp_cron"
wpcron_rc=$?
case $wpcron_rc in
  0)  ;; # cron fired and completed
  28) echo "watchdog: wp-cron SLOW (client timeout at 170s; trigger fired, server-side run continues)" ;;
  *)  echo "watchdog: wp-cron ping FAILED (curl rc=$wpcron_rc)" ;;
esac
# n8n supervision: the outreach-machine's watch.sh was written but never wired
# into any schedule, so n8n died unwatched. Probe-first, idempotent.
bash "$HOME/workspace/outreach-machine/watch.sh" || echo "watchdog: n8n watch FAILED"
# VM-local Meta gateway (port 4001): DISABLED as of Oct 6, 2026 (Jesse's order).
# The engine now routes LLM calls through the desktop LiteLLM gateway
# (LITELLM_BASE_URL, Qwen-first budget routing); the VM-local gateway bypassed
# budget-first and burned Jesse's personal Meta API billing. utils/litellm.js
# fails fast without LITELLM_BASE_URL and has no 4001 fallback. Nothing on the
# live path uses :4001 (pm-breakdown.js's hardcoded :4001 is dead code), so the
# watchdog must NOT resurrect the gateway. Section left as a disabled note.
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
# MCP binary durability guard (Oct 12, 2026 — Jesse's order: "better systems
# to both prevent desktop commander from going down and to get it back up
# automatically every time"). The global npm installs of n8n-mcp and
# @wonderwhy-er/desktop-commander live under /usr (EPHEMERAL on VM
# replacement) and vanished in VM churn on Oct 5, Oct 11, and Oct 12, 2026,
# silently breaking the CEO/CTO hands each time. Prevention: grants.json now
# invokes the ABSOLUTE durable paths in hands/node_modules/.bin (under ~,
# survives replacement). Auto-restore: this block runs BEFORE the pgrep
# early-exit below (same lesson as wp-cron) and repairs either layer when
# missing — durable via npm ci in hands/, global via npm install -g (some
# scripts still use the bare names). Every repair is echoed to the watchdog
# log; a healthy run stays silent and fast (two -x tests).
HANDS_DIR="$HOME/workspace/macf/hands"
for mcp_bin in desktop-commander n8n-mcp; do
  if [ ! -x "$HANDS_DIR/node_modules/.bin/$mcp_bin" ]; then
    echo "watchdog: MCP durable binary missing: $mcp_bin — restoring in hands/"
    (cd "$HANDS_DIR" && npm ci --no-audit --no-fund >/dev/null 2>&1) \
      || (cd "$HANDS_DIR" && npm install --no-audit --no-fund >/dev/null 2>&1) \
      || echo "watchdog: MCP durable restore FAILED for $mcp_bin"
    [ -x "$HANDS_DIR/node_modules/.bin/$mcp_bin" ] \
      && echo "watchdog: MCP durable binary restored: $mcp_bin" \
      || echo "watchdog: MCP durable binary STILL MISSING after restore: $mcp_bin"
  fi
done
if [ ! -x /usr/bin/desktop-commander ] || [ ! -x /usr/bin/n8n-mcp ]; then
  echo "watchdog: MCP global binary missing — reinstalling globally"
  # Root-caused Oct 14, 2026: the plain install FAILS on this VM — node-gyp
  # rebuilds fsevents (a macOS-only optional dep of desktop-commander) and
  # tarball extraction dies with EPERM fchown on the overlay FS, rolling the
  # whole install back to dangling /usr/bin symlinks. Fallback: install with
  # --ignore-scripts (fsevents is never used on Linux) and restore the exec
  # bit the extraction strips from the n8n-mcp entry point.
  if npm install -g n8n-mcp @wonderwhy-er/desktop-commander >/dev/null 2>&1; then
    echo "watchdog: MCP global binaries restored"
  elif npm install -g --ignore-scripts n8n-mcp @wonderwhy-er/desktop-commander >/dev/null 2>&1; then
    chmod 755 /usr/lib/node_modules/n8n-mcp/dist/mcp/stdio-wrapper.js 2>/dev/null
    chmod 755 /usr/lib/node_modules/@wonderwhy-er/desktop-commander/dist/index.js 2>/dev/null
    if [ -x /usr/bin/n8n-mcp ] && [ -x /usr/bin/desktop-commander ]; then
      echo "watchdog: MCP global binaries restored (ignore-scripts fallback)"
    else
      echo "watchdog: MCP global reinstall FAILED"
    fi
  else
    echo "watchdog: MCP global reinstall FAILED"
  fi
fi
# Engine schedule self-healing (Oct 10, 2026 — Jesse's order): the autonomous
# driver script existed for weeks but was never scheduled, and no test caught
# it. check-schedules.js verifies every schedule in schedules.json against
# the runtime. If the autonomous driver (or any schedule) is missing, this
# logs CRITICAL and writes a heal-request file — it never goes undetected.
if [ -f "$ENGINE_DIR/engine/check-schedules.js" ]; then
  node "$ENGINE_DIR/engine/check-schedules.js" 2>&1 | tail -12
  cs_rc=${PIPESTATUS[0]}
  if [ "$cs_rc" -ne 0 ]; then
    echo "watchdog: SCHEDULE GAP DETECTED — one or more engine schedules missing (see above)"
  fi
fi
if pgrep -f "node engine/runStandalone\.js" >/dev/null 2>&1; then
  # Delivery health check: detect ack-without-delivery pattern.
  # Processes can be "healthy" while agents just talk without shipping.
  # If the check fails, log it and post an alert to #management so the
  # team (and CEO) can see the delivery gap. Don't restart the engine —
  # this is a team behavior issue, not a process crash.
  node "$ENGINE_DIR/engine/delivery-health.js" 2>&1 | tail -5
  dh_rc=${PIPESTATUS[0]}
  if [ "$dh_rc" -ne 0 ]; then
    echo "watchdog: DELIVERY HEALTH FAIL — agents talking but not shipping (see above)"
    # The team-delivery-monitor cron (15m) handles the detailed staleness
    # tracking; this is the early warning.
  fi
  # ── Liveness probe (#807 Phase 4, US-P4.2) ─────────────────────────────
  # Process presence is not liveness: on Oct 16 the embedded Postgres
  # died while node+sidecar stayed up and this watchdog exited 0 for
  # hours. The probe checks PG presence + heartbeat freshness with a
  # 2-strike rule (a slow boot is never killed). Verdict zombie → kill
  # the stack's process group and fall through to the relaunch path.
  ZOMBIE=0
  if [ -f "$ENGINE_DIR/engine/watchdog-liveness.js" ]; then
    node "$ENGINE_DIR/engine/watchdog-liveness.js" >> "$WATCHDOG_LOG" 2>&1
    lv_rc=$?
    if [ "$lv_rc" = "3" ]; then
      ZOMBIE=1
      echo "[watchdog] ZOMBIE ENGINE confirmed by liveness probe (PG/heartbeat dead while processes alive) — killing the stack for relaunch" >> "$WATCHDOG_LOG"
      EPID=$(pgrep -f "node engine/runStandalone\\.js" | head -1)
      if [ -n "$EPID" ]; then
        EPGID=$(ps -o pgid= -p "$EPID" 2>/dev/null | tr -d ' ')
        [ -n "$EPGID" ] && kill -TERM -"$EPGID" 2>/dev/null
        sleep 8
      fi
      rm -f "$ENGINE_DIR/engine/.watchdog-liveness.json"
    elif [ "$lv_rc" = "2" ]; then
      echo "[watchdog] liveness probe strike recorded (see probe output above) — engine left running, will re-check next cycle" >> "$WATCHDOG_LOG"
    fi
  fi
  if [ "$ZOMBIE" = "0" ]; then
    exit 0
  fi
  echo "[watchdog] falling through to relaunch after zombie kill" >> "$WATCHDOG_LOG"
fi
cd "$ENGINE_DIR" || exit 1
if [ "${HATCHET_ENABLED:-1}" = "1" ]; then
  # NOTE (Oct 3, 2026): default is now 1, not 0. A manual watchdog run
  # without the env var used to take the else branch and launch the engine
  # WITHOUT the LITELLM vars — the engine then ran in "watch mode" and
  # silently skipped all task work (root-caused the 100h+ staleness of the
  # Revenue Sprint board tasks). Opt out explicitly with HATCHET_ENABLED=0.
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
    # Oct 16, 2026: useradd's result was never checked — on the Oct 16 VM
    # replacement it failed silently 6 times and the engine stayed down.
    # Verify, log the error output, and mark failure loudly for the CEO.
    # #807 Phase 4 (US-P4.1): recreation is RETRIED (up to 3 attempts,
    # verified after each) — on replacement #12 the log showed useradd
    # flapping ("already exists" while id found no user). One attempt is
    # not enough when the account databases are mid-restore.
    RECREATED=0
    for attempt in 1 2 3; do
      useradd -m -s /bin/bash macf 2>>"$WATCHDOG_LOG" || true
      sleep 1
      if id macf >/dev/null 2>&1; then RECREATED=1; break; fi
      echo "[watchdog] useradd attempt $attempt did not yield user macf; retrying" >> "$WATCHDOG_LOG"
    done
    if [ "$RECREATED" = "1" ]; then
      echo "[watchdog] user macf recreated OK (uid $(id -u macf))" >> "$WATCHDOG_LOG"
    else
      echo "[watchdog] ERROR: useradd macf FAILED after 3 attempts - engine cannot start; CEO escalation needed" >> "$WATCHDOG_LOG"
    fi
  fi
  # PARTIAL-WIPE VARIANT (Oct 15, 2026): a VM replacement left the macf user
  # intact but /home/macf as root-owned empty dirs. The engine then died at
  # boot: embedded Postgres init hit "permission denied" creating
  # /home/macf/.hatchet-embedded, and the restart loop failed silently for a
  # full watchdog cycle. Heal: if the home tree is not macf-owned, take it back.
  if [ -d /home/macf ] && [ "$(stat -c %U /home/macf 2>/dev/null)" != "macf" ]; then
    echo "[watchdog] /home/macf owned by $(stat -c %U /home/macf) — chowning back to macf (partial VM wipe)" >> "$WATCHDOG_LOG"
    chown -R macf:macf /home/macf 2>/dev/null
  fi
  # The overlay FS blocks chgrp; macf is the only non-root shell user, so
  # other-access bits are safe. o+x on $HOME = traverse-only (no listing).
  chmod o+x "$HOME" 2>/dev/null
  # Oct 16, 2026: engine HOME relocated into the persistent workspace tree
  # (engine-home/). Keep the path traversable for macf after any restore.
  chmod o+x "$HOME/workspace" "$HOME/workspace/macf" "$HOME/workspace/macf/engine-home" 2>/dev/null
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
  # FIX (Oct 8, 2026): secrets must never ride on the ps command line.
  # `env VAR="secret"` exposes values in /proc/<pid>/cmdline to any local
  # user. Instead the watchdog (root) writes them to .engine-env
  # (macf:macf, 600) and launch-engine.sh sources that file.
  umask 077
  printf 'LITELLM_BASE_URL=%s\nLITELLM_MASTER_KEY=%s\n' \
    "$LITELLM_BASE_URL" "$LITELLM_MASTER_KEY" > "$ENGINE_DIR/.engine-env"
  chown macf:macf "$ENGINE_DIR/.engine-env"
  chmod 600 "$ENGINE_DIR/.engine-env"
  umask 022
  setsid runuser -u macf -- env HOME=/home/hatch/workspace/macf/engine-home HATCHET_ENABLED=1 \
    nohup "$ENGINE_DIR/launch-engine.sh" >> "$ENGINE_LOG" 2>&1 < /dev/null &
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
