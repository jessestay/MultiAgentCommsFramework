# Architecture Decision Record (ADR) Template

**Copy this to `docs/adr/NNN-short-title.md` for every architecture decision.**

---

# ADR-NNN: [Title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded
**Deciders:** [Who made this decision]

## Context

[What is the problem? What forces are at play? Why now?]

## Decision

[What are we doing? Be specific.]

## Enable New Path

[What code/config/cron are we adding or changing to enable the new behavior?]

- File: `path/to/file.js` — [what changed]
- ...

## Disable Old Path

**THIS SECTION IS MANDATORY. The Oct 6 split-brain happened because we enabled the new path (VM poller) without disabling the old path (Railway bot directive handling).**

[What are we turning off, removing, or guarding to prevent the old behavior?]

- File: `path/to/old-file.js` — [what was disabled/removed/guarded]
- [ ] Verified the old path cannot re-activate (grep for the old pattern, confirm it's gone or guarded)
- [ ] If the old path is in a different process/repo, documented where and how it was disabled

**If there is no old path (greenfield), write "N/A — greenfield, no old path."**

## Consequences

[What are the trade-offs? What becomes easier/harder?]

## Verification

[How do we know this works? What tests prove it?]

- Unit tests: `engine/tests/xxx.test.js`
- Integration tests: `engine/tests/integration/xxx.integration.js`
- Manual verification steps: [what to check in Slack/Vikunja/etc.]

## References

- Related ADRs: [links]
- Jesse's directives: [quotes with dates]
