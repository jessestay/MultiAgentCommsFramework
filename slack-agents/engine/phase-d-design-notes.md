# Phase D design notes — prompt caching, measured (#789)


<!-- US-D2 live cache measurement 2026-10-16T15:03:17.304Z -->
## US-D2 live cache measurement — 2026-10-16T15:03:17.304Z

```json
{
  "experiment": "US-D2 live cache measurement",
  "at": "2026-10-16T15:03:17.304Z",
  "gatewayConfigured": false,
  "runs": [
    {
      "chain": "gateway",
      "mode": "full",
      "sessionId": "macf:ceo:seed:11cb4905719c01e8",
      "prefixHash": "5a1e2b219fe6d78b921fee1cb1dd5e93482c371686c0eb402aef642d0d2f7270",
      "prefixApproxTokens": 4379,
      "systemPromptChars": 15335,
      "turns": [
        {
          "turn": 0,
          "ok": false,
          "ms": 1,
          "error": "litellm not configured"
        }
      ],
      "stats": {
        "perTurn": [],
        "totalPromptTokens": 0,
        "totalCachedTokens": 0,
        "totalShare": 0,
        "turnCount": 0
      },
      "bar": {
        "meetsBar": false,
        "cachedPositive": false,
        "turn3Share": null,
        "minShare": 0.5,
        "reason": "no cached tokens reported on any repeat turn"
      },
      "assessment": {
        "flags": [],
        "defect": false
      },
      "fallback": {
        "mode": "full",
        "changed": false,
        "measuredShare": 0,
        "reason": "insufficient measurement: no repeat turns yet — a fallback decision needs at least one repeat call"
      }
    },
    {
      "chain": "direct",
      "mode": "full",
      "sessionId": "macf:ceo:seed:27bccb6ff2221e4a",
      "prefixHash": "5a1e2b219fe6d78b921fee1cb1dd5e93482c371686c0eb402aef642d0d2f7270",
      "prefixApproxTokens": 4379,
      "systemPromptChars": 15335,
      "turns": [
        {
          "turn": 0,
          "ok": false,
          "ms": 0,
          "error": "litellm: desktop gateway unreachable and no OPENROUTER_API_KEY on VM — cannot fail over (copy the funded key from the desktop gateway env to the VM)"
        }
      ],
      "stats": {
        "perTurn": [],
        "totalPromptTokens": 0,
        "totalCachedTokens": 0,
        "totalShare": 0,
        "turnCount": 0
      },
      "bar": {
        "meetsBar": false,
        "cachedPositive": false,
        "turn3Share": null,
        "minShare": 0.5,
        "reason": "no cached tokens reported on any repeat turn"
      },
      "assessment": {
        "flags": [],
        "defect": false
      },
      "fallback": {
        "mode": "full",
        "changed": false,
        "measuredShare": 0,
        "reason": "insufficient measurement: no repeat turns yet — a fallback decision needs at least one repeat call"
      }
    }
  ],
  "conclusion": "NO cached tokens observed on any run/chain — caching is not being honored as wired; see per-run records and the design note analysis."
}
```

<!-- US-D2 live cache measurement 2026-10-16T15:03:44.595Z -->
## US-D2 live cache measurement — 2026-10-16T15:03:44.595Z

