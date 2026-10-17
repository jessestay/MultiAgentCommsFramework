# CEO Repair Queue — Architectural gaps blocking team delivery

**Rule:** Work top-down. Fix the mechanism, verify with a test, commit, move to next.
**Updated:** 2026-10-05 01:45 MDT
**Owner:** Jarvis Jr. (CEO) — no delegation, I fix these myself.

## P0 — Team produces zero verified deliveries

**Status:** OPEN — root cause of everything below
**Gap:** Agents are active in Slack but nothing gets externally verified. 8 pending, 0 verified, 0 failed in the verify queue. 0 Vikunja tasks marked done today.
**Why:** Agents lack real execution tools. Audit (Oct 5, 2026 02:00 MDT):
- WORKING: Vikunja API, web search (search.js), X publishing (publisher.js), Slack
- BROKEN: Finance MCP (prototype bridge), Buffer, Tavily MCP, Canva, Figma, GitHub, n8n-mcp (never implemented)
- Agents with ZERO tools: Facebook Expert, execPM
**Fix needed:** Per the power ladder — build the missing tools. Priority: (1) wire search into CCO/CUXO, (2) complete finance MCP bridge OR build direct check, (3) give CTO shell access for infrastructure.
**Next step:** Wire search into all agents that need it. Verify X publishing end-to-end.

## P1 — Done (2026-10-05)
- [x] Task starvation (#85, #87): work picker used .find() on Vikunja order → stale-first sort. Commit ca845c1.
- [x] CFO loop spam: LOOP task re-fired every 5min on tool 500 → 4h backoff after 3x identical failures. Commit 9d44933.
- [x] "On it" noise: redundant ack messages → removed. Commit 9d44933.
- [x] CTO transkrybe fixation: prompt hardcoded to one project → project-agnostic. Commit e0d730c.
- [x] Delivery scoring punished correct behavior → v2 behavior-based scoring. Commit 044a9f0.
- [x] Self-healer nudged agents on low quality → root-cause diagnosis, never nudges. Commit 044a9f0.

## P2 — Open gaps (in priority order)

### 1. Messenger auth blocked since Sep 16
**Gap:** Facebook Expert cannot access Messenger DMs. PIN-login stall.
**Blocker:** Needs Jesse's hands (login).
**Status:** WAITING ON JESSE — surfaced, not fixable by me.

### 2. Finance tool returns HTTP 500
**Gap:** CFO cannot verify real numbers. The MCP bridge (mcpBridge.js) is a prototype — "full JSON-RPC tool invocation pending". It spawns the server but can't invoke tools. Server also requires MACF_ROLE=CFO + token which the bridge doesn't set.
**Fix needed:** Complete the MCP bridge JSON-RPC implementation OR build a simpler direct finance check. PayPal API also needs 2FA (Jesse's hands).
**Status:** BACKOFF ACTIVE — task suppresses for 4h after 3 failures. Full integration is a multi-hour build, queued.

### 3. Verifier only handles URL artifacts
**Gap:** Text analysis (reports, recommendations) sits in pending for 24h then ages out. No verification path for non-URL work.
**Fix needed:** Verifier should classify text-only outputs as "not applicable" immediately instead of pending them for 24h.
**Status:** OPEN

### 4. VM reboots wipe macf user (2x tonight)
**Gap:** Engine, Vikunja, gateway, n8n all die on VM reboot. Watchdog recovers but it's fragile.
**Fix needed:** Investigate persistent user creation or faster recovery.
**Status:** OPEN — watchdog handles it, but 2 reboots in one night is concerning.

### 5. Directive poller timeout on execPM delegation (90s)
**Gap:** execPM LLM calls timeout after 90s, directive skipped.
**Fix needed:** Increase timeout or make delegation async.
**Status:** OPEN

## Delivery Scorecard

| Date | Verified deliveries | Tasks done | Notes |
|------|-------------------|------------|-------|
| 2026-10-04 | 0 | 0 | Engine down 30h (VM snapshot), restarted evening |
| 2026-10-05 | 0 | 0 | In progress |

**Target:** >0 verified deliveries per day. Until then, P0 stays open.
