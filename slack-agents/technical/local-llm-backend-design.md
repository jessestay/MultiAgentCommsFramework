# Local-model backend design — replacing Dispatch with LiteLLM → Ollama

**Status:** design only (Sep 24, 2026). Implementation waits on the desktop
inventory (which Ollama models are actually installed) and on Beacon being
alive. TDD: tests first, then code.

## Problem

The MACF Slack team currently thinks through Claude Dispatch / the Anthropic
API (`slack-agents/utils/anthropic.js`). When API credits run out — as they
did Sep 20–24, 2026 — the whole team goes dark for days. Jesse wants the team
to keep running on the desktop's own hardware with local models, so an empty
credit balance can never silence the team again.

## What's already there

- `core/ai/interface.js` defines the backend contract:
  `{ chat, generateReport, generateProactivePost }`, selected by
  `AI_BACKEND=anthropic|perplexity`.
- **But the live team doesn't use it.** Every agent in `slack-agents/agents/`
  (cco, cfo, cmo, cro, cto, cuxo, execPM, jobcoach, lawyer) imports
  `slack-agents/utils/anthropic.js` directly.
- Agents only call `chat`, `generateReport`, `generateProactivePost`. None of
  them touch `QUICK_MODEL`/`SMART_MODEL`/`BEST_MODEL` directly. That makes the
  swap a one-file change.

## Design

### 1. New backend: `slack-agents/utils/litellm.js`

Implements the same three functions, talking OpenAI-compatible chat
completions to LiteLLM at `http://127.0.0.1:4000/v1/chat/completions`.
No API key (localhost). Plain `fetch`/`axios` POST — no new SDK needed.

```js
// tier -> LiteLLM model alias (aliases defined in litellm-config.yaml)
const QUICK_MODEL = process.env.LITELLM_QUICK_MODEL || 'quick';
const SMART_MODEL = process.env.LITELLM_SMART_MODEL || 'smart';
const BEST_MODEL  = process.env.LITELLM_BEST_MODEL  || 'best';
```

Tier aliases resolve inside LiteLLM's config, so swapping the actual model
under `quick`/`smart`/`best` is a config edit + LiteLLM restart — no code
change, no redeploy.

Request mapping (Anthropic → OpenAI-compatible):
- `system` → `{ role: 'system', content }` message (LiteLLM handles providers
  that want it separate)
- `messages: [{ role: 'user', content }]` → same shape
- `max_tokens` → `max_tokens`
- response: `choices[0].message.content` (instead of `content[0]. text`)

Error behavior: log + throw, exactly like today. **No automatic cloud
fallback.** A silent fallback to a paid API would spend Jesse's money without
approval — that violates a hard boundary. If we ever want a fallback chain,
it's an explicit, separately-approved decision.

### 2. Thin shim: `slack-agents/utils/anthropic.js` becomes a router

Keep the filename and every export (`chat`, `generateProactivePost`,
`generateReport`, `QUICK_MODEL`, `SMART_MODEL`, `BEST_MODEL`) so zero agent
files change:

```js
const backendName = process.env.AI_BACKEND || 'anthropic';
const backend = backendName === 'litellm'
  ? require('./litellm')
  : require('./anthropic-direct'); // today's code, renamed
module.exports = backend;
```

(Today's implementation moves to `anthropic-direct.js` unchanged.)

Flip the whole team with one env var: `AI_BACKEND=litellm`. Roll back the
same way. Both backends stay tested.

### 3. LiteLLM config (`litellm-config.yaml`, lives on the desktop)

```yaml
model_list:
  - model_name: quick
    litellm_params: { model: ollama/<fast-8b-model>, api_base: http://127.0.0.1:11434 }
  - model_name: smart
    litellm_params: { model: ollama/<capable-model>,   api_base: http://127.0.0.1:11434 }
  - model_name: best
    litellm_params: { model: ollama/<largest-model>,    api_base: http://127.0.0.1:11434 }
general_settings: { master_key: os.environ/LITELLM_MASTER_KEY }  # optional
```

Concrete model IDs come from the desktop inventory (pending) — what Ollama
has pulled, how much RAM/VRAM the box has. Candidates to benchmark once we
can see the machine: a fast ~8B for `quick` (proactive posts, Q&A), a
stronger 14B–32B for `smart` (delegations, analysis), largest available for
`best`.

Why LiteLLM in the middle instead of calling Ollama directly?
- One config file maps tiers → models; model swaps don't touch code.
- If we later approve a deliberate fallback (local → cloud), it's a config
  addition, not a rewrite.
- Uniform OpenAI-compatible surface if we ever point a tier at a different
  local server.
- Cost: one more lightweight process on the desktop (can run as a
  per-user scheduled task / startup entry, same pattern as Beacon).

### 4. Benchmarks before cutover (needs the desktop)

For each candidate model, run the same prompt set through both backends and
compare: response quality (does the persona still sound like itself?),
latency p50/p95, and tokens/sec. `quick` must stay snappy — proactive posts
are the team's heartbeat. Document results in this folder; only then flip
`AI_BACKEND=litellm`.

### 5. Tests (write first — `slack-agents/tests/litellm.test.js`)

- Tier resolution: `'quick'`/`'smart'`/`'best'`/full ID → correct model name
  in the request body.
- Request shape: system prompt becomes a system message; user message passes
  through; `max_tokens` honored.
- Response parsing: extracts `choices[0].message.content`.
- Errors: HTTP 500 / connection refused → logs and throws (no silent
  fallback, no retry storm).
- Router: `AI_BACKEND=litellm` loads the litellm backend; unset/anything
  else loads anthropic-direct; unknown values warn and fall back to
  anthropic-direct.
- Mock the HTTP layer (nock or a stubbed fetch) — no live Ollama needed.

### 6. Rollout

1. Desktop inventory (models, RAM/VRAM) → pick candidate models.
2. Install Ollama models + LiteLLM config on the desktop; start LiteLLM.
3. Benchmarks; record results.
4. `AI_BACKEND=litellm` in the team's env; restart team; watch #marketing
   for normal traffic.
5. Keep `anthropic-direct` working — the env var is the rollback.

## Open questions (for the desktop inventory)

- Which Ollama models are already pulled? How much RAM/VRAM?
- Is Ollama currently running as a service on the desktop?
- Where should LiteLLM's config live, and what starts it at login?
  (Same per-user scheduled-task pattern as Beacon — no admin needed.)