```json
{
  "experiment": "US-D2 live cache measurement",
  "at": "2026-10-16T15:03:44.595Z",
  "gatewayConfigured": true,
  "runs": [
    {
      "chain": "gateway",
      "mode": "full",
      "sessionId": "macf:ceo:seed:11cb4905719c01e8",
      "prefixHash": "5a1e2b219fe6d78b921fee1cb1dd5e93482c371686c0eb402aef642d0d2f7270",
      "prefixApproxTokens": 4379,
      "systemPromptChars": 15335,
      "turns": [
        {
          "turn": 0,
          "ok": true,
          "ms": 3481,
          "answeredBy": "liquid/lfm-2.5-2.6b:free",
          "usageReported": true,
          "promptTokens": 4131,
          "completionTokens": 164,
          "cachedTokens": 0,
          "cacheCreationTokens": 0,
          "textPreview": "The only path allowed to mark a task done is the verifier step, which is the sole code path permitte"
        },
        {
          "turn": 1,
          "ok": true,
          "ms": 3174,
          "answeredBy": "macf-smart-paid",
          "usageReported": true,
          "promptTokens": 4347,
          "completionTokens": 81,
          "cachedTokens": 3651,
          "cacheCreationTokens": 0,
          "textPreview": "One acceptance criterion is that when a task of any type (standard, loop, standing job, healer repai"
        },
        {
          "turn": 2,
          "ok": true,
          "ms": 2753,
          "answeredBy": "macf-smart-paid",
          "usageReported": true,
          "promptTokens": 4425,
          "completionTokens": 19,
          "cachedTokens": 3672,
          "cacheCreationTokens": 0,
          "textPreview": "No state changes occur, the reply is flagged invalid, and the task remains open."
        },
        {
          "turn": 3,
          "ok": true,
          "ms": 3147,
          "answeredBy": "macf-smart-paid",
          "usageReported": true,
          "promptTokens": 4469,
          "completionTokens": 47,
          "cachedTokens": 0,
          "cacheCreationTokens": 0,
          "textPreview": "The evidence of record is the engine's append-only receipts ledger on the persistent workspace, and "
        }
      ],
      "stats": {
        "perTurn": [
          {
            "promptTokens": 4131,
            "cachedTokens": 0,
            "share": 0
          },
          {
            "promptTokens": 4347,
            "cachedTokens": 3651,
            "share": 0.8398895790200138
          },
          {
            "promptTokens": 4425,
            "cachedTokens": 3672,
            "share": 0.8298305084745763
          },
          {
            "promptTokens": 4469,
            "cachedTokens": 0,
            "share": 0
          }
        ],
        "totalPromptTokens": 17372,
        "totalCachedTokens": 7323,
        "totalShare": 0.42154040985493896,
        "turnCount": 4
      },
      "bar": {
        "meetsBar": true,
        "cachedPositive": true,
        "turn3Share": 0.8298305084745763,
        "minShare": 0.5,
        "reason": "bar met: cached tokens on repeat turns and turn-3 cache-read share 83.0% >= 50%"
      },
      "assessment": {
        "flags": [
          {
            "type": "ZERO_CACHE_ON_REPEAT",
            "turn": 3
          }
        ],
        "defect": true
      },
      "fallback": {
        "mode": "full",
        "changed": false,
        "measuredShare": 0.8298305084745763,
        "reason": "full breakpoints honored — bar met: cached tokens on repeat turns and turn-3 cache-read share 83.0% >= 50%"
      }
    }
  ],
  "conclusion": "CEO bar MET on at least one measured run (see runs[])."
}
```

<!-- US-D2 live cache measurement 2026-10-16T15:07:43.216Z -->
## US-D2 live cache measurement — 2026-10-16T15:07:43.216Z

