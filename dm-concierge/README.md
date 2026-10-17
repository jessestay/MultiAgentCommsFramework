# DM Concierge

Jesse's team monitors his DMs, drafts replies in his voice, and Jesse approves
each draft before ANYTHING is sent. A per-thread "takeover" flag allows
autonomous replies on threads Jesse names (still never money/commitments/
invented facts).

## Pieces

| File | Purpose |
|---|---|
| `poll_ig.py` | Polls connected IG accounts (inbox + pending folders), emits new inbound messages vs watermark |
| `WORKER_PROMPT.md` | The 15-min worker instructions: poll → takeover check → classify + draft → approval package → audit → CEO summary |
| `APPROVAL_FORMAT.md` | Approval package JSON schema + example + CEO presentation card |
| `linkedin-browser-brief.md` | Draft-only live-browser brief for the LinkedIn leg (parent runs it) |

## State (hidden)

`~/workspace/macf/hidden_files/dm-concierge/`
- `watermark.json` — per account+folder last-seen timestamps
- `takeover.json` — per-thread flags: `"<platform>:<account>:<thread_fbid>"` → `{"since": iso, "note": ...}`. ONLY Jesse adds flags (via the CEO).
- `pending/` — approval package JSON files awaiting Jesse's decision
- `audit.log.jsonl` — one JSON line per message processed (UTC)

## Platform status (Sep 25, 2026)

- **Instagram**: plumbing built and tested, but `instagram-messages-cli accounts`
  shows all 3 accounts (`socialtooconsulting`, `staynalivellc`, `jessestay`)
  `connected:false` — Jesse must complete the Instagram Messages connect flow.
  `automaticjesse` is not in the connector at all (needs linking first).
  Watcher cron runs anyway; it exits quietly until an account connects.
- **LinkedIn**: no API/skill — brief ready for a live-browser task (draft-only).
- **Facebook/Messenger**: PARKED — Messenger connection blocked at PIN login.

## N8N migration note

Jesse prefers scheduled jobs in N8N. The watcher currently runs as a Claude cron
(`dm-concierge-watch`, every 15 min) because N8N's WSL location/details were
still unverified at build time (Sep 25, 2026). To migrate: recreate this
schedule in N8N on the WSL host with the worker prompt above as the job body,
point it at the same scripts/state paths (they live on the VM — move or
re-point as needed), verify one run, then delete the Claude cron. Vikunja #48
tracks this.
