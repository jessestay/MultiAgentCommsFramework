# Hands Gateway — Railway environment variables

The CFO's hands run on Railway (slack-agents deploy). These env vars must be
set in the Railway service for the hands to work in production. Nothing below
is a secret value — set the real values in Railway's dashboard, never in git.

## Required for the macf-finance pilot (CFO)

| Variable | Purpose | Where to get it |
|---|---|---|
| `MACF_CFO_ROLE_TOKEN` | Layer-2 auth: the finance MCP server only starts when the client presents this token for role CFO. Must match the `CFO=` entry in `hands/.role-tokens` (local dev file — NEVER committed). | Generate: `openssl rand -hex 32`. Store the same value in Railway AND in the local `hands/.role-tokens` file. |
| `PAYPAL_CLIENT_ID` | PayPal REST API client ID (Live). | PayPal Developer Dashboard → My Apps & Credentials → your app. |
| `PAYPAL_CLIENT_SECRET` | PayPal REST API secret (Live). | Same place. |
| `PAYPAL_ENVIRONMENT` | `LIVE` (default) or `SANDBOX`. | Set `SANDBOX` for testing. |

## How the pieces resolve secrets

- `mcp-client` spawns each granted server with `MACF_ROLE` + `MACF_ROLE_TOKEN`
  in its environment. `roleToken()` reads `MACF_<ROLE>_ROLE_TOKEN` first,
  falling back to the local 600-mode `.role-tokens` file.
- `macf-finance` `checkRole()` accepts the token from `MACF_CFO_ROLE_TOKEN`
  or the local file. Wrong role or wrong token → the server exits(2) REFUSED.
- PayPal creds come from `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` in the
  process environment. Missing → tools fail closed with a clear error, and
  the ReAct loop reports UNVERIFIED instead of fabricating numbers.

## Deploy checklist

1. `git push` this repo → Railway auto-deploys (NIXPACKS runs `npm install`,
   which picks up `@modelcontextprotocol/sdk` from `slack-agents/package.json`).
2. Set the four env vars above in Railway.
3. In Slack, DM the CFO or post in #management: `[from: CEO → CFO] what is our current PayPal balance?`
   The reply must cite verified tool output, and `hands/logs/tool-calls.log`
   (local) / Railway logs (production) must show the tool call.
