# MACF — Definition, Value, and Verification Spec

Written by the CEO (Jarvis Jr.) at Jesse Stay's order, Nov 5, 2026. This document is the
"advertised" definition of the MACF: what it is supposed to do, why it is worth using,
and the exact outcomes each function must produce to count as working. The daily CEO
verification audit is run against this spec. If the system and this document disagree,
either the system gets fixed or Jesse changes the document — never silently.

## 1. What the MACF is

MACF is a persistent, 24/7 AI workforce that runs Jesse Stay's business operations the
way a staffed company would. A team of named agents with real roles (CEO, CTO, CMO, CCO,
CFO, Job Coach, SEO Expert, Lawyer, Exec PM, and others) works around the clock on
Jesse's own infrastructure, coordinated through Slack and Vikunja, supervised by the CEO,
with Jesse as investor/chairman who makes only the decisions only he can make.

It is not a chatbot and not a single assistant. Work is assigned as tickets, executed by
the responsible agent, receipted, and audited against outcomes. The CEO's job is fixing
the MACF and verifying the team produces outcomes — not producing them himself and
calling it done (Jesse, Oct 28, 2026).

**Definition of "working" (Jesse's, binding):** a system counts as working only when the
MACF team itself runs it end to end, on its own machinery and schedules, and the result
verifies against the primary source (a portal confirmation, a live URL, a changed page,
a send reference). A CEO one-off, a build, a deploy, or a completion report is not proof.

## 2. The functions it is supposed to perform

Each function lists the outcome that counts. Anything else is activity, not delivery.

- **F1 — Job application campaign (Job Coach).** Harvest Director/VP-level roles
  ($200K+, remote/Utah-local/hybrid), tailor resumes, and the TEAM submits applications
  itself (Playwright/MCP execution seat; CEO supplies auth and data only). Counts only
  with a portal confirmation recorded in applications.jsonl.
- **F2 — Content engine (CCO + team).** Weekly content batch produced on the team's own
  schedule; drafts debated in-channel by multiple personas until programmatically good
  enough; media attached on every draft; Canva affiliate links woven in where relevant;
  CEO final review; Jesse approves before anything publishes. Zero fabrication — every
  claim traces to Jesse's chats, his own social media, or verified team accomplishments.
  Counts only as live post URLs.
- **F3 — SEO/AIO action (SEO Expert).** Jesse's Oct 28 order: action, not just
  knowledge. Counts only as changed staynalive.com/jessestay.com pages, verified on
  re-audit.
- **F4 — Client and partner deliverables (CMO, CUXO review).** Proposals and one-pagers
  produced in Canva with Stay N Alive brand design, copy drawn from Jesse's full
  verified background record, CEO verifies the export. Counts only with a send
  reference (a draft in a folder is not a delivery).
- **F5 — Revenue operations and finance (CFO).** Daily finance snapshot; every newly
  discovered expense lands in the budget sheet the same pass; revenue streams pursued
  autonomously (audit outreach, affiliate content, products). Counts as money movement
  and sent deliverables, not plans.
- **F6 — AI audit outreach.** Batches of outreach for the $750 AI Readiness Audit;
  replies watched continuously; follow-ups drafted for Jesse's one-click review.
- **F7 — DM concierge.** Facebook, Instagram, LinkedIn, and Threads messages watched;
  real messages triaged and drafted in Jesse's voice for approval; nothing sends
  without his go-ahead.
- **F8 — Directive execution.** A CEO directive in Slack (exact header format) is
  registered, picked up, executed by the owning agent, and its result lands as a
  comment on its Vikunja ticket. CEO-addressed completed packages are relay debt until
  the CEO presents them to Jesse. Zero silent dead-letters: the dead-letter store is
  inspected, not ignored.
- **F9 — Demo relay.** Every agent produces visible demos; demos relay to Jesse after
  the agent demos to the CEO. Silence from any agent is treated as breakage.
- **F10 — Capability baseline.** A 15-server MCP baseline unioned into every agent
  (story #906), verified daily IN THE ENGINE'S OWN CONTEXT. A server that answers a
  probe but fails in engine context is failing.
- **F11 — Reliability.** Engine, Vikunja, gateway, and n8n stay up; the watchdog
  auto-restores known failure classes (MCP binary ephemerality, user wipes, perms).
  A heartbeat is not health: health means workflows actually execute.
- **F12 — Scrum discipline.** Every unit of work exists as a user story ("As a ...")
  with acceptance criteria (Given/When/Then) and a difficulty score, in the team's
  planning system BEFORE it is built; BDD acceptance tests first, then TDD unit tests;
  automated suites run on a schedule, not by hand.

## 2.5 Platform properties (part of the definition, not extras)

- **LLM-agnostic.** The owner picks the models. MACF routes work across local models
  (LM Studio / Ollama-class), subscription desktop AI apps, OpenRouter, and direct
  provider APIs, budget-first: cheap and simple work defaults to local models, agent
  reasoning defaults to the most capable model the owner has connected. Swapping or
  adding an LLM never changes the team's roles, memory, tools, or receipts — the model
  is a swappable backend, not the product. A zero-API-budget instance still runs on
  local models alone.
- **Repeats.** MACF's name for its standing loops: scheduled agent routines, per-agent
  or all-agents, each optionally emulating a named expert persona (a Lou Adler hiring
  lens for job search, a Neil Patel lens for SEO, other expert frameworks wired into
  content roles). Every Repeat runs under a resource governor that yields to direct
  work, keeps a learning ledger (persona, actions, conversions — each run must do
  measurably better), and swaps personas champion/challenger only on tracked wins with
  CEO approval. Repeats are data: they clone to new sites, roles, and businesses.
- **MCP-native, extensible by configuration.** Tools arrive as MCP servers through a
  grants system: a baseline set is unioned into every agent, role grants add more, and
  gated tools (payments, desktop control, finance) stay behind explicit owner
  decisions. New capability means adding an MCP server, a custom tool, a skill, or an
  action — not rebuilding the team. If a tool exists as an MCP server, the team can be
  granted it; custom MCP tools can be built and granted the same way.
- **Owner-controlled by design.** Nothing external — a send, a post, a purchase, a
  filing — happens outside the owner's approval rules. The system runs on the owner's
  own infrastructure, so the data, the memory, and the audit trail stay the owner's.

## 3. Value — why use this instead of the alternatives

- **Versus hiring people:** a staffed executive team (CMO, CTO, content lead, finance,
  recruiter) costs six figures per month and works business hours. The MACF runs 24/7
  on an Oracle Always Free instance — infrastructure cost is $0 — plus model spend.
  It never sleeps, never quits, and its entire context (Jesse's full background,
  finances, preferences, history) is loaded on every task.
- **Versus a general AI chatbot (ChatGPT, Claude.ai, Gemini):** those answer questions
  and forget. They hold no tickets, run no schedules, submit nothing, verify nothing,
  and cannot be audited. The MACF is an execution system with receipts: every tool call
  issues a structured receipt, tasks close only when postconditions verify, and a daily
  outcome audit counts only verified deliveries.
- **Versus an agency or freelancers:** agencies bill for activity and reports. The MACF
  is judged on verified outcomes (portal confirmations, live URLs, changed pages, sent
  deliverables) and its failures are visible in its own audit, in the open, to its
  owner. It also works from Jesse's canonical record, not a brief it skimmed.
- **Versus DIY agent frameworks (CrewAI, LangGraph, AutoGPT-style builds):** those are
  libraries, not a company. They ship no roles, no approval discipline, no memory of
  the owner, no relay-debt rule, no no-fabrication rule, no watchdog, and no one
  accountable when a "completed" task turns out not to exist. The MACF's differentiator
  is the accountability stack: stories → acceptance criteria → BDD/TDD → receipts →
  outcome audit → CEO verification → chairman decisions.
- **Versus a human VA:** a VA executes what it is told, one thread at a time. The MACF
  runs parallel workstreams under a Never-Idle ladder, escalates blockers to the CEO,
  and improves its own tooling — while every external action stays behind Jesse's
  approval rules.

**The one-sentence pitch:** MACF is a 24/7 AI executive team that runs a real business
on the owner's own infrastructure, is managed like a scrum team, and is only allowed to
call something done when the outcome verifies at the source.

## 4. Failure modes this spec must be checked against (every issue seen so far)

1. Fabricated content presented as real (Nov 3 transkrybe inventions).
2. Completion reports that are not true (CCO "deleted" posts still live, Nov 3).
3. CEO relay debt — finished agent work never presented to Jesse (Oct 22, #766).
4. Directives silently dead-lettering (wrong header format; HTML-escaped arrows).
5. Engine heartbeat fresh while zero workflows execute (Hatchet PG zombie, Oct 21).
6. Ledger data loss / stage resets creating double-submit risk (#938).
7. MCP binaries vanishing on VM replacement (recurring; auto-restore required).
8. Gateway empty-200 stalls (circuit breaker exists; verify it trips and recovers).
9. Capability "fixed" claims that regress in the audit context (Canva/Buffer, #911).
10. CEO executing work personally and the team getting credit (applications, Nov 2-3).
11. Outcome zeros tolerated for weeks (posts 9d, SEO 31d, deliverables 31d — Nov 4 audit).
12. Work existing outside the planning system (content batch had no story until Nov 2).
13. Token/credential expiries silently killing a channel (Figma PAT, Buffer OAuth).
14. Blocker sitting in a state file unactioned instead of escalated to the CEO.

## 5. Verification standard

The CEO verification audit runs daily against Sections 2 and 4. For each function:
PASS only on primary-source evidence from the last audit window; FAIL with the ticket
that tracks the fix; fixes are made by the CEO personally under Jesse's Nov 5, 2026
order, re-tested in the context the work runs in, and only then marked resolved.
