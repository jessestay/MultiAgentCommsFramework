'use strict';
// token-health.test.js — the permanence contract.
// Fail-first: these encode what "we don't have to keep doing this" means:
// expiry is always visible BEFORE breakage, and every credential has a
// recorded rotation horizon.
const fs = require('fs');
const os = require('os');
const path = require('path');
const th = require('../token-health');

const DAY = 86400000;

function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tokhealth-'));
  return d;
}
function writeTokens(dir, name, expiresAtMs, withRefresh = true) {
  const d = { access_token: 'x', token_type: 'Bearer', expires_in: 3600, scope: 's', expires_at: expiresAtMs };
  if (withRefresh) d.refresh_token = 'r';
  fs.writeFileSync(path.join(dir, name + '_tokens.json'), JSON.stringify(d));
  fs.writeFileSync(path.join(dir, name + '_client_info.json'), JSON.stringify({ note: name }));
}

test('fresh mcp-remote token reads ok', () => {
  const dir = tmpDir();
  writeTokens(dir, 'canva', Date.now() + 30 * DAY);
  const out = th.checkMcpRemoteTokens(dir);
  expect(out).toHaveLength(1);
  expect(out[0].status).toBe('ok');
});

test('mcp-remote token expiring within 7 days with refresh stays ok (auto-renews)', () => {
  const dir = tmpDir();
  writeTokens(dir, 'canva', Date.now() + 3 * DAY);
  const out = th.checkMcpRemoteTokens(dir);
  expect(out[0].status).toBe('ok');
  expect(out[0].detail).toMatch(/auto-renews/);
});

test('mcp-remote token past expiry with refresh stays ok (connectivity test decides)', () => {
  const dir = tmpDir();
  writeTokens(dir, 'canva', Date.now() - 2 * DAY);
  const out = th.checkMcpRemoteTokens(dir);
  expect(out[0].status).toBe('ok');
});

test('mcp-remote token expiring with NO refresh token warns', () => {
  const dir = tmpDir();
  writeTokens(dir, 'canva', Date.now() + 3 * DAY, false);
  const out = th.checkMcpRemoteTokens(dir);
  expect(out[0].status).toBe('expiring');
});

test('mcp-remote token expired with no refresh token demands re-auth', () => {
  const dir = tmpDir();
  writeTokens(dir, 'canva', Date.now() - 2 * DAY, false);
  const out = th.checkMcpRemoteTokens(dir);
  expect(out[0].status).toBe('expired');
  expect(out[0].detail).toMatch(/re-authorization required/);
});

test('missing token store reports unknown, never ok', () => {
  const out = th.checkMcpRemoteTokens('/nonexistent-dir-xyz');
  expect(out[0].status).toBe('unknown');
});

test('summarize flags anything expiring or expired for Jesse', () => {
  const s = th.summarize([
    { server: 'canva', status: 'ok', detail: 'fine' },
    { server: 'figma', status: 'expiring', detail: 'rotate soon' },
  ]);
  expect(s.healthy).toBe(false);
  expect(s.needs_attention).toHaveLength(1);
  expect(s.needs_attention[0].server).toBe('figma');
});

test('manual token without recorded issue date is unknown, never ok', () => {
  const out = th.checkManualTokens({});
  const figma = out.find(o => o.server === 'figma');
  expect(figma.status).toBe('unknown');
  expect(figma.detail).toMatch(/--record figma/);
});

test('manual figma token warns at 75d and expires at 90d', () => {
  const now = Date.now();
  const DAY = 86400000;
  expect(th.checkManualTokens({ figma_token_issued_at: now - 10 * DAY }, now)[0].status).toBe('ok');
  expect(th.checkManualTokens({ figma_token_issued_at: now - 76 * DAY }, now)[0].status).toBe('expiring');
  expect(th.checkManualTokens({ figma_token_issued_at: now - 91 * DAY }, now)[0].status).toBe('expired');
});

test('summarize is healthy when all ok', () => {
  const s = th.summarize([{ server: 'canva', status: 'ok', detail: 'fine' }]);
  expect(s.healthy).toBe(true);
  expect(s.needs_attention).toHaveLength(0);
});
