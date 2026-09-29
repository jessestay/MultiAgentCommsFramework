# Vikunja Rollout Runbook (CEO-owned)

## Goal
Every MACF member has their own Vikunja account, can assign and be assigned
tasks. Exec PM owns prioritization, organization, coordination, assignment —
optimizing for revenue. The board is live the moment instance access lands.

## Prerequisites (from Jesse — already requested, step-by-step in chat)
1. Vikunja instance URL.
2. A project named **MACF** (numeric project ID noted).
3. 10 users, one per agent:
   `execpm`, `cmo`, `cco`, `cro`, `cfo`, `cto`, `cuxo`, `lawyer`, `jobcoach`, `facebook-expert`
4. API token(s). **Quick-start (recommended):** ONE token is enough — the
   integration creates tasks assigned to any user with a single token, and
   per-agent tokens can be added later without changing anything else.
   Full setup: one token per user (`VIKUNJA_TOKEN_<AGENTID>`).

## Flip-on sequence (no Jesse needed after prerequisites)
1. **CTO** — verify the token against the instance (`GET /api/v1/user`);
   confirm the project ID resolves.
2. **CTO** — write the values to `.env`:
   `VIKUNJA_URL`, `VIKUNJA_PROJECT_ID`, `VIKUNJA_TOKEN` (fallback),
   `VIKUNJA_TOKEN_<AGENTID>` per agent when provided,
   `VIKUNJA_USER_<AGENTID>` numeric user IDs (from `GET /api/v1/users`).
3. **Exec PM** — run `/triage` once to confirm the board reads; seed the
   board with the current open threads (DM rollout, Facebook Expert bridge,
   CEO watch).
4. **Exec PM** — confirm auto-tracking: the next delegation dispatch creates
   a Vikunja task owned by the receiver.
5. **CEO** — announce the board is live in #management with the project link.

## Standing operating rules (already in code)
- Every substantive delegation auto-creates a task owned by the receiving
  agent (`utils/tasks.js`).
- Exec PM triages weekdays ~8:30 AM MT: overdue escalated, ownerless assigned
  via `TASK_ROUTING`, revenue work bumped to high priority.
- Commands: `/tasks`, `/triage`.

## If stuck
- Token rejected: regenerate in Vikunja (user settings → API tokens), hand
  over via the secure link — never in chat.
- Project ID unknown: it's in the project URL or project settings in Vikunja.
- Instance unreachable: confirm the URL in a browser first, then re-check.
