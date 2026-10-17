'use strict';
// Desktop Agent MCP — the desktop channel Jesse ordered extended to the CTO
// on Oct 12, 2026 ("Extend the CTO's grants to the desktop channels",
// Vikunja #738). Wraps the desktop agent on DESKTOP-4U63DES (health,
// bounded PowerShell, agent log) so the CTO can inspect desktop-side
// process state, config, and logs (e.g. the LiteLLM gateway, #736).
// Passes only when a desktop-agent server is defined in grants.json,
// granted to the CTO, and initialize + tools/list succeed through the
// real probe (same spawn path as production).
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '..', '.env') });
const { loadGrants, rolesGranting, probeServer } = require('./helpers/probe');

jest.setTimeout(60000);

test('desktop-agent is defined in grants.json', () => {
  const g = loadGrants();
  expect(Object.keys(g.servers)).toContain('desktop-agent');
});

test('desktop-agent is granted to the CTO', () => {
  const roles = rolesGranting('desktop-agent');
  expect(roles).toContain('cto');
});

test('desktop-agent MCP server connects and lists tools end to end', async () => {
  const r = await probeServer('desktop-agent', { timeoutMs: 30000 });
  if (!r.ok) {
    throw new Error(`desktop-agent MCP path broken after ${r.ms}ms: ${r.error}`);
  }
  // probeServer returns tool NAMES (strings), not tool objects.
  expect(r.tools).toEqual(
    expect.arrayContaining(['desktop_health', 'desktop_run', 'desktop_log'])
  );
}, 45000);
