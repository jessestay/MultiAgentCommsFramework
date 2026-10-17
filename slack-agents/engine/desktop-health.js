/**
 * Desktop health monitoring + auto-diagnosis
 *
 * The MACF engine depends on Jesse's desktop (DESKTOP-4U63DES) for:
 * - LiteLLM gateway (Qwen-first budget routing) on port 4000
 * - MCP token refresh (Canva, Buffer OAuth)
 * - Desktop Commander MCP
 *
 * When the desktop goes unreachable, this module:
 * 1. Classifies the outage (tunnel vs desktop vs degraded)
 * 2. Diagnoses patterns from history (persistent, flapping, recovered)
 * 3. Attempts VM-side recovery where possible
 * 4. Decides whether Jesse needs to be involved
 *
 * Standing rule: "Always assume the pc hasn't gone to sleep unless I say otherwise."
 * So DESKTOP_DOWN is treated as a software/connectivity issue, not sleep.
 */

if (require.main === module) {
  console.log('Run via jest: npx jest engine/tests/desktop-health --forceExit');
  process.exit(0);
}

/**
 * Classify desktop health from probe results.
 * @param {Object} probes - { tunnelProbe, sshReachable, httpAgentReachable }
 * @returns {Object} { status, rootCause, actionable }
 */
function classifyDesktopHealth(probes) {
  const { tunnelProbe, sshReachable, httpAgentReachable } = probes;

  // Tunnel itself is refusing — not the desktop's fault, can't fix from VM
  if (tunnelProbe === 'REFUSE-ALL') {
    return {
      status: 'TUNNEL_REFUSE_ALL',
      rootCause: 'tunnel-proxy',
      actionable: false,
      message: 'Tunnel proxy refusing all connections. Not a desktop issue. Wait for self-recovery; do not hammer.',
    };
  }

  // Tunnel OK but desktop unreachable on both paths
  if (!sshReachable && !httpAgentReachable) {
    return {
      status: 'DESKTOP_DOWN',
      rootCause: 'desktop',
      actionable: true, // can verify + log, may need Jesse for physical check
      message: 'Desktop unreachable via SSH and HTTP agent. Tunnel is healthy, so this is a desktop-side issue.',
    };
  }

  // One path works, the other doesn't — degraded
  if (sshReachable !== httpAgentReachable) {
    return {
      status: 'DESKTOP_DEGRADED',
      rootCause: 'desktop-partial',
      actionable: true,
      message: `Desktop partially reachable (SSH: ${sshReachable}, HTTP: ${httpAgentReachable}).`,
    };
  }

  // All good
  return {
    status: 'HEALTHY',
    rootCause: null,
    actionable: false,
    message: 'Desktop healthy on all paths.',
  };
}

/**
 * Diagnose outage pattern from status history.
 * @param {Array} history - [{ status, at }] chronological
 * @returns {Object} { consecutiveFailures, pattern, likelyCause }
 */
function diagnoseOutage(history) {
  if (!history || history.length === 0) {
    return { consecutiveFailures: 0, pattern: 'no-data', likelyCause: 'unknown' };
  }

  const latest = history[history.length - 1];

  // Check for recovery
  if (latest.status === 'HEALTHY') {
    return {
      consecutiveFailures: 0,
      pattern: 'recovered',
      likelyCause: null,
      message: 'Desktop recovered. Outage resolved.',
    };
  }

  // Count consecutive failures of the same type
  let consecutiveFailures = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].status === latest.status) {
      consecutiveFailures++;
    } else {
      break;
    }
  }

  // Detect flapping (alternating between failure and healthy)
  const statuses = history.map(h => h.status);
  const recent = statuses.slice(-5);
  const uniqueRecent = [...new Set(recent)];
  // Flapping = HEALTHY appears in recent history alongside failures (alternation)
  if (uniqueRecent.includes('HEALTHY') && uniqueRecent.length >= 2) {
    return {
      consecutiveFailures,
      pattern: 'tunnel-flapping',
      likelyCause: 'tunnel-proxy-instability',
      message: 'Status flapping between healthy and failure — likely tunnel proxy instability, not desktop.',
    };
  }

  // Persistent failure
  const pattern = latest.status === 'TUNNEL_REFUSE_ALL'
    ? 'persistent-tunnel-refuse'
    : 'persistent-desktop-down';

  const likelyCause = latest.status === 'TUNNEL_REFUSE_ALL'
    ? 'tunnel proxy rate-limiting or backend down (self-recovers in 30-60 min historically)'
    : 'desktop software/connectivity issue (per standing rule: NOT sleep unless Jesse says so)';

  return {
    consecutiveFailures,
    pattern,
    likelyCause,
    message: `${consecutiveFailures} consecutive ${latest.status}. Likely: ${likelyCause}`,
  };
}

/**
 * Attempt VM-side recovery based on classification.
 * @param {Object} classification - from classifyDesktopHealth
 * @returns {Object} { attempted, action, reason }
 */
function attemptRecovery(classification) {
  const { status } = classification;

  // Tunnel refuse-all: nothing to do from VM. Hammering makes it worse.
  if (status === 'TUNNEL_REFUSE_ALL') {
    return {
      attempted: false,
      action: 'wait',
      reason: 'Tunnel proxy issue cannot be fixed from VM. Waiting for self-recovery; do not hammer (hammering likely prolongs it).',
    };
  }

  // Desktop down: can't power it on remotely, but verify it's really down
  // (not a false positive from one probe) and log for pattern analysis.
  if (status === 'DESKTOP_DOWN') {
    return {
      attempted: true,
      action: 'verify-and-log',
      reason: 'Verified desktop unreachable on multiple paths. Logged for pattern analysis. Cannot fix remotely if truly down.',
    };
  }

  // Degraded: log it, may self-resolve
  if (status === 'DESKTOP_DEGRADED') {
    return {
      attempted: true,
      action: 'log-and-monitor',
      reason: 'Partial connectivity logged. Monitoring for full outage or recovery.',
    };
  }

  return { attempted: false, action: 'none', reason: 'Healthy, no recovery needed.' };
}

/**
 * Decide whether Jesse needs to be involved.
 * @param {Object} params - { status, consecutiveFailures }
 * @returns {boolean}
 */
function shouldEscalateToJesse({ status, consecutiveFailures }) {
  // Tunnel issues self-recover — never escalate these
  if (status === 'TUNNEL_REFUSE_ALL') {
    return false;
  }

  // Desktop down 3+ times consecutively: may need physical check
  // (but per standing rule, don't ask him to wake/unlock — just inform)
  if (status === 'DESKTOP_DOWN' && consecutiveFailures >= 3) {
    return true;
  }

  return false;
}

module.exports = {
  classifyDesktopHealth,
  diagnoseOutage,
  attemptRecovery,
  shouldEscalateToJesse,
};