```json
{
  "experiment": "US-D2 live cache measurement (single run)",
  "at": "2026-10-16T15:07:43.216Z",
  "gatewayConfigured": true,
  "runs": [
    {
      "chain": "direct",
      "mode": "full",
      "sessionId": "macf:ceo:seed:27bccb6ff2221e4a",
      "prefixHash": "5a1e2b219fe6d78b921fee1cb1dd5e93482c371686c0eb402aef642d0d2f7270",
      "prefixApproxTokens": 4379,
      "systemPromptChars": 15335,
      "turns": [
        {
          "turn": 0,
          "ok": true,
          "ms": 2798,
          "answeredBy": "liquid/lfm-2.5-2.6b:free",
          "usageReported": true,
          "promptTokens": 3512,
          "completionTokens": 228,
          "cachedTokens": 0,
          "cacheCreationTokens": 0,
          "textPreview": "The only path allowed to mark a task done is when the verifier runs the contract's postconditions ag"
        },
        {
          "turn": 1,
          "ok": true,
          "ms": 2025,
          "answeredBy": "liquid/lfm-2.5-2.6b:free",
          "usageReported": true,
          "promptTokens": 3572,
          "completionTokens": 284,
          "cachedTokens": 3504,
          "cacheCreationTokens": 0,
          "textPreview": "One acceptance criterion for \"Every task is a workflow\" is that given a task of any type is created "
        },
        {
          "turn": 2,
          "ok": true,
          "ms": 58483,
          "answeredBy": "nvidia/nemotron-3.5-lightning:free",
          "usageReported": true,
          "promptTokens": 3669,
          "completionTokens": 235,
          "cachedTokens": 0,
          "cacheCreationTokens": 0,
          "textPreview": "The reply is flagged invalid, no state changes occur, and the task remains open."
        },
        {
          "turn": 3,
          "ok": true,
          "ms": 150787,
          "answeredBy": "nvidia/nemotron-3.5-lightning:free",
          "usageReported": true,
          "promptTokens": 3722,
          "completionTokens": 290,
          "cachedTokens": 0,
          "cacheCreationTokens": 0,
          "textPreview": "The engine's append-only receipts ledger on the persistent workspace is the durable evidence of reco"
        }
      ],
      "stats": {
        "perTurn": [
          {
            "promptTokens": 3512,
            "cachedTokens": 0,
            "share": 0
          },
          {
            "promptTokens": 3572,
            "cachedTokens": 3504,
            "share": 0.9809630459126539
          },
          {
            "promptTokens": 3669,
            "cachedTokens": 0,
            "share": 0
          },
          {
            "promptTokens": 3722,
            "cachedTokens": 0,
            "share": 0
          }
        ],
        "totalPromptTokens": 14475,
        "totalCachedTokens": 3504,
        "totalShare": 0.24207253886010363,
        "turnCount": 4
      },
      "bar": {
        "meetsBar": false,
        "cachedPositive": true,
        "turn3Share": 0,
        "minShare": 0.5,
        "reason": "turn-3 cache-read share 0.0% is below the 50% bar"
      },
      "assessment": {
        "flags": [
          {
            "type": "ZERO_CACHE_ON_REPEAT",
            "turn": 2
          },
          {
            "type": "ZERO_CACHE_ON_REPEAT",
            "turn": 3
          }
        ],
        "defect": true
      },
      "fallback": {
        "mode": "system-only",
        "changed": true,
        "measuredShare": 0,
        "reason": "cache-read share below the bar with full breakpoints (turn-3 cache-read share 0.0% is below the 50% bar); falling back to system-only breakpoints and re-measuring"
      }
    }
  ]
}
```

<!-- US-D2 live cache measurement 2026-10-16T15:08:01.062Z -->
## US-D2 live cache measurement — 2026-10-16T15:08:01.062Z

