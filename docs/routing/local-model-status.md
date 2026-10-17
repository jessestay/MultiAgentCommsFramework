# Local Model Status (Ollama)
**Date:** 2026-09-29
**Host:** DESKTOP-4U63DES (GTX 980, 4GB VRAM)

## Current status: OPERATIONAL

Ollama 0.5.7 with the `cuda_v11_avx` runner serves `qwen2.5:3b-instruct-q4_K_M`
on the GTX 980 with partial GPU offload. Warm inference is 0.6–5s for short
prompts through the LiteLLM gateway.

### What fixed it

Ollama's GPU auto-discovery timed out on the GTX 980 (Maxwell, compute
capability 5.2) — it tried `cuda_v12`, `cuda_v13`, and `vulkan` runners and
all failed, forcing unusable CPU fallback (>120s per request).

The fix: pin the runner explicitly.

- Set environment variable `OLLAMA_LLM_LIBRARY=cuda_v11_avx` (Machine scope
  on Windows, so the Ollama service inherits it), then restart Ollama.
- CUDA 11 is the last toolkit with Maxwell (CC 5.x) support; the v12/v13
  runners cannot initialize this GPU.

### Verified performance (2026-09-29, via LiteLLM gateway :4000)

| Test | Result |
|------|--------|
| `macf-cheap` cold (first request after gateway restart) | 150s — one-time model load into VRAM |
| `macf-cheap` warm (5 consecutive) | 0.6–1.3s, all correct |
| `macf-smart` (strict local-first, 4 consecutive) | 1.1–1.7s, all served by local tier |
| `ollama ps` during load | `qwen2.5:3b-instruct-q4_K_M`, 3.2GB, 39%/61% CPU/GPU |
| Correctness spot-check | 7+8=15, repeated small arithmetic — all correct |

### Impact on the gateway

Local deployments are **active** in `proxies/litellm_config.yaml`:

- `macf-cheap`: local-only ($0 always)
- `macf-smart`: strict local-first via fallbacks
  (`macf-smart` → `macf-smart-free` → `macf-best` → `macf-best-direct`);
  verified 4/4 requests served locally, never shuffled to paid tiers
- `macf-best`: OpenRouter paid → free → direct APIs (local intentionally
  excluded — best-tier work wants frontier models, not the 3B)

### Models available

| Model | Size | Status |
|-------|------|--------|
| `qwen2.5:3b-instruct-q4_K_M` | 1.9GB | **Default local model.** Verified working. |
| `qwen3.5:4b` | 3.4GB | Downloaded, NOT default — not yet tested for latency/stability/quality |
| `llama3.2:3b` | 2.0GB | Fallback candidate, untested |
| `nomic-embed-text` | 274MB | Embeddings only (memory/RAG pipeline) |

### Known limitations

- **Cold start:** first request after Ollama/gateway restart takes ~2.5 min
  while the model loads into VRAM. Warm requests are sub-second to a few
  seconds. The gateway's startup probe should allow for this.
- **Partial offload:** only ~61% of layers fit in the 4GB VRAM; the rest
  runs on CPU. Still fast enough for the cheap/smart tiers.
- **Model quality:** the 3B model is weak at reasoning, math beyond trivial
  arithmetic, and long-context work. It is the $0 tier, not the smart tier —
  the fallback chain exists precisely so harder work escalates.
- **3B knowledge cutoff and tool use:** not yet evaluated for function
  calling; the Slack runtime should prefer `macf-smart-free` or higher
  for tool-heavy persona work until local tool-use is proven.
