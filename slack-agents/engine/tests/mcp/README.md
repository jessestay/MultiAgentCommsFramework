# MCP connectivity tests — fail-first (TDD)

Diagnosis-only probes for the MACF hands MCP path. Each test spawns the server
**exactly as `hands/grants.json` configures it** (same command/args/env/cwd)
through the real MCP SDK `StdioClientTransport`, runs `initialize` +
`tools/list`, and passes ONLY when the full client → server path works end to
end. No mocks, no stubs.

## Run

From `~/workspace/macf/slack-agents`:

```bash
npx jest engine/tests/mcp --forceExit
```

Secrets resolve from `slack-agents/.env` (same as production); values are never
printed. Tests fail closed: any spawn error, auth failure, or timeout is a
test failure with the underlying error in the message.

## Current state (2026-10-05, verified by live probes)

| Server | Verdict | Root cause |
|---|---|---|
| Canva | RED | OAuth tokens expired; Canva rejects refresh (`refresh_rejected`). Needs fresh OAuth by Jesse (desktop flow — VM egress proxy blocks the browser callback). |
| Figma | GREEN | Fresh PAT issued Oct 5, 2026 (Jesse regenerated); `figma-context-mcp` needs `--stdio` flag or it defaults to HTTP mode (root-caused Oct 5). PATs max 90 days — tracked by token-health.js, warns at 75d. |
| n8n-mcp | GREEN | Binary installed globally + in hands/package.json; granted to CEO/CTO; end-to-end test passes. Local n8n runs without auth. |
| Desktop Commander | GREEN | Added to grants.json (CEO/CTO); installed globally + as dep; end-to-end test passes. |
| Google products (Drive/Docs/Sheets) | NEVER CONFIGURED | No OAuth credentials; granted to no role; `server-gdrive` package deprecated upstream. Needs replacement package + OAuth. |

Expected suite result right now: **canva, figma, google-products fail; n8n, desktop-commander pass**. A file goes
green only when its server's real path is repaired — the tests are the
acceptance criteria.

Durability (Oct 5): `engine/token-health.js` + daily `mcp-token-health` cron watch
credential expiry (mcp-remote token store `expires_at`; n8n keys do not expire)
and warn Jesse days before breakage. Figma no longer needs PAT rotation.
