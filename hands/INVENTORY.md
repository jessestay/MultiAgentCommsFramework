# Hands Gateway — MCP Server Inventory

**Date:** Oct 1, 2026
**Rule (Jesse):** build our own where there's benefit; reuse existing otherwise.

## Reuse (existing servers)

| Server | Use for | Notes |
|---|---|---|
| PayPal `agent-toolkit` (official, `paypal/agent-toolkit`) | Underlying PayPal API client inside our finance server | Supports per-action scoping (enable only read actions). We still wrap it: our server owns the tool surface + role gate. Needs PayPal Client ID/Secret — Jesse-gated step (PayPal developer dashboard). |
| `n8n-mcp` | n8n workflow triggering | Already in mcp.json. **API key is plaintext — must rotate before production use.** |
| Official `fetch`, `filesystem`, `github` MCP servers | Generic needs | Fine as-is; no role data inside. |
| `google-sheets-mcp`, `canva` entries in mcp.json | Existing | Leave alone; not part of hands pilot. |

## Build our own (thin wrappers)

| Server | Tools (pilot) | Why build |
|---|---|---|
| `macf-finance` | `finance_transactions_read`, `finance_balance_read` (read-only) | No existing server gives us PayPal reads + our CFO-only role gate in one place. Thin wrapper over PayPal REST (or agent-toolkit). |
| `macf-outreach` (next) | Gmail search/read/draft/send via `hatch_gws_cli` + worker scripts | No good Gmail MCP with our draft-approval gate. Wraps existing workers — don't rebuild. |
| `macf-ops` (next) | Health checks, deploys, watchdog | No existing equivalent; wraps our scripts. |

## Verdict

- **PayPal:** reuse the official toolkit as the API client, but our own `macf-finance` MCP server owns the tool surface (2 read-only tools) and the CFO-only role gate. The official toolkit's full action set (invoices, payouts, refunds) is far broader than any role should see.
- **Gmail/n8n/ops:** our own thin wrappers around existing scripts and CLIs.
- **Nothing is built from scratch** that already exists in a usable form.