```json
{
  "experiment": "US-D2 live cache measurement (single run)",
  "at": "2026-10-16T15:08:01.062Z",
  "gatewayConfigured": true,
  "runs": [
    {
      "chain": "gateway",
      "mode": "full",
      "sessionId": "macf:ceo:seed:11cb4905719c01e8",
      "prefixHash": "5a1e2b219fe6d78b921fee1cb1dd5e93482c371686c0eb402aef642d0d2f7270",
      "prefixApproxTokens": 4379,
      "systemPromptChars": 15335,
      "turns": [
        {
          "turn": 0,
          "ok": true,
          "ms": 2512,
          "answeredBy": "macf-smart-paid",
          "usageReported": true,
          "promptTokens": 4291,
          "completionTokens": 47,
          "cachedTokens": 3647,
          "cacheCreationTokens": 0,
          "textPreview": "The verifier step is the only code path allowed to mark a task done or post a completion message."
        },
        {
          "turn": 1,
          "ok": true,
          "ms": 2455,
          "answeredBy": "macf-smart-paid",
          "usageReported": true,
          "promptTokens": 4334,
          "completionTokens": 46,
          "cachedTokens": 3770,
          "cacheCreationTokens": 0,
          "textPreview": "One criterion is that when a task of any type is created or picked up, a Hatchet workflow run exists"
        },
        {
          "turn": 2,
          "ok": true,
          "ms": 4910,
          "answeredBy": "macf-smart-paid",
          "usageReported": true,
          "promptTokens": 4397,
          "completionTokens": 19,
          "cachedTokens": 3957,
          "cacheCreationTokens": 0,
          "textPreview": "No state changes occur, the reply is flagged invalid, and the task remains open."
        },
        {
          "turn": 3,
          "ok": true,
          "ms": 2588,
          "answeredBy": "macf-smart-paid",
          "usageReported": true,
          "promptTokens": 4441,
          "completionTokens": 40,
          "cachedTokens": 3908,
          "cacheCreationTokens": 0,
          "textPreview": "The engine's append-only receipts ledger on the persistent workspace is the durable evidence of reco"
        }
      ],
      "stats": {
        "perTurn": [
          {
            "promptTokens": 4291,
            "cachedTokens": 3647,
            "share": 0.8499184339314845
          },
          {
            "promptTokens": 4334,
            "cachedTokens": 3770,
            "share": 0.8698661744347024
          },
          {
            "promptTokens": 4397,
            "cachedTokens": 3957,
            "share": 0.8999317716624972
          },
          {
            "promptTokens": 4441,
            "cachedTokens": 3908,
            "share": 0.8799819860391803
          }
        ],
        "totalPromptTokens": 17463,
        "totalCachedTokens": 15282,
        "totalShare": 0.8751073698677203,
        "turnCount": 4
      },
      "bar": {
        "meetsBar": true,
        "cachedPositive": true,
        "turn3Share": 0.8999317716624972,
        "minShare": 0.5,
        "reason": "bar met: cached tokens on repeat turns and turn-3 cache-read share 90.0% >= 50%"
      },
      "assessment": {
        "flags": [],
        "defect": false
      },
      "fallback": {
        "mode": "full",
        "changed": false,
        "measuredShare": 0.8999317716624972,
        "reason": "full breakpoints honored — bar met: cached tokens on repeat turns and turn-3 cache-read share 90.0% >= 50%"
      }
    }
  ]
}
```

<!-- US-D2 live cache measurement 2026-10-16T15:08:27.509Z -->
## US-D2 live cache measurement — 2026-10-16T15:08:27.509Z

