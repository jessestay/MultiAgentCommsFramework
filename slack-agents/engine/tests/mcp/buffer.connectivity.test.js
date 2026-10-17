'use strict';
// Buffer MCP connectivity — real path: mcp-remote -> Buffer MCP endpoint
// Grants: ceo, cmo. OAuth via Jesse's desktop approval (Oct 5, 2026).
// Passes only when initialize + tools/list succeed.
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '..', '.env') });
const { rolesGranting, probeServer } = require('./helpers/probe');

jest.setTimeout(90000);

test('buffer is granted to at least one role', () => {
  const roles = rolesGranting('buffer');
  expect(roles.length).toBeGreaterThan(0);
});

test('buffer MCP server connects and lists tools end to end', async () => {
  const r = await probeServer('buffer', { timeoutMs: 60000 });
  if (!r.ok) {
    console.log('buffer probe error:', r.error);
  }
  expect(r.ok).toBe(true);
  expect(r.tools.length).toBeGreaterThan(5);
});
