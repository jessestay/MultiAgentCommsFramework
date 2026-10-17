# Phase F design notes — engine-side intake; the poller becomes fallback-only (Vikunja #789)

## What Phase F moves, and what it deliberately does not

Through Phase B the 5-minute cron poller still did three jobs: scan
Slack channels for new directives, drain the retry/dead-letter queues,
and finalize settled workflow runs. Phase F moves all three into the
long-lived engine, driven by a Hatchet cron trigger. The poller does
not disappear — it becomes the fallback that resumes full duty only
when the engine is down, which is what makes the 7-day retirement bar
(below) an observation rather than a leap of faith.

Not moved: directive EXECUTION (Phase B's directive-work workflow),
checkpointing (Phase A), and the finalize rulebook itself — that code
was extracted and shared, not rewritten (see "One finalize path").

## The starvation problem this phase had to solve first

Live observation, Oct 16, 2026: during a gateway empty-streak, poller
cycles spent their whole budget draining retries, and the scan for NEW
directives was starved for multiple cycles — the channel watermark did
not move while fresh directives sat unseen. Any design that kept
scan + drain + finalize in one sequential budget inherits that failure.

The intake cycle (`engine/directiveScan.js` `runIntakeCycle`) makes
starvation impossible by construction:

1. **Scan first.** Every cycle begins by scanning and registering new
   directives. Registration is durable the moment it lands in the
   intake, so no later stage's failure can lose a scanned directive.
2. **Drains second.** Retry-queue and due dead-letter requeue entries
   are registered into the intake (execution stays in the workflow
   path). A registration failure re-queues the entry — never drops it.
3. **Consume last.** Settled records finalize through the shared
   machinery. State is saved after every stage.

Cycles run every minute on the Hatchet cron trigger, each cycle is an
independent workflow run, and a slow finalize in cycle N cannot delay
the scan in cycle N+1 — Hatchet queues it durably.

## The watermark rule (zero-missed by construction)

The scanner (`createDirectiveScanner`) applies the poller's per-message
decisions with one change of sink (register instead of queue), and one
hard rule: **the channel watermark advances to a message only after it
has been durably handled** — registered, dead-lettered, recorded as a
roadblock, or classified non-directive/unroutable. If registration
throws, the scan stops at that message; the watermark stays behind it;
the next cycle retries it. The watermark can never pass an
unregistered directive.

As a second line of defense, each scan audits the fetched window BELOW
the watermark: a routable directive found in none of the handled
ledgers (received list, intake, retry queue, dead-letter list) is
reported to the retirement tracker as a missed directive and logged
loudly. This is US-F1.3's "verified against the poller's own watermark
method" made into a per-cycle check instead of a post-hoc hope.

## One finalize path (extraction, not a fork)

Validation, posting, verifier queueing, health bookkeeping, and the
retry/dead-letter/auto-requeue machinery moved VERBATIM from
`directivePoll.js` into `engine/directiveFinalize.js`, behind the
codebase's own injection pattern (`init({ getAgent, agentIds })`, as in
`utils/delegation.js`). The poller injects its loader and re-exports
every function it used to define, so all existing callers and tests
are untouched. The engine cycle consumes settled intake records via
the new `consumeSettledIntakeRecords`: completed → finalize with the
record's stored result; failed → finalize with null (the shared retry
machinery engages identically); roadblock records → consumed silently,
mirroring the poller's fire-and-forget roadblock branch. A record is
stamped `finalizedAt` only after finalize returns; a throwing finalize
leaves it consumable next cycle. Intake records gained two optional
fields at registration (`kind`, `requeues`) so the engine finalizes
with the same bookkeeping the poller would have used.

Poll state itself is shared through `engine/directiveState.js`:
atomic tmp+rename saves, chmod 0666 — the file has two writers owned
by two OS users (poller as root, engine as macf), and the Phase B
deployment proved a state file one side cannot write wedges silently.
The file carries no secrets (its contents flowed through Slack).

