# Desktop-App Subscription Bridge — Feasibility Assessment
**Date:** 2026-09-29
**Question:** Can MACF ride Jesse's desktop-app subscriptions (Muse app,
Claude Desktop, Gemini app, ChatGPT app) at $0 marginal cost as tier 2 of the
budget-first routing chain?

## Verdict

| App | Programmatic access? | Feasible? |
|-----|---------------------|-----------|
| Claude (Desktop / Code) | Yes — Claude Code OAuth token | **Yes, with caveats** |
| Muse (Meta AI app) | No local API or CLI | No |
| Gemini app | No local API or CLI | No |
| ChatGPT app | No local API or CLI | No |

Only **Claude** has a viable subscription-riding path. The other three apps
expose no supported local API, CLI, or automation surface — bridging them
would require fragile GUI/browser automation, which is unsuitable as a
24/7 production backend (breaks on UI updates, violates ToS, unreliable).

## Claude subscription path (implemented)

The Slack runtime already implements this in
`slack-agents/utils/litellm-gateway.js`:

- `routeViaClaudeSubscription()` calls Anthropic's API directly using a
  Claude Code OAuth bearer token with the OAuth beta header.
- Enabled via `USE_CLAUDE_SUBSCRIPTION=true`.
- It runs **upstream of the LiteLLM gateway** — the runtime tries the
  subscription before ever calling `:4000`.

### Current blockers (2026-09-29)

1. **Subscription past due.** Per records, Jesse's Claude Max payment failed
   2026-09-26; Claude Code access was disabled. The bridge cannot work until
   the subscription is reactivated.
2. **No OAuth token present.** `~/.claude/.credentials.json` contains only
   MCP OAuth entries, not a Claude account OAuth block. The
   `CLAUDE_CODE_OAUTH_TOKEN` source is unverified this session.

**Next step:** When Jesse reactivates the subscription, run a bounded
`claude -p` test to capture a fresh OAuth token, then set
`USE_CLAUDE_SUBSCRIPTION=true`.

## Why not UI automation for the other apps

- **Fragility:** Selectors and layouts change without notice; a 24/7 bridge
  built on DOM scraping breaks silently.
- **Policy:** Automating consumer app UIs to extract inference at scale
  risks account termination.
- **Cost/benefit:** The engineering effort to maintain four separate
  UI-automation bridges exceeds the savings vs. OpenRouter free-tier models,
  which already fill the $0-cost slot in the chain.

## Recommendation

Keep tier 2 as **Claude-subscription-only**, implemented in the runtime
layer (not the gateway). Document the other apps as infeasible. If Jesse
wants them anyway, that requires his explicit acceptance of the
instability and account-policy risk.
