# MACF Engine Deployment Checklist

**Run this before every deployment. Every item must be checked.**

## Pre-Deploy: Tests

- [ ] `npx jest engine/tests/ --forceExit` — all unit tests pass (currently 18 tests)
- [ ] New code has TDD tests written BEFORE the implementation
- [ ] BDD scenarios in `engine/tests/*.test.js` describe the expected behavior
- [ ] If touching Slack posting: `SLACK_INTEGRATION_TEST=1 npx jest engine/tests/integration/slack-post-verify.integration.js`
- [ ] If touching Vikunja: `VIKUNJA_INTEGRATION_TEST=1 npx jest engine/tests/integration/vikunja-projects.integration.js`

## Pre-Deploy: Single Processor Verification

**The Oct 6 split-brain: two processes handled the same directives.**

- [ ] Only ONE directive processor is active. Verify:
  ```bash
  # VM poller should be running via cron
  crontab -l | grep directive-poll
  # Railway bot's index.js must SKIP [from: CEO → ...] (check for the guard)
  grep -n "Skipping CEO directive" slack-agents/index.js
  ```
- [ ] No duplicate `handleDelegation` paths. If adding a new entry point that calls `handleDelegation`, verify it doesn't overlap with the poller.

## Pre-Deploy: Channel Correctness

**The Oct 6 wrong-channel bug: replies went to agent's primaryChannel instead of directive's channel.**

- [ ] Directive replies ALWAYS use the directive's channel (`channel` param in `finalizeDelegation`), never `result.channel`
- [ ] If adding a new post path, verify the channel is the directive's channel

## Pre-Deploy: Comment-Code Alignment

**The Oct 6 project-16 bug: comment said "project 2 and Revenue Sprint", code had `[2]`.**

- [ ] For every comment describing behavior, verify the code matches
- [ ] If the comment lists items (projects, channels, agents), verify the code includes all of them
- [ ] Consider: does a test assert what the comment claims?

## Pre-Deploy: Architecture Decision Compliance

- [ ] If this changes an architecture decision, the ADR has been updated (see `docs/adr/`)
- [ ] The "Disable Old Path" section lists what was turned off, not just what was turned on
- [ ] No dead code paths remain that could re-activate the old behavior

## Deploy

- [ ] Commit with descriptive message (no `git add -A`, stage explicit files)
- [ ] Push via `push_to_branch.py` (not direct git push)
- [ ] Verify the push succeeded: check GitHub for the new commit

## Post-Deploy: Verification

- [ ] Run the affected cron manually once, verify exit 0
- [ ] Check Slack for expected output (in the right channel/thread)
- [ ] Monitor for 15 minutes: no duplicates, no errors in logs
- [ ] Update `~/MEMORY.md` if this changes a standing rule or fixes a recurring issue

---

**If any item cannot be checked, DO NOT DEPLOY. Fix the blocker first.**
