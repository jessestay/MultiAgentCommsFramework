/**
 * desktop-probe tests (TDD)
 *
 * Regression coverage for the Oct 6, 2026 watchdog bug: the probe used to be
 * an inline `node -e "..."` inside bash double quotes, where unescaped
 * backticks made bash execute `nc -X connect -x %h %p` as a shell command
 * ("nc: missing port number") and ${...} was eaten by bash — leaving node
 * with a SyntaxError so desktop health silently never ran. The probe now
 * lives in its own file; these tests pin the pure helpers it depends on.
 */

const { deriveTunnelProxy, buildProxyCommand } = require('../desktop-probe');

describe('deriveTunnelProxy', () => {
  test('derives host:3130 from a full proxy URL with credentials', () => {
    expect(deriveTunnelProxy('http://user:s3cret@hatch-egress-proxy:3128')).toBe(
      'hatch-egress-proxy:3130'
    );
  });

  test('works without credentials', () => {
    expect(deriveTunnelProxy('http://hatch-egress-proxy:3128')).toBe('hatch-egress-proxy:3130');
  });

  test('forces port 3130 even when the URL names a different port', () => {
    // The old regex /:\d+@/ never matched "user:pass@host:3128" and would
    // have kept the egress 3128 — the tunnel needs 3130.
    expect(deriveTunnelProxy('http://u:p@some-proxy:8080')).toBe('some-proxy:3130');
  });

  test('tolerates surrounding whitespace/newlines in the env value', () => {
    expect(deriveTunnelProxy('http://u:p@hatch-egress-proxy:3128\n')).toBe(
      'hatch-egress-proxy:3130'
    );
  });

  test('returns null for missing/empty input', () => {
    expect(deriveTunnelProxy('')).toBeNull();
    expect(deriveTunnelProxy(null)).toBeNull();
    expect(deriveTunnelProxy(undefined)).toBeNull();
  });
});

describe('buildProxyCommand', () => {
  test('builds an nc CONNECT command keeping %h/%p literal for ssh', () => {
    expect(buildProxyCommand('hatch-egress-proxy:3130')).toBe(
      'nc -X connect -x hatch-egress-proxy:3130 %h %p'
    );
  });

  test('returns null without a tunnel proxy', () => {
    expect(buildProxyCommand(null)).toBeNull();
  });
});