```json
{
  "experiment": "US-D2 live cache measurement",
  "at": "2026-10-16T15:08:27.509Z",
  "gatewayConfigured": true,
  "runs": [
    {
      "chain": "gateway",
      "mode": "full",
      "sessionId": "macf:ceo:seed:11cb4905719c01e8",
      "prefixHash": "5a1e2b219fe6d78b921fee1cb1dd5e93482c371686c0eb402aef642d0d2f7270",
      "prefixApproxTokens": 4379,
      "systemPromptChars": 15335,
      "turns": [
        {
          "turn": 0,
          "ok": false,
          "ms": 9,
          "error": "Cannot use import statement outside a module"
        }
      ],
      "stats": {
        "perTurn": [],
        "totalPromptTokens": 0,
        "totalCachedTokens": 0,
        "totalShare": 0,
        "turnCount": 0
      },
      "bar": {
        "meetsBar": false,
        "cachedPositive": false,
        "turn3Share": null,
        "minShare": 0.5,
        "reason": "no cached tokens reported on any repeat turn"
      },
      "assessment": {
        "flags": [],
        "defect": false
      },
      "fallback": {
        "mode": "full",
        "changed": false,
        "measuredShare": 0,
        "reason": "insufficient measurement: no repeat turns yet — a fallback decision needs at least one repeat call"
      }
    },
    {
      "chain": "direct",
      "mode": "full",
      "sessionId": "macf:ceo:seed:27bccb6ff2221e4a",
      "prefixHash": "5a1e2b219fe6d78b921fee1cb1dd5e93482c371686c0eb402aef642d0d2f7270",
      "prefixApproxTokens": 4379,
      "systemPromptChars": 15335,
      "turns": [
        {
          "turn": 0,
          "ok": true,
          "ms": 2011,
          "answeredBy": "liquid/lfm-2.5-2.6b:free",
          "usageReported": true,
          "promptTokens": 3512,
          "completionTokens": 139,
          "cachedTokens": 0,
          "cacheCreationTokens": 0,
          "textPreview": "The verifier step is the only code path allowed to mark a task done."
        },
        {
          "turn": 1,
          "ok": true,
          "ms": 2580,
          "answeredBy": "liquid/lfm-2.5-2.6b:free",
          "usageReported": true,
          "promptTokens": 3555,
          "completionTokens": 384,
          "cachedTokens": 3504,
          "cacheCreationTokens": 0,
          "textPreview": "One acceptance criterion for \"Every task is a workflow\" is that given a task is created or triaged i"
        },
        {
          "turn": 2,
          "ok": true,
          "ms": 1150,
          "answeredBy": "liquid/lfm-2.5-2.6b:free",
          "usageReported": true,
          "promptTokens": 3629,
          "completionTokens": 123,
          "cachedTokens": 3552,
          "cacheCreationTokens": 0,
          "textPreview": "No state changes occur, the reply is flagged invalid, and the task remains open."
        },
        {
          "turn": 3,
          "ok": true,
          "ms": 2006,
          "answeredBy": "liquid/lfm-2.5-2.6b:free",
          "usageReported": true,
          "promptTokens": 3679,
          "completionTokens": 149,
          "cachedTokens": 3616,
          "cacheCreationTokens": 0,
          "textPreview": "The evidence of record is the engine's append-only receipts ledger on the persistent workspace, and "
        }
      ],
      "stats": {
        "perTurn": [
          {
            "promptTokens": 3512,
            "cachedTokens": 0,
            "share": 0
          },
          {
            "promptTokens": 3555,
            "cachedTokens": 3504,
            "share": 0.9856540084388186
          },
          {
            "promptTokens": 3629,
            "cachedTokens": 3552,
            "share": 0.9787820336180766
          },
          {
            "promptTokens": 3679,
            "cachedTokens": 3616,
            "share": 0.9828757814623539
          }
        ],
        "totalPromptTokens": 14375,
        "totalCachedTokens": 10672,
        "totalShare": 0.7424,
        "turnCount": 4
      },
      "bar": {
        "meetsBar": true,
        "cachedPositive": true,
        "turn3Share": 0.9787820336180766,
        "minShare": 0.5,
        "reason": "bar met: cached tokens on repeat turns and turn-3 cache-read share 97.9% >= 50%"
      },
      "assessment": {
        "flags": [],
        "defect": false
      },
      "fallback": {
        "mode": "full",
        "changed": false,
        "measuredShare": 0.9787820336180766,
        "reason": "full breakpoints honored — bar met: cached tokens on repeat turns and turn-3 cache-read share 97.9% >= 50%"
      }
    }
  ],
  "conclusion": "CEO bar MET on at least one measured run (see runs[])."
}
```

## Analysis — Phase D measurement findings (Oct 16, 2026, CEO build session)

