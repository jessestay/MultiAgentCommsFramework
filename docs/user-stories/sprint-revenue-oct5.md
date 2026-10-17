# User Stories — Revenue Sprint (Sep 28–29, 2026)

Context: $3,000 revenue target by Oct 5, 2026. LiteLLM gateway verified working Sep 29; this sprint unblocks the revenue push.

## P0 — Gateway & Local AI (completed Sep 29)

### US-1: Rebuild LiteLLM gateway with strict-priority budget routing
**As a** MACF operator, **I want** the gateway to try free tiers before paid ones in strict order, **so that** routine work costs $0.
**Acceptance criteria:**
- `macf-cheap`/`macf-smart` serve from local Ollama first (verified 0.6–1.3s warm)
- Fallback chain: local → OpenRouter free → OpenRouter paid → direct APIs
- 12 consecutive requests, zero failures
**Status:** Done. Config: `C:\Users\stay\claude_proxy\litellm_config.yaml`.

### US-2: Fix local AI on GTX 980 (Maxwell)
**As a** MACF operator, **I want** Ollama to use the GTX 980 GPU, **so that** local inference runs in seconds not minutes.
**Acceptance criteria:**
- Ollama 0.5.7 with cuda_v11_avx runner (0.33.1 dropped Maxwell CUDA support)
- 17/37 layers GPU-offloaded, warm inference ~4s
- Runs via scheduled task `Ollama-LocalAI` at login
**Status:** Done.

### US-3: Repoint Slack runtime to LiteLLM gateway
**As a** MACF operator, **I want** the Slack runtime to use the gateway instead of the weak OpenRouter free fallback, **so that** personas generate quality responses at $0.
**Acceptance criteria:**
- `USE_LITELLM_GATEWAY=true` in slack-agents `.env`
- Exactly one runtime instance running
- Direct gateway test returns 200 without posting to Slack
**Status:** Done Sep 29. Runtime PID 29524, verified via direct `/v1/chat/completions` calls.

### US-4: Add gateway model aliases for runtime compatibility
**As a** MACF operator, **I want** the gateway to serve the model names the runtime requests (`macf-mid`, `macf-classify`, `macf-smart-or`, `macf-frontier-or`), **so that** no requests fail with "No connected db" / invalid-model errors.
**Acceptance criteria:**
- All four aliases registered in `/v1/models`
- `macf-mid`, `macf-cheap`, `macf-smart`, `macf-classify` all return 200
- Zero `no_db_connection` errors in runtime logs post-fix
**Status:** Done Sep 29. Note: OpenRouter free model `deepseek-chat-v3-0324:free` is no longer free — `macf-mid` now points to local Ollama (budget-first).

## P0 — Revenue sprint (in progress)

### US-5: Generate 40 AI Readiness Audit outreach drafts
**As a** CRO, **I want** 40 personalized touch-1 drafts for the $750 audit offer, **so that** Jesse can approve and send a second batch.
**Acceptance criteria:**
- 40 drafts, each with company name, website, specific automation angle
- Guarantee line present: "If I can't find $750 of value, you don't pay."
- Rule A screened: no bounces, no prior contacts
- DRAFTS ONLY — nothing sent
**Status:** Done Sep 29. Location: `~/workspace/revenue-oct5/play2-audits/touch1-batch2.md` + `touch1-batch2-prospects.csv`.

### US-6: Build Vikunja revenue sprint board
**As a** execPM, **I want** a sprint board with daily targets Oct 1–5 and clear ownership, **so that** the team tracks progress toward $3,000.
**Acceptance criteria:**
- Project "Revenue Sprint — $3K by Oct 5" with tasks for CMO, CRO, CCO, CUXO, CTO, CFO, execPM
- Daily targets and due dates set
- Task #64 (heartbeat lock) untouched
**Status:** Done Sep 29. Project ID 16, 8 tasks (IDs 80–87).

## P1 — Backlog (deferred per Jesse)

### US-7: Desktop subscription LLM tier (Muse → Claude → Gemini → ChatGPT)
**As a** MACF operator, **I want** desktop app subscriptions as a routing tier between local and OpenRouter, **so that** we get frontier quality at subscription flat rates.
**Acceptance criteria:**
- Modular design, graceful fallthrough on lapsed subscriptions
- Priority: Muse → Claude → Gemini → ChatGPT
**Status:** Backlog. Jesse: "keep it in the backlog until we have more budget runway." Claude bridge code exists in `slack-agents/utils/litellm-gateway.js` (`routeViaClaudeSubscription()`).
