'use strict';
// Desktop Commander MCP — the "run shell on this machine" capability Jesse
// asked about ("I thought we gave the team MCP capabilities").
// FAILS NOW (2026-10-05): Desktop Commander was NEVER configured. It has no
// entry in hands/grants.json, no role grants it, and no server definition
// exists anywhere in the repo. There is nothing to connect to.
// Passes only when a desktop-commander server is defined in grants.json,
// granted to at least one role, and initialize + tools/list succeed.
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '..', '.env') });
const { loadGrants, rolesGranting, probeServer } = require('./helpers/probe');

jest.setTimeout(60000);

test('desktop-commander is defined in grants.json', () => {
  const g = loadGrants();
  expect(Object.keys(g.servers)).toContain('desktop-commander');
});

test('desktop-commander is granted to at least one role', () => {
  const roles = rolesGranting('desktop-commander');
  expect(roles.length).toBeGreaterThan(0);
});

test('desktop-commander MCP server connects and lists tools end to end', async () => {
  const r = await probeServer('desktop-commander', { timeoutMs: 30000 });
  if (!r.ok) {
    throw new Error(`desktop-commander MCP path broken after ${r.ms}ms: ${r.error}`);
  }
  expect(r.tools.length).toBeGreaterThan(0);
}, 45000);
