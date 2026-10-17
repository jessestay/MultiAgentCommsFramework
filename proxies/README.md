# MACF LiteLLM Gateway

Self-hosted OpenAI-compatible LLM gateway (LiteLLM) that gives every MACF
installation **budget-first routing out of the box**.

## The default chain

Jesse's money-saving order — the DEFAULT, not opt-in:

1. **Local** — Ollama (e.g. `qwen2.5:3b-instruct-q4_K_M`). Free. Works with
   zero API budget; a fresh install with only Ollama is fully functional.
2. **Desktop-app subscriptions** — handled upstream in the Slack runtime
   (`slack-agents/utils/litellm-gateway.js`), riding existing subscriptions
   at $0 marginal cost. See `docs/routing/desktop-subscription-bridge.md`.
3. **OpenRouter** — 3rd-party aggregator. Free-tier models first; paid models
   are overflow for when credits are added.
4. **Direct paid APIs** (last resort) — Meta Muse, Gemini, Claude.

Premium/paid paths are the exception, not the rule.

## Files

| File | Purpose |
|------|---------|
| `litellm_config.yaml` | Gateway model tiers and fallback chains. No secrets — all provider keys via `os.environ/...`. |
| `macf_gateway.env.example` | Template for provider credentials. Copy to `macf_gateway.env` and fill in. **Never commit the real file.** |
| `deploy_model_router.ps1` | Windows deploy script (lives on the gateway host, not in git). Stops strays, loads `macf_gateway.env`, launches LiteLLM on :4000. |

## Tiers

| Tier | Use | Chain |
|------|-----|-------|
| `macf-cheap` | Routine/fast work | Local only ($0) |
| `macf-smart` | Everyday smart work | OpenRouter free → Muse API → Gemini API → Claude Haiku |
| `macf-best` | Hardest work | OpenRouter paid → OpenRouter free → Muse API → Gemini API → Claude Sonnet |
| `macf-muse` | Explicit Meta routing | Muse API direct |

Cross-tier failover is configured in `router_settings.fallbacks`.

## Setup (new installation)

1. Install Ollama and pull a local model: `ollama pull qwen2.5:3b-instruct-q4_K_M`
2. Install LiteLLM: `pip install litellm`
3. Copy `macf_gateway.env.example` to `macf_gateway.env`; add keys you have.
   Leave blank what you don't — those deployments fail fast and fall through.
4. Generate a master key and put it in `LITELLM_MASTER_KEY`.
5. Launch: `litellm --config litellm_config.yaml --port 4000`
6. All MACF runtime calls go to `http://127.0.0.1:4000/v1/chat/completions`
   with `Authorization: Bearer <LITELLM_MASTER_KEY>`.

## Operational notes

- **Auth is required.** LiteLLM picks up `LITELLM_MASTER_KEY` from the
  environment automatically. Unauthenticated requests get 401.
- **Prisma must be installed** (`pip install prisma`). Without it, LiteLLM's
  auth exception handler crashes with `ModuleNotFoundError: No module named
  'prisma'` and every unauthenticated request 500s instead of 401ing.
- **Start via the scheduled task, not SSH.** Gateway processes launched over
  SSH die when the session ends. The `litellm-gateway` scheduled task
  (every 10 min, idempotent) is the supported launcher.
- **Ollama GPU (2026-09-29):** On GTX 980 (Maxwell), Ollama's GPU discovery
  times out, forcing CPU fallback — too slow for gateway use. Local
  deployments are commented out in the config until resolved. See
  `docs/routing/local-model-status.md`.
