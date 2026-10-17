# DM Concierge — Approval Package Format

One JSON file per actionable inbound message, written by the scheduled worker
to `~/workspace/macf/hidden_files/dm-concierge/pending/<UTC-timestamp>-<n>.json`
(`<UTC-timestamp>` = `YYYYMMDDTHHMMSSZ`; `<n>` = 1, 2, 3… per message in that
run). The CEO presents these to Jesse for approval before anything is sent.

## Hard rules

- FBIDs/opaque IDs stay inside tool payloads, package files, and the audit
  log — they are NEVER shown to Jesse. The CEO presents **sender name +
  their message + the draft**, nothing else.
- `takeover_thread` is always `false` in these files: packages exist only for
  threads Jesse must approve. (Takeover-thread replies are sent directly and
  logged in `audit.log.jsonl`, not packaged.)
- `draft` must be short, in Jesse's voice (`team-skills/jesse-voice.md`), with
  no invented facts (handles, follower counts, stats, dates) and no
  commitments. `null` means the worker drafted nothing for that message.
- `needs_from_jesse` names what Jesse must supply before the draft can go out
  (a decision, a number, an intro). Omit the field when the draft is ready
  as-is.

## Schema

| Field              | Type    | Required | Description |
|--------------------|---------|----------|-------------|
| `platform`         | string  | yes      | `"instagram"` (more platforms later). |
| `account`          | string  | yes      | Jesse's IG username that received it. |
| `thread_fbid`      | string  | yes      | Opaque thread ID. Tool payloads + audit only; never shown to Jesse. |
| `sender`           | string  | yes      | Sender's display name. This is what Jesse sees. |
| `message_text`     | string  | yes      | The inbound message, verbatim. |
| `received_at_utc`  | string  | yes      | When it arrived, ISO-8601 UTC. |
| `triage_category`  | string  | yes      | `urgent` / `business-opportunity` / `personal` / `spam-noise`. |
| `triage_note`      | string  | yes      | One or two sentences: why this category, what matters. |
| `draft`            | string  | yes      | The proposed reply in Jesse's voice, or `null` if none drafted. |
| `takeover_thread`  | boolean | yes      | Always `false` here (see rules). |
| `needs_from_jesse` | string  | no       | What Jesse must supply before sending. Omit if draft is ready. |

## Example

A realistic business-opportunity message. (IDs are illustrative.)

```json
{
  "platform": "instagram",
  "account": "jessestay",
  "thread_fbid": "aWQ6MTIzNDU2Nzg5MA==",
  "sender": "Maya Chen",
  "message_text": "Hey Jesse! I'm producing a podcast for early-stage founders called First Check. Would love to have you on to talk about your agent team setup — 30 min, remote, we work around your schedule. Interested?",
  "received_at_utc": "2026-09-25T16:42:10Z",
  "triage_category": "business-opportunity",
  "triage_note": "Credible ask with specifics (named show, 30 min, remote, topic = his agent work). No rate quoted, nothing weird. He gets podcast asks often, so this is interest-gauge, not a yes.",
  "draft": "Hey Maya, appreciate you thinking of me. The agent team setup is a fun topic. What kind of audience are you reaching these days? Might be a fit.",
  "takeover_thread": false,
  "needs_from_jesse": "Only if he's actually interested — the draft just opens the door. If he wants in, he'd need to offer times."
}
```

## How the CEO presents one package to Jesse

One card per package, plain language, no IDs:

> **Maya Chen** (podcast producer) wrote:
> "Would love to have you on First Check to talk about your agent team setup — 30 min, remote."
>
> Triage: business-opportunity — credible, specific ask; draft keeps it curious without committing.
>
> Draft reply: *"Hey Maya, appreciate you thinking of me. The agent team setup is a fun topic. What kind of audience are you reaching these days? Might be a fit."*
>
> Reply / Edit / Skip?
