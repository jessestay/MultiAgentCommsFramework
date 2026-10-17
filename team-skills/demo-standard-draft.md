# MACF Demo Standard v1 — DRAFT (pending Jesse's approval)

When the desktop is back online, every team member's demos must meet this standard. It will be wired into `slack-agents/utils/agentBase.js` so all agents inherit it automatically.

## The one rule: no link, no demo

Every demo must include at least one clickable link to the actual thing. A description of work without something to click is a status update, not a demo.

## Link by artifact type

- Drafts to approve (copy, emails, strategy docs) → link to the draft itself, paired with Approve / Reject buttons so Jesse can act in one tap
- Websites or landing pages → staging or live URL
- Social posts → preview or scheduled-post link
- Images or creative → attached inline (renders right in chat) plus a file link
- Apps or tools → URL to the running thing
- Metrics or reports → dashboard link, or the numbers inline with a link to the source

## Needs-from-Jesse label

Every demo carries one of three labels. No guessing what action is wanted:

1. **NEEDS APPROVAL** — always paired with Approve / Reject buttons
2. **NEEDS FEEDBACK** — a specific question, not "thoughts?"
3. **FYI** — no action needed

## Traceability

Link the Vikunja task too: one link to the artifact, one link to the task. Any demo can be traced back to what was asked.

## Link-check

The engine clicks every demo link before it counts. Dead links (404s, or pages Jesse can't open) are auto-rejected and sent back to the owner. A broken link is not a demo.

## One living link per deliverable

Link the latest version of a doc, never version dumps (no v1 / v2 / v3 attachments).

## Evidence rule

Already in the agent base rules: no verifiable proof, no deliverable.

## Delivery rhythm

- Demos post to Slack as they happen
- Jesse gets a morning + evening digest with links
- Instant pings only for NEEDS APPROVAL items — eleven agents demoing hourly will never bury him
