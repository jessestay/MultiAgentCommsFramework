# ADR-001: VM Poller is Sole Directive Processor

**Date:** 2026-10-06
**Status:** Accepted
**Deciders:** Jarvis Jr. (CEO), per Jesse's "VM is the engine home" directive

## Context

Two independent processes were processing the same CEO directives:
1. VM poller (`engine/directivePoll.js`) — polls Slack API every 5 minutes
2. Railway bot (`index.js`) — receives Slack events in real-time

Both invoked `handleDelegation` for `[from: CEO → Role]` messages, causing duplicate posts. On Oct 6, a test directive received 2 replies in the thread (one from each processor).

The Oct 4 architecture decision ("poller is sole poster, VM handles directives") was never fully implemented — the Railway bot's directive handler was not disabled.

## Decision

The VM poller is the SOLE processor of `[from: CEO → Role]` directives. The Railway bot skips these messages entirely.

## Enable New Path

- File: `slack-agents/engine/directivePoll.js` — Already processes CEO directives via 5-min cron. Added `verifyPostLanded()` read-after-write verification (Oct 6).
- File: `slack-agents/engine/tests/single-processor.test.js` — TDD test asserting the Railway bot skips CEO directives.

## Disable Old Path

- File: `slack-agents/index.js` — Added guard in message handler:
  ```js
  const fromName = delegMatch[1].trim().toLowerCase();
  if (fromName === 'ceo') {
    console.log(`[index] Skipping CEO directive (VM poller handles)`);
    return;
  }
  ```
- [x] Verified: `grep -n "Skipping CEO directive" slack-agents/index.js` finds the guard
- [x] Agent-to-agent delegations (`[from: CCO → CFO]`) still process — only CEO directives are skipped
- [x] n8n-inbox system delegations (`[from: n8n-inbox → X]`) still process

## Consequences

**Positive:**
- No more duplicate directive processing
- Single clear ownership (VM poller)
- Verification readback catches posting failures

**Negative:**
- CEO directives now have up to 5-min latency (poller cadence) vs real-time (Railway events)
- If the VM poller dies, CEO directives stall until the watchdog restarts it

**Mitigations:**
- Engine watchdog monitors the poller cron
- Poller lock prevents duplicate runs

## Verification

- Unit tests: `engine/tests/single-processor.test.js` (5 tests pass)
- Manual: Posted test directive, verified single reply in thread (no duplicate)
- Deployment checklist: Single processor verification section

## References

- Jesse's directive: "VM is the engine home" (Oct 6, 2026)
- Oct 4 architecture: "poller is sole poster"
- Related: DEPLOYMENT_CHECKLIST.md
