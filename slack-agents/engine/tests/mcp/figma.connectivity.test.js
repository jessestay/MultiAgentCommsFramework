'use strict';
// Figma MCP connectivity — real path: npx figma-context-mcp with FIGMA_TOKEN.
// NOTE (Oct 5, 2026): tried the official https://mcp.figma.com/mcp via
// mcp-remote OAuth — Figma rejects dynamic client registration (403) for
// non-catalog clients, so PAT is the only working path. Figma caps PATs at
// 90 days; engine/token-health.js tracks the issue date and warns at 75d.
// Passes only when initialize + tools/list succeed.
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '..', '.env') });
const { rolesGranting, probeServer } = require('./helpers/probe');

jest.setTimeout(120000);

test('figma is granted to at least one role', () => {
  const roles = rolesGranting('figma');
  expect(roles.length).toBeGreaterThan(0);
});

test('figma MCP server connects and lists tools end to end', async () => {
  const r = await probeServer('figma', { timeoutMs: 75000 });
  expect(r.ok).toBe(true);
  expect(r.error).toBeNull();
  expect(r.tools.length).toBeGreaterThan(0);
}, 110000);
