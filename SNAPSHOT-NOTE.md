# MACF live-line snapshot — October 16, 2026

This branch (`facebook-expert-kernel`) is a full-source snapshot of the MACF working repo as it runs live on the CEO VM, taken Oct 16, 2026. It exists because the repo has two lines:

- `facebook-expert` on GitHub: the Oct 12 line (ticket #724 code-enforced tool use), last pushed Oct 12, 2026.
- This snapshot: the live VM line — execution kernel M1-M5 (#771), the Oct 15 resilience fix, the Oct 16 app-level circuit breaker (#789 Phase C), the HOME-relocation + nightly Drive backup infra package, and the M2 Hatchet supervised-dispatch work — 128 commits past the shared ancestor.

Local HEAD at snapshot time: 3e6b7c4289a5e5064697f0d6d749902555571a84

## What is included

Every tracked source file at HEAD: engine, agents, utils, tests (including the #789 Phase A durable-architecture test contracts), the execution-kernel spec, tooling, docs, and package-locks.

## What is excluded, and why

- `node_modules/` — vendored dependencies. Already covered by `.gitignore`; reproducible with `npm ci` from the committed `package-lock.json` files. (They remain tracked in the local repo history.)
- Runtime state, logs, databases, the relocated engine home, `.env` files and backups, token files — excluded per `.gitignore`; they never belong in git.

## Local commit list (newest first)

```
3e6b7c4 Deps: axios + package lock updates (tracked node_modules kept in sync)
8ebf662 Team tooling catch-up (Oct 16): watchdog hardening, nightly Drive backup, directive-watch, dm-concierge, calendar-sync, desktop MCP server, vikunja unit, grants durable paths
2f88dc2 Engine source catch-up (Oct 16): M2 dispatcher v3 (runNoWait), HOME-relocation state paths, canary/token-health/mcp modules, gates, Phase A durable test contracts, EXECUTION-KERNEL-SPEC
a9010ad gitignore: MACF runtime state, engine-home, env backups, token files (Oct 16)
3d554e9 Phase C: app-level circuit breaker for LLM routes (#789)
eb9fc58 Resilience: a failed LLM step no longer kills the delegation (Jesse's order, Oct 15)
2efbb5c M2: directive-path attribution - all agents pass agentId into generateWithTools from handleDelegation
fe68195 Kernel M1.3 (#771/#758): accept ASCII arrow in delegation headers + loud near-miss logging
3a6f482 Kernel M1.2 (#771/#758): detector covers the short-name leak dialect from the live v2 run
717efae Kernel M2b (#771): task-work Hatchet workflow — every task a tracked run
0fbb666 Kernel M2a (#771): native strict tool calling on the OpenAI-format route
d64722d Kernel M1.1 (#771/#758): sub-result bare taskId is not verifiable evidence + gate-basis logging
b156fcd Kernel M3c/d (#771): creation-time contract stamping + auditable completion IDs
fa38371 Kernel M3b (#771): LOOP completion guard restored in the verifier
e9580db Kernel M3a (#771): Jesse-gate narrowed to an enumerated allowlist (shared predicate)
0627a03 Kernel M5 (#771): execution timeout — a hung task execution becomes a failed attempt
b177224 Kernel M4 (#771): self-healer verify loop — repairs close only on a passed re-check
68ac372 Kernel M1 (#771/#758): close the three markup/evidence holes + verify loophole
0fe62ff Kernel M1 (#771/#758) TDD: failing-first acceptance tests
c225791 Test isolation fix (#724): agentTools.test.js predates receipts and appended test receipts to the production ledger as root, leaving it root-owned — the macf engine's receipt appends failed EACCES silently and acceptance task #725 verification observed 0 receipts despite the artifact being written. Suite now isolates MACF_STATE_DIR/MACF_RECEIPTS_FILE; production ledger chowned back to macf.
863ab01 Acceptance fix (#724): contract lane in the cycle picker — prefer the stalest eligible CONTRACTED task over the uncontracted legacy backlog (which fail-closes one task per cycle and, re-entering on cooldown still sorted stalest-first, would starve contracted work indefinitely). Fallback preserves fail-closed pressure/backoff when no contracted work is eligible. Found by the Phase 3 acceptance test: contracted task #725 was invisible (priority-desc page-1 fetch) then starved. Suite: 724 pass / 12 pre-existing failures.
7bfd49b Docs (#724): plain-English guide to code-enforced tool use, with flow charts
2d190c0 Phase 3 (#724): deterministic executors (url-sweep, file-report, ticket-filer, slack-poster) with the single typed generate seam, dispatched from workTask by contract.executor; receipt-based demo qualification (demoForTask + formatRelayLine, every [RELAY-DEMO] traceable to a receipt ID) replacing qualifiesAsDemo + validateDemoFormat; legacy prose path DELETED — uncontracted tasks fail closed, TASK-DONE/sanitizers/hasEvidence gone; auditor summarize defaults to the receipts ledger. Removed per retire table: demoRelay.test.js, demoStandard.test.js, workEngine-evidence-gate.test.js (replaced by receipt/verification pins). Full suite: 722 pass / 12 pre-existing failures, zero regressions.
c4564fe Phase 2 (#724): task contracts (MACF-CONTRACT blocks + templates), postcondition checker registry, lifecycle state machine in workTask, typed deliverables (deliverableSchemas + outputSchema in generateWithTools + generateStructured seam); vikunja.completeTask now has exactly one home (engine/completion.js: completeVerifiedTask + completeLegacyTask); utils/tasks completeTask wrapper removed; auditor prose detectors DELETED per retire table (narration, tool-call-as-text, task-implies-tools, MISSED_OPPORTUNITY/TOOL_CALL_AS_TEXT/NO_TOOLS_PATH). Full suite: 733 pass / 12 pre-existing failures, zero regressions. Triage report: 50 open tasks, 0 contracted (adoption follow-on).
2de9c3b Phase 1 (#724): receipts ledger at executeTool choke point + args-schema validation with structured corrections; native tool calling in generateWithTools (gateway + Anthropic SDK) with flagged text-emulation fallback; role-played tool-call text rejected as invalid_deliverable; auditor summarize reads receipts behind MACF_AUDIT_SOURCE; BDD stories US-101..US-109. Full suite: 694 pass / 12 pre-existing failures (baseline 667/15; MCP suites green after reinstall).
d850483 Tool Usage Auditor (#722): real-time detection + auto-fix of missed/failed tool use
3177081 Fix delivery pipeline root causes: evidence gate, tool wiring, relay filter, state perms
48d5a9e VM-direct OpenRouter failover: tame reasoning models + gateway preflight (Oct 12, 2026)
a72b700 Tiered model audit fixes (Oct 11, 2026): VM-level tier fallback loop in litellm.js honoring models.yaml chain + settings (empty_response_retries, model_timeout_ms, log_routing); fixed dead qwen-3-4b:free slug, added lfm-2.5 free fallback; gateway: Haiku 4.5->5.5 (10x cheaper), timeout:30 on ollama + timeout:60 on openrouter deployments; fixed 3 stale modelRouter tests; MODELS.md cost reality check. Paid path verified live end-to-end.
6c7cb7b team-monitor: derive owners from Vikunja assignees API, not title prefixes (root-cause fix; same bug class as self-healer Oct 5)
9c0b9c7 Fix triage handoff gap: dispatch Slack directive on every assignment; route normal tickets to execPM per policy
7ef563c Fix demo relay: catch [DEMO] autonomous posts, read local artifacts, relay content to Jesse
cc31525 Fix: add runAutonomous() to 6 agents missing hourly demo driver (cto, lawyer, jobcoach, cco, cuxo, hr); autonomousRunner now covers all 11 agents
7d8c0b3 Fix Buffer token endpoint: use discovery token_endpoint https://auth.buffer.com/token (was /oauth2/token + login.buffer.com, both wrong; buffer expired ~16h)
38c8515 MACF Scrum: hourly standups, 12h sprints, release planning, user stories with BDD/TDD
91c0969 Fix demo-silence root cause: schedule autonomousRunner hourly, add execPM.runAutonomous, route smart tier via gateway paid aliases
82522de Wire up paid models: DeepSeek V4 Flash primary, Haiku 5.5 fallback
70d0a05 Add MODELS.md: plain-English guide to switching AI models
31be4f4 Model selection via config file (BDD/TDD)
b4ef6bf Tighten demo relay: reject acknowledgments, require substantive demos
9766a5c Harden generateWithTools for production use
8a1c4be Fix generateWithTools for free-tier models
253692e Roll out tool execution to all 11 agents
2c490ce Add product architecture: three-layer model with scaling diagrams and BDD/TDD contract
0a69080 Give agents tool execution: fix 'no tool execution' root cause
907626d Wire demo relay into hourly sprint demo check
c77cc7d Add demo relay: pass qualifying Slack demos to Jesse
8644b66 Apply garbled output rejection to work-engine path
a6d4e96 sprintDemo: re-apply Oct 6 joint-coverage + uniform-streak + escalation-dedupe repair
4dc014b Fix garbled output root cause + auto model adjustment
bce6ba0 Implement Jesse's clickable demo standard + garbled output rejection
4101be1 Fix LITELLM_MASTER_KEY exposure on ps command line (Oct 8, 2026)
e7c24ae Fix self-healer dishonest STALE_TASKS reporting on Jesse-gated tasks
07b6edf Standardize base rules for ALL agents (Jesse: stop patching agents one by one)
c739506 Fix CMO demo gap: require verifiable evidence in prompts, purge remaining GoFundMe refs
7c2dc24 Fix CMO hallucination: remove dead GoFundMe code, enforce CEO-only communication
e195b72 self-healer alert-fatigue fix (Oct 7): suppress stale needs_ceo re-alerts with no new terminal outcomes
1984faa Fix blind demo gate: workEngine now syncs agent health on task completion
a531acc workEngine: fail-closed completion logging + retry Vikunja 5xx on SQLite lock (Oct 7, 2026)
e1be48b mcp-token-refresher: identify Buffer server hash, add endpoint fallback
f0ed24e self-healer root-cause fix (Oct 6): add evidence marker to assessment-agent delegation returns
9edaba7 watchdog: stop resurrecting disabled VM-local Meta gateway (:4001)
09b1a84 Fix desktop health SSH check to use tunnel proxy
7655769 Desktop auto-heal (TDD/BDD) + Jesse biography feature
24067aa Fix self-healer delivery rate: compute against terminal outcomes (completed+failed), not inflated directivesReceived
48a69c8 Fix delivery-rate metric inflation in directivePoll health tracking
c7a48ec Fix artifact validation regex to handle plurals (PDFs, templates)
7b2a0ca Add artifact validation to directive poller — dead-letter directives referencing PDFs/files without URLs/paths instead of wasting 3 retries (Jesse: 'Always fix it')
1393246 Autonomous agent interface: runAutonomous() for CFO/CMO/CRO + hourly runner
e768bd6 Raise delegation timeout 180s → 300s (expert lens context slows Qwen to 100s+)
728f47d Process fixes: integration tests, deployment checklist, ADR template, pre-push hook
72d0f77 Fix split-brain: Railway bot skips CEO directives (VM poller is sole processor)
dff1b2e Fix directive reply channel: always post in directive's channel, not agent's primaryChannel
4513d6b Fix engine mechanisms: CFO demo, posting verification, classifier, expert lenses (TDD/BDD)
0eef9fa Slim poller: concurrency 4→2, batch 8→6 (OOM prevention)
225a399 Fix LLM routing: Qwen-first via desktop, disable Meta gateway billing bypass
b641541 Add Jesse Stay Brand Ambassador — single source of truth for all content
093e24e Add TJ Robertson blog SEO lens (Jesse's TikTok) — wired to CMO and CCO
adb40c8 Oct 5: Batch cap (8) + priority sort before cap to prevent cron overruns
ed302da Oct 5: Concurrent delegations + priority tiers + hourly demos + never-complete
33ff42f Visual quality gate: Jasmine Star lens, stock-first editorial filter, CUXO ownership
92f6743 Content gate v2: bold-opinion hooks, full persona map, MCP tool rule
65beafe Content quality gate: 6 engine-law rules before any draft reaches Jesse
dfd6b3c Fix stale sort: Vikunja uses 'updated' not 'updated_at'
3d4bee6 Architecture audit: document what actually works vs fiction
ae1f4bd Update repair queue: finance tool root cause identified
544297d CEO repair queue and delivery scorecard
ca845c1 Fix task starvation: stale-first prioritization for work selection
9d44933 Fix CFO loop spam and remove On-it noise
e0d730c CTO no longer transkrybe-fixated: project-agnostic system prompt
044a9f0 Rebuild delivery scoring around verified behavior, not text appearance
f0408ce Architectural rebuild: poller is sole poster, health counters wired, capability escalation chain, real external verification
566e63a CEO fix: Initialize all agents with Slack client for delegation relay
bd166b2 CEO fix: 90s timeout on agent delegations prevents poller hangs
4d0f9b7 CEO: Self-healer logs engine gaps, never nudges
bc39436 CEO: Remove all engine nudging from Slack
f6b1170 CEO: Roadblock mechanism — agents report needs, CEO builds capabilities
cb8c88f CEO fix: Self-healer executes directly, zero Slack nudging
1e499ff CEO fix: Remove blocking, auto-link directives to Vikunja tasks
a455bf4 CEO fix: Remove cosmetic touches, enforce progress structurally
02919b3 CEO fix: execPM actually assigns tasks via Vikunja API
b0faca5 Track all 11 team members individually in self-healer
04a0f6c Fix: poller routes inter-agent delegations, not just CEO
16293e3 Fix root causes in engine (not band-aids)
d5f4620 Add autonomous self-healer with test-driven verification
1542a41 Add delivery quality learner with continuous audit loop
7e068c5 Fix: agents reply in directive threads (not top-level) + delivery health check
2463e0c Add Canva, GitHub, Tavily, Buffer, Figma MCP servers; designate CTO as auth/credentials agent
af32f28 Fix collaboration nudge spam: deduplicate suggestions within 1-hour window
e7c155d Fix collaboration loop: use plain nudge format instead of [from: CEO → Role] to avoid poller recursion
eac77c9 Fix directivePoll hang: explicit process.exit(0) on success (open handles prevented natural exit)
c2ceb3a Agent-to-agent collaboration: engine suggests direct teammate connections on overlapping work
7f5bc4c Auto-touch Vikunja tasks when agents handle directives (fixes stale task illusion)
f1485a8 Fix directivePoll: retry failed directives instead of skipping (state only advances on success)
81ff52d Add n8n-mcp to hands gateway (CEO/CTO) — same MCP server as Claude desktop
1468d5b directivePoll: VM-local CEO directive processor
1c4af83 meta-gateway: fix null-content failures from reasoning tokens
1bcdd8b Watchdog: check Meta gateway (:4001) instead of dead desktop tunnel (:4000)
abaf641 VM-local LLM: default to Meta gateway, pass LITELLM vars to engine
db3b1ab Allow n8n-inbox bot to post delegations
034a3a2 Fix engine state persistence: use workspace instead of /tmp
c7b9c4c Fix engine 'On it' without results pattern and tool-call leakage
b7e5102 Fix: bypass egress proxy for localhost LiteLLM (SSH tunnel path); use macf-smart-free
c588baf Hands: use macf-smart-free (OpenRouter free) while desktop GPU VRAM <1GB; Ollama CPU-only too slow
ed64647 Watchdog: supervise LiteLLM gateway SSH tunnel (desktop firewall blocks tailnet :4000)
7f4b850 Watchdog: re-apply n8n watch.sh wiring + Flywheel wp-cron ping (lost in Oct 1 hard reset)
0b2ff66 Hands engine: per-role MCP tool access for agents (CFO finance pilot)
17de12d Fix: CEO bot delegations now reach agents; execPM never goes silent on failure
```

## How this snapshot was made

The VM holds no git-transport credential, so the tree was uploaded through the GitHub Git Data API with the stored repo credential: every file as a verified blob (SHA-1 round-trip checked), trees rebuilt bottom-up, one root commit. Full git history remains in the VM repo and in the nightly Drive backups until a credentialed `git push` mirrors it.

---

## Addendum — Oct 16, 2026 (later the same day)

This snapshot's tree is the local repo at the commit named in the snapshot
commit message, which is NEWER than the 3e6b7c4 state described above. Added
since the original note was written (all #789 durable-architecture work,
TDD-first, each phase's tests written before its code):

- `afaf868` Phase A GREEN: conversation checkpointing + requeue receipt note
  (utils/checkpointStore, historyCompaction, receiptSummary, stepClassifier,
  idempotency; 52 acceptance tests).
- `ed28942` Phase E: persistent memory layer (utils/agentMemory; 32 tests).
- `15cff6d` Merge Phase B: directive path onto Hatchet with durable
  checkpointing (engine/directiveWorkflow, directiveIntake, runContext,
  utils/checkpointAdapters; 17 tests). Live since Oct 16: MACF_DIRECTIVE_WORKFLOW=1.
- `293ec38` Merge Phase D: prompt caching wired + measured (utils/promptCache;
  45 tests; live measurement: 83-90% cache-read share by turn 3 on the
  production route). Also merged: Phase C circuit breaker was already in at
  3d554e9 (see main note).

The upload itself was re-run with a gentler uploader (existence-checked,
paced) after GitHub's secondary rate limit stopped the first pass at 2,500
blob uploads; the branch content is identical in intent: the full non-
node_modules source tree of the local HEAD at snapshot time.


---

## Addendum — Oct 17, 2026

Snapshot refreshed to the local repo at commit 2ac92614e60e2f131a6177d02cbcfeef255db854 on branch facebook-expert, which adds the #807 root-cause fix program on top of the Oct 16 snapshot: Phase 1 local second model route (macf-local), Phase 2 real agent actuators (codeRead, pdfRead, wpRead/wpUpdate, webFetch, MCP grants wired into the delegation loop, execution harness fix), Phase 3 postcondition-only completion for directives, Phase 4 watchdog liveness probe + verified user recreation. Commits 134d3ae, 670d870, 925d7d4, 2ac9261. This refresh was uploaded incrementally (only changed blobs/trees) after two full-pass uploads were killed by VM replacements.
