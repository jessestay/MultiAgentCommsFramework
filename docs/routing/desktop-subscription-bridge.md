# Desktop-App Subscription Bridge — Planned Major Feature
**Date:** 2026-09-29
**Status:** BACKLOG — major feature, prioritized after budget runway improves
**Jesse's directive:** "Don't mark the desktop app subscriptions as infeasible — I can fund subscriptions. That needs to be a major feature of the MACF across multiple subscription LLMs."

## Vision

MACF rides the user's existing AI subscriptions at $0 marginal cost per request as tier 2 of the budget-first routing chain (after local, before OpenRouter). Priority order: **Muse → Claude → Gemini → ChatGPT**.

This is a key MACF differentiator: users already pay for these subscriptions. MACF should use them instead of burning per-token API fees.

## Per-app status

| App | Subscription path | Status |
|-----|------------------|--------|
| Claude (Desktop / Code) | Claude Code OAuth token via `routeViaClaudeSubscription()` in `slack-agents/utils/litellm-gateway.js` | **Nearest-term** — code exists, needs active subscription + fresh OAuth token |
| Muse (Meta AI app) | No local API today | **Research needed** — monitor Meta for API/CLI surface |
| Gemini app | No local API today | **Research needed** — monitor Google for API/CLI surface |
| ChatGPT app | No local API today | **Research needed** — monitor OpenAI for API/CLI surface |

## Claude subscription path (code exists)

The Slack runtime already implements this in `slack-agents/utils/litellm-gateway.js`:

- `routeViaClaudeSubscription()` calls Anthropic's API directly using a Claude Code OAuth bearer token with the OAuth beta header.
- Enabled via `USE_CLAUDE_SUBSCRIPTION=true`.
- Runs **upstream of the LiteLLM gateway** — the runtime tries the subscription before ever calling `:4000`.

### To activate (when Jesse funds it)

1. Reactivate the Claude subscription (Max payment failed 2026-09-26).
2. Run a bounded `claude -p` test to capture a fresh OAuth token.
3. Set `USE_CLAUDE_SUBSCRIPTION=true` in the runtime `.env`.

## Design principles for the full feature

- **Graceful degradation:** If a subscription lapses or its bridge breaks, the chain falls through to the next tier automatically. No single subscription is a hard dependency.
- **Per-app isolation:** Each bridge is independent — Muse breaking doesn't affect Claude.
- **No fragile UI automation in v1:** Bridges must use supported APIs, OAuth tokens, or CLIs. DOM scraping is explicitly out of scope until a supported path exists.
- **User-funded:** The user brings their own subscriptions; MACF never pays for or manages them.

## Open research

- Watch for Meta/Google/OpenAI exposing local API or CLI access for their consumer apps.
- Evaluate whether official "agent mode" or MCP surfaces in these apps could serve as a bridge.
- Revisit feasibility quarterly or when vendors ship new integration surfaces.
