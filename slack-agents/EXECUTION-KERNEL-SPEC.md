# Execution Kernel — Specification (Vikunja #771)

Owner directive (Jesse, Oct 14, 2026 ~9:21pm MT): EVERYTHING runs on this. Not a slice. Build it with user stories, acceptance criteria, BDD, and TDD, with automated unit and acceptance testing baked in.

## Scope law

- 100% of engine work paths run through the kernel: every agent, every task type, every project, including standing loops, recurring jobs, the self-healer, and demo production. A coverage inventory (US-1) is the proof; any path not on a workflow is a defect.
- The verifier step is the only code path allowed to mark a task done or post a completion message. No exceptions, no legacy path left alive.
- The Slack directive path is in scope: the poller is a separate process today with a shadow completion state (agent-health / directiveVerify "verified") that sits outside the verifier. That shadow path must be removed or routed through the kernel — nothing outside the verifier marks work complete.
- Evidence of record: the engine's append-only receipts ledger on the persistent workspace is the durable evidence store. Hatchet run IDs are correlation IDs recorded alongside; Hatchet's embedded storage does not survive VM replacement and must never be the only record.

## Method (mandatory)

- **TDD:** for each story, the failing test lands first (visible in git history), then the implementation that makes it pass.
- **BDD:** acceptance criteria below are written as Given/When/Then scenarios and implemented as executable acceptance tests (feature-style, named after the scenarios). Unit tests cover the components: contract parser, postcondition checks, validator, Jesse-gate, healer loop, receipt writer.
- **Baked in:** the acceptance suite runs with the engine's normal test command and in the watchdog checks, so a regression fails loudly instead of silently shipping. A story is not done while any of its tests are red.

## User stories and acceptance criteria

### US-1 — Every task is a workflow
As the CEO, I want every task, whatever its type or owner, to start as a Hatchet workflow, so nothing can stall invisibly in chat.
- Given a task of any type (standard, loop, standing job, healer repair) is created or picked up, when the engine accepts it, then a Hatchet workflow run exists for it and its run ID is recorded on the task.
- Given a task is created or triaged in the live task flow, when it lands on the board, then a contract is stamped on it from its type's template at creation time (not in tests, not by hand). An unstamped task is a defect the coverage inventory reports. (Survey finding: the #724 stamping functions exist but have zero production callers — adoption never landed; that is the gap this scenario closes.)
- Given the coverage inventory is generated, when it is compared against every engine work path (directives, loops, monitors that execute, demos, healer), then every path maps to a workflow and the inventory reports zero bypass paths.

### US-2 — Tools execute only as steps
As the CEO, I want tools to execute only as Hatchet task steps invoked through native strict tool calling, so an agent cannot fake an action with text.
- Given an agent reply contains tool-call markup as text but no recorded step invocations, when the reply is processed, then no state changes, the reply is flagged invalid, and the task remains open.
- Given a tool call whose arguments fail the tool's typed schema, when it is submitted, then it is rejected before execution and the rejection is recorded on the run.

### US-3 — Done is verifier-gated
As Jesse, I want a task to count as done only when code has checked the deliverable against the real world, so "done" always means done.
- Given a workflow reaches its final step, when the verifier runs the contract's postconditions against the real systems (file exists with substantive content, API state, test output), then and only then the task is marked done, the completion message posts (posted by the verifier, not the engine), and the completion is written to the receipts ledger with the Hatchet run ID and the verifier's evidence entries.
- Given a deliberately fake completion (markup reply, no steps, no deliverable), when it is submitted, then the verifier rejects it and the task stays open.
- Given the codebase, when the acceptance suite scans for completion paths, then no code path other than the verifier can write task-done state (the legacy prose completion path is removed or refuses).

### US-4 — Contracts are universal, loops included
As the CEO, I want contracts on every task type, including standing loops, so the Oct 12 #724 system is the only road, not a side road.
- Given a standing loop task with a contract, when its completion condition is met, then the LOOP completion guard evaluates it and the verifier closes it like any other task.
- Given tasks #82 and #122, when they are picked up, then the Jesse-gate no longer misclassifies their wording: their contracts are reachable and they are worked, not pinged. (Regression test on the gate's matching.)

### US-5 — The healer proves its repairs
As the CEO, I want a repair to count only when the original failing check passes again, so "initiated" is never the end of the story.
- Given a planted stale task, when the healer runs, then it repairs the task, re-runs the original staleness check, and reports fixed only after the re-check passes.
- Given a repair attempt that does not actually fix the condition, when the re-check runs, then the issue stays open and the failure is visible (negative test).

### US-6 — Gateway stalls become visible step failures
As the CEO, I want a blinking model connection to surface as a retried, recorded step failure, so agents never die silently mid-task.
- Given the model gateway drops during a step, when the step times out, then the engine retries with backoff and the failure is recorded on the run.
- Given the gateway returns, when the retry fires, then the workflow resumes from the failed step instead of restarting or vanishing.

### US-7 — Human gates are durable waits
As Jesse, I want anything needing my approval to wait properly, so nothing auto-approves or gets lost.
- Given a task reaches a step gated on my approval, when it waits, then it can wait indefinitely at no cost, resumes on my approval, and cancels on my rejection. No timeout ever auto-approves.

### US-8 — Stalls are visible
As the CEO, I want any workflow stuck beyond a threshold to appear on a stall report within one monitor cycle, so silence is impossible.
- Given a workflow blocked on a dependency beyond the threshold, when the monitor runs, then the task appears on the stall report with its blocker named.

### US-9 — Every done task has an auditable receipt chain
As the CEO, I want to pull the receipt chain for any done task, so verification is a query, not an investigation.
- Given any task marked done, when its chain is requested, then it returns the workflow run, the executed steps with their results, and the verifier's postcondition evidence — complete for every sampled task.

## Acceptance for the build as a whole (CEO verifies)

1. The full acceptance suite (US-1..US-9 scenarios) runs green via the engine test command, with the failing-first history visible in git.
2. #758's three-part test passes (it is US-2/US-3 applied to the Lawyer directive path).
3. #734 memo, #735 spec, and #658 product PDFs re-run under the kernel and verified on disk, each with a receipt chain (US-9).
4. The coverage inventory (US-1) reports zero bypass paths.
