# Budget-First Routing (Default)
**Date:** 2026-09-29
**Directive:** Jesse — this is the DEFAULT out-of-the-box routing for MACF,
not opt-in. Anyone installing MACF gets budget-first automatically.

## Design principle

> The default install works for someone with **zero API budget** (local
> model only) and gracefully scales up through subscriptions → OpenRouter
> → direct APIs as they add credentials.

Premium tiers are the exception, not the rule.

## The chain

```
Slack runtime
  1. Local Ollama .................... $0 (when GPU healthy)
  2. Claude subscription (OAuth) ...... $0 marginal (when active)
       |
       v
LiteLLM gateway (:4000)
  3. OpenRouter ...................... $0 (free-tier) → paid (credits)
  4. Direct APIs (last resort) ....... Meta Muse → Gemini → Claude
```

Each layer is tried in order; the first success wins. Missing credentials
fail fast and fall through — no configuration needed to skip a tier you
haven't set up.

## Why two layers

- **Runtime layer** handles what LiteLLM can't: the Claude subscription
  OAuth flow (custom beta header, token management).
- **Gateway layer** (LiteLLM) handles provider fan-out with per-tier
  fallback chains and cross-tier failover.

## Strict priority implementation

LiteLLM's router **shuffles** multiple deployments under one `model_name`
(default `simple-shuffle`), which breaks cost ordering — a request could
hit a paid API before trying local. So each cost tier is a **separate
model_name**, chained by `router_settings.fallbacks`:

```
macf-cheap (local $0)
  -> macf-smart (local $0, strict first)
    -> macf-smart-free (OpenRouter free $0)
      -> macf-best (OpenRouter paid, then free)
        -> macf-best-direct (Meta -> Gemini -> Claude, last resort)
          -> macf-cheap (final fallback)
macf-muse (Meta direct) -> macf-best
```

Within a tier, deployments are shuffled — but every deployment in a tier
costs the same, so shuffle order never affects cost. A tier is only tried
after every cheaper tier has failed. Verified 2026-09-29: 4/4 `macf-smart`
requests served locally, never shuffled to paid tiers.

## Zero-budget install

1. Install Ollama, pull `qwen2.5:3b-instruct-q4_K_M`.
2. Install LiteLLM, copy `proxies/macf_gateway.env.example` to
   `macf_gateway.env` (leave API keys blank).
3. Start the gateway. `macf-cheap` works immediately; other tiers fall
   through gracefully.

## Adding budget later

- Add OpenRouter credits → `macf-smart`/`macf-best` get smarter free/paid
  models automatically.
- Add API keys → direct tiers activate as last-resort fallbacks.
- Reactivate Claude subscription → runtime picks it up with
  `USE_CLAUDE_SUBSCRIPTION=true`.

No config changes needed — the chain adapts to available credentials.