The poller's scan phase inside `main()` is intentionally NOT
refactored onto the new scanner: it is the frozen legacy path the
fallback runs, and its semantics (watermark advances at finalize, not
at scan) are the pre-Phase-F contract its tests encode. The one piece
both scans must never disagree on — the delegation-header parser —
was moved into `directiveScan.js` and is shared (the Oct 15
ASCII-arrow incident was two parsers drifting).

## Fallback-only poller

With `MACF_ENGINE_INTAKE=1`, `directivePoll.main()` decides via
`phaseFFallbackDecision`:

- fresh engine heartbeat → **noop**: log and exit before any work.
- stale heartbeat → **fallback**: record a fallback activation in the
  retirement tracker (it breaks the streak — the bar is about
  trigger-driven traffic, and a fallback day is not that), adopt the
  dead engine's intake records (`adoptOrphanedIntakeRecords`: unsettled
  records older than 10 min are force-settled as failed so the consume
  stage routes them into the retry machinery; fresh ones are left for
  the returning engine, whose dispatch loop has its own stale
  recovery), finalize settled records, then run the full legacy cycle.
  Directives the fallback has to route that were posted >10 min before
  the cycle are recorded as missed — the engine scan should have had
  them within a minute.
- flag off → **legacy**: byte-for-byte Phase B behavior.

## Retirement tracking (the 7-day bar, made observable)

`engine/directiveRetirement.js` keeps a per-day (America/Denver)
record at `.state/directive-retirement.json`: scan cycles,
engine-finalized count, fallback activations, missed directives. A
day is clean only if finalized at rollover with scanCycles > 0 (the
engine was actually on duty — silence is not cleanliness), zero
fallback activations, zero missed directives. A day with no record
breaks the streak. `status()` reports the consecutive-clean-day
streak and `retired = streak >= 7`. **The 7 days cannot elapse inside
this build** — what ships is the machinery and the accounting;
deployment starts the clock.

## Gating and rollback

Everything new is behind `MACF_ENGINE_INTAKE=1` (checked in
runStandalone via `engineIntakeEnabled`), and the engine intake only
starts when the Phase B workflow path is also on — its registrations
are meaningless without the dispatch loop draining the same intake.
Rollback is unsetting the flag: the scan workflow stops being
triggered (the cron trigger remains registered but unstarted — see
open items), the poller's next cycle finds the flag off and resumes
its Phase B role.

## US-F2 (durable waits) — deliberately out of this build

The stories place US-F2 (durable approval waits) in Phase F, but the
phase brief scoped this build to the poller's remaining jobs, and
US-F2's waits live on the task-work path (kernel US-7 territory), not
the directive path. Nothing here builds approval waits; see the
report's unsatisfiable list. The suites are therefore named for what
they cover (f1 scan, f2 finalize, f3 fallback, f4 retirement,
f5 triggers) rather than the stories doc's f1/f2 filenames.

## Open items / honest edges

- The directive-scan cron trigger is ensured at engine boot; if the
  flag is later unset, the trigger still exists server-side but no
  worker is registered for `directive-scan` (registration happens
  only under the flag), so fired runs fail visibly rather than doing
  poller work — acceptable, and deleting the trigger on flag-off is a
  deployment-time cleanup, noted here.
- The engine scanner gates routability on DELEGATION_TARGETS ∩ the
  known agent-ID list; it cannot check `handleDelegation` existence
  without loading agents. A directive for a handler-less agent
  registers and then fails VISIBLY in the workflow step (US-B1.3) —
  the Phase B sanctioned behavior — instead of being skipped at scan.
- Cross-process finalize double-run is prevented structurally
  (fallback acts only on a stale heartbeat, i.e. when the engine's
  loops are dead) plus the `finalizedAt` stamp; two consumers racing
  the same record within one process are serialized by the cycle's
  serial consume loop.
- One test-fixture correction during the build: an f2 fixture reply
  was rejected by the shared garble gate (truncated-sentence rule) —
  the fixture was made a realistic full reply; no production behavior
  changed. It is evidence the shared gate really is the poller's gate.