**What was measured.** Scripted 4-turn conversations through the production
request path, one stable session per run, cache mode 'full' (breakpoints on
system + last tool + conversation head, ephemeral, ttl '1h'), prefix =
execution-kernel spec as system prompt + the real native tool definitions
(~4,400 approximate prefix tokens; real prompt totals 3,512–4,469 depending
on route tokenizer). Short one-sentence follow-ups keep the dynamic tail
small, matching the delegation shape. Bar (CEO-pinned): cached_tokens > 0
on repeat turns AND cache-read share >= 50% of input tokens by turn 3
(index 2). (The 15:03:17Z record above predates the dotenv-path bootstrap
fix and contains no usage — kept for audit completeness.)

**Results.**
| Run | Route / mode | Per-turn cached (of prompt) | Turn-3 share | Bar |
|---|---|---|---|---|
| 15:03:44Z standalone | gateway / full | 0 (4,131) · 3,651 (4,347) · 3,672 (4,425) · 0 (4,469) | 83.0% | MET |
| 15:08:01Z standalone | gateway / full | 3,647 (4,291) · 3,770 (4,334) · 3,957 (4,397) · 3,908 (4,441) | 90.0% | MET |
| 15:07:43Z standalone | direct / full | 0 (3,512) · 3,504 (3,572) · 0 (3,669) · 0 (3,722) | 0.0% | not met |
| 15:08:27Z jest live test | direct / full | 0 (3,512) · 3,504 (3,555) · 3,552 (3,629) · 3,616 (3,679) | 97.9% | MET |

**Findings.**
1. **The gateway route honors prompt caching as wired.** Two independent
   standalone runs met the CEO bar with turn-3 shares of 83.0% and 90.0%.
   Cached counts arrived in the provider usage as
   `prompt_tokens_details.cached_tokens` and flowed through the production
   `normalizeUsage` path — the numbers above are the engine's own usage
   records, not a side channel. The plan's flagged OpenRouter discrepancy
   (non-system breakpoints possibly not honored) did NOT materialize as a
   zero-honor route here. Caveat: provider usage cannot attribute hits
   per breakpoint, so the records prove the stable prefix is served from
   cache in aggregate, not which marker earned it.
2. **Cache persists across processes.** The repeat gateway run's FIRST
   turn already read 3,647 cached tokens (85.0%) ~4 minutes after the
   first run, under the same session/prefix — the cache outlives the
   calling process. Every marker requests the 1-hour TTL tier
   (ttl '1h'); these gaps cannot distinguish an honored 1h TTL from
   Anthropic's 5-minute default, so the honored TTL duration is recorded
   as UNVERIFIED beyond ~5 minutes.
3. **Intermittency exists and is now flagged mechanically.** Run 1,
   turn 4 (index 3) reported 0 cached after two hits; assessCacheTurns
   flagged it ZERO_CACHE_ON_REPEAT instead of letting it pass silently
   (US-D2.3 working on live data). One occurrence in 8 gateway turns;
   plausible causes are provider-instance rotation (session stickiness
   through the gateway is best-effort) or eviction.
4. **The direct chain caches only while one provider serves the
   conversation.** Staying on liquid/lfm it met the bar at ~98% shares;
   when the failover chain rotated to nvidia/nemotron mid-conversation,
   cached dropped to 0 and stayed there (nemotron reported no cached
   tokens at all). The direct path is a failover, not a cache path —
   expected, and the recorded fallback decision for that run
   (system-only, changed=true) is the US-D2.2 machinery firing correctly
   on real data.
5. **Jest caveat.** Under jest, the gateway chain cannot load
   (https-proxy-agent ESM parse — the pre-existing artifact from A5.3);
   the jest live run therefore measured through the direct chain after
   the gateway attempt errored. Gateway evidence comes from the
   standalone runner, per the established pattern.

**Configuration outcome.** Production default stays cache mode 'full'
(bar met on the primary route, twice). `MACF_CACHE_MODE=system-only`
remains the recorded fallback if a future measurement window regresses;
`MACF_PROMPT_CACHE=off` is the kill switch. Re-measurement tool:
`node engine/measure-prompt-cache.js` (records here automatically).
