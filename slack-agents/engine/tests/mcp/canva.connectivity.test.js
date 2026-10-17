'use strict';
// Canva MCP connectivity — real path: npx mcp-remote -> https://mcp.canva.com/mcp
// Grants: ceo, cmo, cco, cto.
// FAILS NOW (2026-10-05): stored OAuth tokens expired; proactive refresh is
// REJECTED by Canva ("OAuthError2: refresh_rejected"). Needs a fresh OAuth
// authorization by Jesse (desktop/phone flow — VM egress proxy blocks the
// browser callback). Passes only when initialize + tools/list succeed.
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '..', '.env') });
const { rolesGranting, probeServer } = require('./helpers/probe');

jest.setTimeout(90000);

test('canva is granted to at least one role', () => {
  const roles = rolesGranting('canva');
  expect(roles.length).toBeGreaterThan(0);
});

test('canva MCP server connects and lists tools end to end', async () => {
  const r = await probeServer('canva', { timeoutMs: 60000 });
  if (!r.ok) {
    throw new Error(`canva MCP path broken after ${r.ms}ms: ${r.error}`);
  }
  expect(r.tools.length).toBeGreaterThan(0);
}, 90000);
