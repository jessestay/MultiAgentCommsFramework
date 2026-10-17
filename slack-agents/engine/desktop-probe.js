/**
 * Desktop health probe for the engine watchdog.
 *
 * Runs the three reachability probes (tunnel, SSH, HTTP agent), classifies the
 * result via desktop-health.js, appends to the persisted history, and prints
 * a single JSON line to stdout.
 *
 * Usage: node engine/desktop-probe.js <state-json-path>
 *
 * NOTE: this lives in its own file on purpose. The previous incarnation was
 * an inline `node -e "..."` inside bash double quotes in engine-watchdog.sh,
 * which broke in two ways: (1) the unescaped backticks around the nc
 * ProxyCommand made bash RUN `nc -X connect -x %h %p` as a shell command
 * ("nc: missing port number" on every watchdog run) and left node with a
 * SyntaxError, so the whole desktop-health section silently never ran;
 * (2) ${...} inside the JS template literals was expanded by bash to empty.
 * Never inline node -e with backticks/${} inside bash double quotes again.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const dh = require('./desktop-health');

const DESKTOP_IP = '100.92.127.117';
const DESKTOP_USER = 'stay';
const AGENT_PORT = 8099;
const SSH_KEY = path.join(os.homedir(), '.ssh', 'desktop_jesse_ed25519');
const TUNNEL_PROBE = '/home/hatch/bin/tunnel-probe.py';

/**
 * Derive the tunnel proxy "host:3130" from HTTPS_PROXY.
 * Mirrors ~/workspace/desktop-agent's desktop-ssh.sh logic:
 *   hp="${HTTPS_PROXY}"; hp="${hp#*://}"; hp="${hp##*@}"; tp="${hp%:*}:3130"
 * Raw TCP to port 22 is blocked by the egress proxy; SSH to the desktop must
 * go through the tunnel proxy's CONNECT port 3130 (not the egress 3128).
 * Pure — safe to unit test.
 */
function deriveTunnelProxy(httpsProxy) {
  if (!httpsProxy) return null;
  let hp = String(httpsProxy).trim();
  hp = hp.replace(/^.*:\/\//, ''); // strip scheme
  hp = hp.replace(/^.*@/, ''); // strip userinfo (user:pass@)
  const idx = hp.lastIndexOf(':');
  const host = (idx > 0 ? hp.slice(0, idx) : hp).trim();
  if (!host) return null;
  return host + ':3130';
}

/**
 * Build the ssh ProxyCommand for the tunnel proxy.
 * %h/%p are expanded by ssh itself, NOT by the shell — keep them literal.
 * Pure — safe to unit test.
 */
function buildProxyCommand(tunnelProxy) {
  if (!tunnelProxy) return null;
  return `nc -X connect -x ${tunnelProxy} %h %p`;
}

/** SSH reachability via the tunnel proxy, same key as desktop-ssh.sh. */
function probeSsh(tunnelProxy) {
  const proxyCmd = buildProxyCommand(tunnelProxy);
  if (!proxyCmd) return false;
  if (!fs.existsSync(SSH_KEY)) return false;
  const cmDir = path.join(os.homedir(), '.ssh', 'cm');
  try {
    fs.mkdirSync(cmDir, { recursive: true, mode: 0o700 });
  } catch (e) {
    /* best effort */
  }
  const cmd =
    `timeout 10 ssh -o BatchMode=yes -o ConnectTimeout=6 -o StrictHostKeyChecking=no ` +
    `-o ProxyCommand="${proxyCmd}" -i "${SSH_KEY}" ` +
    `-o ControlMaster=auto -o ControlPath="${cmDir}/%r@%h:%p" -o ControlPersist=10m ` +
    `${DESKTOP_USER}@${DESKTOP_IP} "echo ok" 2>/dev/null`;
  try {
    execSync(cmd, { timeout: 15000 });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * HTTP agent reachability via the tunnel proxy.
 * The agent 404s unauthenticated paths but still ANSWERS — any 3-digit HTTP
 * status means the HttpListener is alive. Only a connection failure counts
 * as down. (The old probe used curl -sf, which misread 404 as down.)
 */
function probeHttpAgent(tunnelProxy) {
  if (!tunnelProxy) return false;
  try {
    const out = execSync(
      `curl -s --max-time 8 -o /dev/null -w "%{http_code}" ` +
        `--proxy "http://${tunnelProxy}" http://${DESKTOP_IP}:${AGENT_PORT}/ 2>/dev/null`,
      { timeout: 12000, encoding: 'utf8' }
    ).trim();
    return /^\d{3}$/.test(out);
  } catch (e) {
    return false;
  }
}

function main() {
  const statePath = process.argv[2];
  if (!statePath) {
    console.error('usage: node engine/desktop-probe.js <state-json-path>');
    process.exit(2);
  }

  const tunnelProxy = deriveTunnelProxy(process.env.HTTPS_PROXY);

  let tunnelProbe = 'UNKNOWN';
  try {
    const out = execSync(`python3 ${TUNNEL_PROBE} 2>&1`, { timeout: 30000, encoding: 'utf8' });
    if (out.includes('HEALTHY')) tunnelProbe = 'HEALTHY';
    else if (out.includes('REFUSE-ALL')) tunnelProbe = 'REFUSE-ALL';
    else if (out.includes('DESKTOP-DOWN') || out.includes('DEGRADED')) tunnelProbe = 'DESKTOP-DOWN';
  } catch (e) {
    tunnelProbe = 'PROBE-FAILED';
  }

  const sshReachable = probeSsh(tunnelProxy);
  const httpAgentReachable = probeHttpAgent(tunnelProxy);

  const classification = dh.classifyDesktopHealth({ tunnelProbe, sshReachable, httpAgentReachable });

  let history = [];
  try {
    history = JSON.parse(fs.readFileSync(statePath, 'utf8')).history || [];
  } catch (e) {
    /* first run */
  }
  history.push({ status: classification.status, at: new Date().toISOString() });
  history = history.slice(-20); // keep last 20
  const diagnosis = dh.diagnoseOutage(history);
  const recovery = dh.attemptRecovery(classification);
  const escalate = dh.shouldEscalateToJesse({
    status: classification.status,
    consecutiveFailures: diagnosis.consecutiveFailures,
  });

  try {
    fs.writeFileSync(statePath, JSON.stringify({ history, lastCheck: new Date().toISOString() }, null, 2));
  } catch (e) {
    /* fail open on state write; still report this run's result */
  }

  console.log(
    JSON.stringify({
      classification,
      diagnosis,
      recovery,
      escalate,
      probes: { tunnelProbe, sshReachable, httpAgentReachable },
    })
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  deriveTunnelProxy,
  buildProxyCommand,
  probeSsh,
  probeHttpAgent,
  main,
  DESKTOP_IP,
  AGENT_PORT,
};
