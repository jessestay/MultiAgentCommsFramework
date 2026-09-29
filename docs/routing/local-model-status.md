# Local Model Status (Ollama)
**Date:** 2026-09-29
**Host:** DESKTOP-4U63DES (GTX 980, 4GB VRAM)

## Current status: DEGRADED

Ollama's GPU discovery times out on the GTX 980, forcing CPU fallback.
CPU inference on 3B models is too slow (>120s) for gateway use.

### Evidence

- `ollama ps` shows 0 models loaded; generation requests hang.
- Server log: `failure during llama-server GPU discovery`,
  `llama-server GPU discovery watchdog timed out` (tried `cuda_v12`,
  `cuda_v13`, `vulkan` — all timed out).
- `nvidia-smi`: GPU healthy (35C idle, 2.1GB free VRAM, driver 537.58,
  CUDA 12.2). The GPU works; Ollama's bundled llama-server fails to
  initialize it.
- Direct `qwen2.5:3b-instruct-q4_K_M` generation timed out at 60s and 120s.
- `qwen3.5:4b` also timed out on trivial prompts (earlier finding).

### Impact on the gateway

Local deployments are **commented out** in `proxies/litellm_config.yaml`
for `macf-smart` and `macf-best` until this is resolved. `macf-cheap`
remains defined as local-only (for when Ollama is fixed) but will
timeout until then.

The budget-first chain still holds: OpenRouter free-tier models fill the
$0-cost slot while local is degraded.

### Models available (when GPU works)

| Model | Size | Status |
|-------|------|--------|
| `qwen2.5:3b-instruct-q4_K_M` | 1.8GB | Default (pending GPU fix + latency/stability tests) |
| `qwen3.5:4b` | 3.16GB | NOT default — timed out on trivial prompts |
| `llama3.2:3b` | 1.88GB | Fallback candidate |
| `nomic-embed-text` | 0.26GB | Embeddings only |

### Next steps

1. Try `OLLAMA_LLM_LIBRARY` overrides or an older Ollama version with
   better Maxwell (compute 5.2) support.
2. Check for NVIDIA driver updates supporting the GTX 980.
3. Re-enable local deployments in the gateway config once a trivial
   generation completes in <30s consistently.
