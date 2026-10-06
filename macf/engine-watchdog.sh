#!/bin/bash
# MACF 24/7 engine watchdog — restart the standalone engine if it isn't running.
# The engine itself is the service (internal 30-min loop, or Hatchet-driven when
# HATCHET_ENABLED=1); this is supervision only.
# Pattern lives in this file so pgrep never matches the caller's command line.
ENGINE_DIR="$HOME/workspace/macf/slack-agents"
ENGINE_LOG="$HOME/workspace/macf/engine-standalone.log"
VIKUNJA_DIR="$HOME/workspace/macf/vikunja"
DESKTOP_HEALTH_STATE="$ENGINE_DIR/engine/.desktop-health-state.json"
# Desktop health monitoring (Oct 6, 2026): the engine depends on Jesse's desktop
# for the LiteLLM gateway (Qwen-first routing), MCP token refresh, and Desktop
# Commander. When the desktop goes unreachable, classify the outage, diagnose
# the pattern, and attempt recovery — don't just report "desktop down."
# Uses engine/desktop-health.js (12/12 jest tests). State persists across runs
# for pattern detection (persistent vs flapping vs recovered).
if [ -f "$ENGINE_DIR/engine/desktop-health.js" ]; then
  DESKTOP_HEALTH_JSON=$(node -e "
const dh = require('$ENGINE_DIR/engine/desktop-health.js');
const fs = require('fs');
const { execSync } = require('child_process');

// Run probes
let tunnelProbe = 'UNKNOWN', sshReachable = false, httpAgentReachable = false;
try {
  const out = execSync('python3 /home/hatch/bin/tunnel-probe.py 2>&1', { timeout: 25000 }).toString();
  if (out.includes('HEALTHY')) tunnelProbe = 'HEALTHY';
  else if (out.includes('REFUSE-ALL')) tunnelProbe = 'REFUSE-ALL';
  else if (out.includes('DESKTOP-DOWN') || out.includes('DEGRADED')) tunnelProbe = 'DESKTOP-DOWN';
} catch(e) { tunnelProbe = 'PROBE-FAILED'; }

// Quick SSH check via tunnel proxy (5s timeout)
// Raw TCP to port 22 is blocked by egress; must use ProxyCommand via :3130
try {
  const proxy = (process.env.HTTPS_PROXY || '').replace(/:\d+@/, ':3130@');
  const proxyHost = proxy.replace(/^https?:\/\//, '').split('@').pop().split(':')[0] || 'proxy';
  // Extract host:port from proxy URL for nc
  const m = proxy.match(/@([^:]+):(\d+)/);
  const proxyAddr = m ? m[1] + ':' + m[2] : null;
  const proxyCmd = proxyAddr ? `nc -X connect -x ${proxyAddr} %h %p` : 'nc %h %p';
  execSync(`timeout 8 ssh -o ProxyCommand="${proxyCmd}" -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=no stay@100.92.127.117 "echo ok" 2>/dev/null`, { timeout: 12000 });
  sshReachable = true;
} catch(e) {}

// Quick HTTP agent check via proxy (5s timeout)
try {
  execSync('curl -sf --max-time 8 -o /dev/null --proxy "$HTTPS_PROXY" http://100.92.127.117:8099/health 2>/dev/null || curl -sf --max-time 8 -o /dev/null http://100.92.127.117:8099/health 2>/dev/null', { timeout: 12000, shell: '/bin/bash' });
  httpAgentReachable = true;
} catch(e) {}

const classification = dh.classifyDesktopHealth({ tunnelProbe, sshReachable, httpAgentReachable });

// Load history, append, diagnose
let history = [];
try {
  const state = JSON.parse(fs.readFileSync('$DESKTOP_HEALTH_STATE', 'utf8'));
  history = state.history || [];
} catch(e) {}
history.push({ status: classification.status, at: new Date().toISOString() });
history = history.slice(-20); // keep last 20
const diagnosis = dh.diagnoseOutage(history);
const recovery = dh.attemptRecovery(classification);
const escalate = dh.shouldEscalateToJesse({ status: classification.status, consecutiveFailures: diagnosis.consecutiveFailures });

// Persist
fs.writeFileSync('$DESKTOP_HEALTH_STATE', JSON.stringify({ history, lastCheck: new Date().toISOString() }, null, 2));

console.log(JSON.stringify({ classification, diagnosis, recovery, escalate }));
" 2>&1)
  DH_RC=$?
  if [ "$DH_RC" -eq 0 ] && [ -n "$DESKTOP_HEALTH_JSON" ]; then
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
  exit 0
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
