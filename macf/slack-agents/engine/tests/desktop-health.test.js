/**
 * Desktop health monitoring + auto-diagnosis tests (TDD)
 *
 * The watchdog must detect desktop outages, diagnose the root cause,
 * and attempt recovery — not just report "desktop down."
 *
 * Root causes to distinguish:
 * - TUNNEL_REFUSE_ALL: tunnel proxy refusing all connections (not the desktop's fault)
 * - DESKTOP_DOWN: desktop not responding (may need Jesse to check power)
 * - DESKTOP_DEGRADED: intermittent/slow responses
 * - HEALTHY: all good
 */

const {
  classifyDesktopHealth,
  diagnoseOutage,
  attemptRecovery,
  shouldEscalateToJesse,
} = require('../desktop-health');

describe('classifyDesktopHealth', () => {
  test('returns HEALTHY when tunnel probe and desktop both respond', () => {
    const result = classifyDesktopHealth({
      tunnelProbe: 'HEALTHY',
      sshReachable: true,
      httpAgentReachable: true,
    });
    expect(result.status).toBe('HEALTHY');
    expect(result.rootCause).toBeNull();
  });

  test('returns TUNNEL_REFUSE_ALL when tunnel probe says REFUSE-ALL', () => {
    const result = classifyDesktopHealth({
      tunnelProbe: 'REFUSE-ALL',
      sshReachable: false,
      httpAgentReachable: false,
    });
    expect(result.status).toBe('TUNNEL_REFUSE_ALL');
    expect(result.rootCause).toBe('tunnel-proxy');
    expect(result.actionable).toBe(false); // can't fix from VM, must wait
  });

  test('returns DESKTOP_DOWN when tunnel OK but desktop unreachable', () => {
    const result = classifyDesktopHealth({
      tunnelProbe: 'HEALTHY',
      sshReachable: false,
      httpAgentReachable: false,
    });
    expect(result.status).toBe('DESKTOP_DOWN');
    expect(result.rootCause).toBe('desktop');
  });

  test('returns DESKTOP_DEGRADED when only one path works', () => {
    const result = classifyDesktopHealth({
      tunnelProbe: 'HEALTHY',
      sshReachable: true,
      httpAgentReachable: false,
    });
    expect(result.status).toBe('DESKTOP_DEGRADED');
  });
});

describe('diagnoseOutage', () => {
  test('tracks consecutive failures and identifies pattern', () => {
    const history = [
      { status: 'DESKTOP_DOWN', at: '2026-10-06T09:53:00' },
      { status: 'DESKTOP_DOWN', at: '2026-10-06T10:03:00' },
      { status: 'DESKTOP_DOWN', at: '2026-10-06T10:33:00' },
    ];
    const diagnosis = diagnoseOutage(history);
    expect(diagnosis.consecutiveFailures).toBe(3);
    expect(diagnosis.pattern).toBe('persistent-desktop-down');
    expect(diagnosis.likelyCause).toContain('desktop');
  });

  test('detects tunnel flapping pattern', () => {
    const history = [
      { status: 'TUNNEL_REFUSE_ALL', at: '2026-10-06T09:53:00' },
      { status: 'HEALTHY', at: '2026-10-06T10:03:00' },
      { status: 'TUNNEL_REFUSE_ALL', at: '2026-10-06T10:13:00' },
    ];
    const diagnosis = diagnoseOutage(history);
    expect(diagnosis.pattern).toBe('tunnel-flapping');
  });

  test('detects recovery', () => {
    const history = [
      { status: 'DESKTOP_DOWN', at: '2026-10-06T09:53:00' },
      { status: 'HEALTHY', at: '2026-10-06T10:03:00' },
    ];
    const diagnosis = diagnoseOutage(history);
    expect(diagnosis.pattern).toBe('recovered');
    expect(diagnosis.consecutiveFailures).toBe(0);
  });
});

describe('attemptRecovery', () => {
  test('does NOT attempt VM-side fix for TUNNEL_REFUSE_ALL (must wait)', () => {
    const result = attemptRecovery({ status: 'TUNNEL_REFUSE_ALL' });
    expect(result.attempted).toBe(false);
    expect(result.reason.toLowerCase()).toContain('tunnel');
  });

  test('attempts SSH-based desktop diagnostics for DESKTOP_DOWN', () => {
    const result = attemptRecovery({ status: 'DESKTOP_DOWN' });
    // Can't fix a powered-off desktop from VM, but can verify it's really down
    expect(result.attempted).toBe(true);
    expect(result.action).toBe('verify-and-log');
  });
});

describe('shouldEscalateToJesse', () => {
  test('escalates after 3 consecutive DESKTOP_DOWN (may need physical check)', () => {
    expect(shouldEscalateToJesse({
      status: 'DESKTOP_DOWN',
      consecutiveFailures: 3,
    })).toBe(true);
  });

  test('does NOT escalate for TUNNEL_REFUSE_ALL (self-recovers)', () => {
    expect(shouldEscalateToJesse({
      status: 'TUNNEL_REFUSE_ALL',
      consecutiveFailures: 5,
    })).toBe(false);
  });

  test('does NOT escalate on first failure', () => {
    expect(shouldEscalateToJesse({
      status: 'DESKTOP_DOWN',
      consecutiveFailures: 1,
    })).toBe(false);
  });
});
