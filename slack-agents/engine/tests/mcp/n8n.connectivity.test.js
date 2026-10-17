'use strict';
// n8n MCP connectivity — real path: `n8n-mcp` binary on PATH with
// N8N_API_URL=http://127.0.0.1:5678/api and N8N_API_KEY=${N8N_MCP_API_KEY}.
// Grants: ceo, cto.
// FAILS NOW (2026-10-05), two layers:
//   1. `n8n-mcp` is not installed anywhere (spawn ENOENT) — the grants.json
//      command cannot start. The n8n server itself IS up on :5678.
//   2. Even with the binary, auth is broken: N8N_MCP_API_KEY from .env gets
//      HTTP 403 from the n8n API, and the quarantined hands/.n8n-api-key gets
//      HTTP 401. A valid key must be minted in the n8n UI.
// Passes only when initialize + tools/list succeed through the real server.
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '..', '.env') });
const { execSync } = require('child_process');
const { rolesGranting, probeServer } = require('./helpers/probe');

jest.setTimeout(60000);

test('n8n-mcp is granted to at least one role', () => {
  const roles = rolesGranting('n8n-mcp');
  expect(roles.length).toBeGreaterThan(0);
});

test('n8n-mcp binary configured in grants.json exists and is executable', () => {
  // Durability fix (Oct 12, 2026): grants.json invokes the ABSOLUTE durable
  // path in hands/node_modules — the bare name on PATH is the EPHEMERAL
  // global install that VM churn deleted on Oct 5, Oct 11, and Oct 12, 2026.
  // Assert the configured command itself, not a PATH lookup.
  const fs = require('fs');
  const { specFor } = require('./helpers/probe');
  const cmd = specFor('n8n-mcp').command;
  let ok = false;
  try {
    fs.accessSync(cmd, fs.constants.X_OK);
    ok = true;
  } catch (e) {
    try {
      execSync(`command -v ${cmd}`, { stdio: 'ignore' });
      ok = true;
    } catch (e2) { /* not found */ }
  }
  expect(ok).toBe(true);
});

test('n8n MCP server connects and lists tools end to end', async () => {
  const r = await probeServer('n8n-mcp', { timeoutMs: 30000 });
  expect(r.ok).toBe(true);
  expect(r.error).toBeNull();
  expect(r.tools.length).toBeGreaterThan(0);
}, 45000);
