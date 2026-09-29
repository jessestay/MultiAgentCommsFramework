# Local Inference Setup (Ollama on Windows, GTX 980 / Maxwell GPUs)

Reproducible setup for the MACF $0 local-inference tier. Verified 2026-09-29
on DESKTOP-4U63DES (GTX 980, 4GB VRAM, Windows 11).

## Why this is fiddly

Ollama's GPU auto-discovery does not work on Maxwell-architecture NVIDIA
cards (GTX 9xx series, compute capability 5.x). It tries the `cuda_v12`,
`cuda_v13`, and `vulkan` runners, each times out, and silently falls back
to CPU — which is >120s per request on a 3B model and unusable.

CUDA 11 is the last toolkit that supports Maxwell. Pinning Ollama to its
CUDA 11 runner fixes it.

## Prerequisites

- Windows 10/11 PC with an NVIDIA Maxwell-or-newer GPU (4GB+ VRAM recommended)
- NVIDIA driver installed (537.58 verified; any recent driver works —
  the driver is backward-compatible, the *runner* is what matters)
- Ollama 0.5.7+ installed from https://ollama.com/download

## Steps

1. **Pin the CUDA 11 runner.** Ollama runs as a Windows service, so the
   variable must be Machine-scope (not just your user shell):

   ```powershell
   [System.Environment]::SetEnvironmentVariable('OLLAMA_LLM_LIBRARY','cuda_v11_avx','Machine')
   ```

2. **Restart Ollama** so the service picks it up:

   ```powershell
   Restart-Service Ollama
   ```

   (Or reboot. `ollama ps` should show the model with a GPU split once loaded.)

3. **Pull the default model:**

   ```powershell
   ollama pull qwen2.5:3b-instruct-q4_K_M
   ```

4. **Smoke-test** (expect ~4s warm; first run is slower while the model loads):

   ```powershell
   ollama run qwen2.5:3b-instruct-q4_K_M "What is 2+2? Reply with just the number."
   ```

5. **Point the gateway at it.** In `macf_gateway.env`:

   ```
   OLLAMA_URL=http://localhost:11434
   ```

   The gateway config (`proxies/litellm_config.yaml`) already wires
   `macf-cheap` (local-only) and `macf-smart` (local-first) to this.

## Verifying GPU offload

```powershell
ollama ps
```

Working state looks like:

```
NAME                          SIZE      PROCESSOR          UNTIL
qwen2.5:3b-instruct-q4_K_M     3.2 GB    39%/61% CPU/GPU    4 minutes from now
```

If `PROCESSOR` shows `100% CPU`, the runner pin didn't take — check that
the Machine environment variable is set and Ollama was restarted after.

## For other GPUs

| GPU generation | Runner to try |
|----------------|---------------|
| Maxwell (GTX 9xx, CC 5.x) | `cuda_v11_avx` (verified) |
| Pascal and newer (GTX 10xx+, CC 6.x+) | default auto-discovery (usually works) |

If auto-discovery fails on a non-Maxwell card, try `cuda_v12_avx` before
giving up, and check `nvidia-smi` that the driver sees the card.

## Notes

- The model unloads after 5 minutes idle by default (`ollama ps` UNTIL
  column). First request after unload pays the ~2.5 min cold-start cost.
  For a 24/7 gateway, consider `OLLAMA_KEEP_ALIVE=24h`.
- VRAM headroom matters: the 3B Q4 model uses ~3.2GB resident with partial
  offload on 4GB cards. Don't stack a second large model alongside it.
- `qwen3.5:4b` (3.4GB) is downloaded but unverified — do not promote it
  to default until latency, stability, JSON/tool-use, and quality tests pass.
