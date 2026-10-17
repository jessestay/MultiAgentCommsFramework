# Phase B design notes — directive path onto Hatchet (Vikunja #789)

## The topology constraint that shapes everything

Hatchet in this stack is the **embedded** engine: `HatchetEmbeddedClient.init()`
spawns a sidecar owned by the calling process, with a bundled Postgres on a
sidecar-chosen port and its token delivered through a per-boot handshake file
under `/tmp`. Consequences, verified in the SDK source
(`@hatchet-dev/typescript-sdk` v1 `embedded.js`):

- Only the process that booted the client can dispatch to or work that
  instance. That process is the long-lived engine (`engine/runStandalone.js`).
- The directive poller is a short-lived cron process (fresh node every
  5 minutes). It cannot attach to the engine's instance, and booting its own
  embedded instance would create a second, empty workflow registry —
  split-brain, the exact failure mode the state-dir consolidation removed.

So Phase B does NOT have the poller call Hatchet. It splits the work the way
the stories actually specify:

- **Poller = thin intake.** It scans channels as before, then REGISTERS each
  accepted directive in the durable intake (`engine/directiveIntake.js`) and
  awaits the record's settlement (bounded by the same 300s envelope the
  inline path always had). Finalize — validation, posting, verifier
  queueing, auto-link, retry/dead-letter bookkeeping — is byte-for-byte the
  existing code.
- **Engine = dispatcher + worker.** `runStandalone` registers the
  `directive-work` workflow (worker `directive-worker`) next to `task-work`.
  With `MACF_DIRECTIVE_WORKFLOW=1`, `startDirectiveDispatchLoop` stamps a
  heartbeat into the intake dir every 5s, drains `registered` records into
  Hatchet runs via the SDK v3 starter (`runNoWait`, same as the M2
  dispatcher), records each run in the receipts ledger
  (`external:directive_workflow_run`, artifact = { ref: hatchet run ID,
  channel, directiveTs, checkpointRunId }), and settles each record
  completed/failed with the step's output.

## Checkpoint storage choice

The plan's first choice was the Hatchet embedded Postgres. From the poller
context that database is unreachable in any supported way (see above), and
the fallback inline path runs IN the poller — it needs a store both
processes can use. Chosen: a **file-backed adapter**
(`utils/checkpointAdapters.js`) behind Phase A's exact
`{ get, set, delete, keys }` shape, one JSON file per key under
`<state dir>/checkpoints`, where the state dir is the canonical
`/home/hatch/workspace/macf/slack-agents/.state` resolution already used by
`engine/receipts.js` / `utils/state.js`.

Why this meets the acceptance bar (durability across process restarts + VM
replacement):

- The directory is inside the persistent workspace tree — it survives VM
  replacement (the /home/macf wipes never touched it) and is included in the
  nightly Drive backup.
- Writes are atomic (tmp + rename); a killed writer leaves the old or the
  new record, never a torn one. The store's monotonic stepIndex guard
  covers the two writers of one run (workflow step; inline fallback).
- The pattern is already proven in production by the circuit breaker's
  `.state/circuit-breaker.json`.
- Adapter-shaped: a Postgres adapter can replace it later with zero
  call-site changes, if/when a reachable Postgres exists for both writers.

## Run-ID and context wiring

- Checkpoint run ID = `directive:<channel>:<ts>` — the directive's own
  identity. Hatchet retries, worker replacements, and dead-letter requeues
  all resume the SAME checkpoint. (The Hatchet run ID is a per-attempt
  value and is recorded in the ledger/intake, never used as the
  checkpoint key.)
- Agents were not modified. The step executor (and the inline fallback)
  open an AsyncLocalStorage run context (`engine/runContext.js`);
  `generateWithTools` consults it when its explicit options are absent.
  First caller claims the run ID; a relay sub-delegation from a different
  agent derives `<runId>:<agentId>` so conversations never interleave
  into one checkpoint.

## Fail-closed rules (preserved from M2 + the resilience fix)

- Flag off → the poller behaves exactly as before Phase B (plus
  checkpointing on the inline path).
- Engine heartbeat stale (>90s) at delegation time → inline fallback;
  provably no workflow run can start (the loop that dispatches is the
  heartbeat writer).
- Intake registration throws → inline fallback + a `directive_workflow_fallback`
  engine gap. Nothing was persisted, so nothing can dispatch later.
- Any failure AFTER registration (record settles failed; wait times out)
  → result null → existing retry/dead-letter machinery. The agent is
  never re-executed inline in that case: a workflow step may still be
  running it, and double execution is worse than a retry delay.
- Step input without channel/ts → `{ ran: false }` (mirrors runTaskWork).
- Agent with no handler → the step throws `no handler for agent …`;
  Hatchet retries the step, the run record shows the failure, the intake
  record settles failed (US-B1.3: visible, never silently dropped).
- Engine restart with records stuck in dispatching/dispatched >10 min →
  the loop returns them to `registered` for re-dispatch (resume via the
  shared checkpoint, not a restart).
- Completion is untouched: this phase executes delegations; marking work
  done still belongs to `engine/completion.js` (tasks) and the poller's
  evidence gate + directiveVerify queue (directives).

## Enablement

`MACF_DIRECTIVE_WORKFLOW=1` in the engine/poller environment flips
dispatch on at the next engine boot + poller cycle. Registration itself
is inert with the flag off. Rollback = unset the flag; in-flight intake
records simply stop being consumed and the poller's heartbeat check
routes everything inline again.
