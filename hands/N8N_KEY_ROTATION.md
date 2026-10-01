# n8n API Key — Rotation Plan

**Status:** QUARANTINED Oct 1, 2026 (moved from plaintext mcp.json to 600-mode file)
**Location:** `~/workspace/macf/hands/.n8n-api-key` (mode 600, never printed)
**mcp.json:** now references `${N8N_API_KEY}` env var

## Why rotation is still needed
Quarantine stops the bleeding (no more plaintext in a config file that could be committed).
But the key itself was exposed in plaintext for an unknown duration. Anyone with
read access to the old mcp.json has it. Rotation invalidates the old key.

## Rotation steps (requires n8n UI access)
1. Open n8n at http://localhost:5678 (or the production n8n URL)
2. Go to Settings → n8n API → create a new API key
3. Replace the contents of `~/workspace/macf/hands/.n8n-api-key` with the new key
4. Delete the old key in the n8n UI
5. Verify: `N8N_API_KEY=$(cat ~/workspace/macf/hands/.n8n-api-key) n8n-mcp` starts clean

## Launcher pattern
Any process that spawns MCP servers from mcp.json must source the key first:
```bash
export N8N_API_KEY=$(cat ~/workspace/macf/hands/.n8n-api-key)
# then launch the MCP client that reads mcp.json
```

## Never again
- No credentials in mcp.json, ever. Env var references only.
- `git add` on macf/ must never include hands/.n8n-api-key or hands/.role-tokens
  (root .gitignore covers secrets, but verify before every commit).
