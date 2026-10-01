# MACF Hands Gateway — Architecture Spec

**Status:** approved for build by Jesse, Oct 1, 2026
**Purpose:** give the MACF team "hands" — the ability to verify and act on the real world, instead of text-only hallucinations.
**Root cause it fixes:** the Sep 30 throughput audit found the engine is text-only (one LLM call, no tools), which is the deep cause of fake "done"s. Agents cannot verify sends, payments, or pages. Hands kill that failure class.

## Design principle: capability-scoped servers, per-role access

Jesse's guardrail model (Oct 1, 2026): different team members get access to different MCP servers. The CFO may have a PayPal MCP; other roles don't need it.

We implement this as **capability-scoped MCP servers** (one server per capability domain, not per role), with **per-role access grants**:

```
                    ┌─────────────────────┐
                    │  macf-finance (MCP) │  PayPal read, transaction verify
                    └────────┬────────────┘
                             │ CFO only
┌──────────┐        ┌────────┴────────────┐        ┌──────────────────────┐
│   CFO    │────────│                     │        │  macf-outreach (MCP)│  Gmail search/draft/send, reply watch
└──────────┘        │   per-role access   │────────└────────┬─────────────┘
┌──────────┐        │   grants (config +  │                 │ CRO only
│   CRO    │────────│   server-side role  │
└──────────┘        │   verification)     │        ┌────────┴─────────────┐
┌──────────┐        │                     │────────│   macf-ops (MCP)     │  health checks, deploys, watchdog
│   CTO    │────────└─────────────────────┘        └──────────────────────┘
└──────────┘                                                  CTO only
```

Two enforcement layers (defense in depth):
1. **Client config:** each role's MCP client only loads its granted servers. CFO never even sees the outreach server.
2. **Server-side role verification:** every MCP server checks the caller's role token on each call. A misconfigured or compromised client cannot escalate — the server refuses.

## Why MCP (and when to build our own)

Jesse's instruction: build our own MCP servers where there's benefit; otherwise reuse existing ones.

**Reuse existing:**
- `fetch`, `filesystem`, `github` — official MCP servers, fine as-is for generic needs.
- `n8n-mcp` — already in mcp.json; keep, but its API key is currently plaintext (see Security).
- PayPal official MCP server — evaluate first. If it supports read-only scoping cleanly, use it behind our finance server's access control. If its auth model fights our per-role tokens, wrap the PayPal REST API directly instead.

**Build our own (thin wrappers, not reinventions):**
- `macf-finance` — PayPal read tools + transaction verification. No good role-scoped option exists; our wrapper enforces read-only in the pilot.
- `macf-outreach` — wraps the existing worker scripts (`audit-outreach-worker.py` patterns) and `hatch_gws_cli` Gmail commands. The real sends already happen through these; we wrap, don't rebuild.
- `macf-ops` — wraps health checks, deploy scripts, watchdog. CTO only.

Rule: a new MCP server is justified only when no existing server gives us the capability with our access-control model. Wrapping a worker script counts as justified — it's a day's work, not a new system.

## Tool rollout order: reads before writes

1. **Read/verify tools first.** PayPal transaction read, Gmail search, page fetch. These kill the fake-"done" failure class before anyone gets a loaded tool. They also make the team *smarter* (ground truth in, hallucinations out).
2. **Write tools second, gated.** Gmail send stays behind the existing draft-approval gate. No spend/save/send/publish tool ships without a code-level approval gate mapped to Jesse's standing boundaries — never prompt text alone. (We just learned this: the CFO's "restricted, no public posts" flag existed in config with zero code paths checking it.)

## Audit log

Every tool call is logged: who (role), what (tool + args), when, result. This is the evidence behind "claim it only after it's done" — and the first place the CEO looks when a number looks wrong.

## Budgets

Tool chains multiply LLM round trips, and the desktop gateway is at a 45% timeout rate on long calls. Every role gets a per-task tool-call and latency budget. Hands without a budget make the timeout problem worse.

## Pilot scope (this build)

`macf-finance` for the CFO, read-only:
- `paypal_transactions_read` — list transactions in a window (verified revenue ground truth)
- `paypal_balance_read` — current balances
- Role grant: CFO only. Server refuses all other roles.

Out of pilot scope (next): outreach server (CRO), ops server (CTO), agent-runtime MCP client loop (see below).

## Agent-runtime integration (design, not yet built)

The Slack agents currently make one LLM call with no tool loop. Giving them hands requires:
1. An MCP client in the agent runtime with a ReAct-style tool-use loop.
2. Per-role server allowlists loaded from config.
3. The tool-call/latency budgets above.

This is the largest engineering piece and lands after the pilot server proves the pattern. The pilot server is built stdio-first so any MCP client can consume it.

## Security

- `~/workspace/macf/mcp.json` currently holds a plaintext n8n API key. Before production use: rotate the key, move secret resolution into the vault/broker, never commit plaintext credentials again.
- Per-role MCP tokens follow the Vikunja per-agent token pattern (600-mode files, never printed).
- No tool result containing credentials is ever logged or echoed to chat.

## What success looks like

The CFO's next revenue dashboard is produced by calling `paypal_transactions_read`, not by inventing numbers — and the audit log proves it.
