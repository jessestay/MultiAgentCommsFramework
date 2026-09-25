# Jesse Stay Slack Agents v2 — Setup Guide

> Always-on, proactively posting agents via Socket Mode on Railway.

---

## What changed from v1

| v1 (Vercel) | v2 (Railway) |
|---|---|
| Serverless functions | Persistent Node.js process |
| HTTP webhooks | Socket Mode (WebSocket) |
| Responds to @mention only | Proactively posts without being asked |
| Daily cron only | Per-agent schedules (15min to 6hr) |
| Requires public URL for Slack Events | No inbound URL needed |

---

## Design principle — mimic optimized human teams

MACF's Slack organization follows how the best human teams use Slack, and every
future change should too:

- Channels are organized by **function/topic** (#marketing, #content, …) —
  never one channel per agent. No personal inbox channels.
- Agents join the channels relevant to their role and operate there as
  specialists, the way a human expert does.
- Work is routed with **@mentions** and the `[from: X → Y]` delegation format,
  and carried out in **threads** so the channel stays readable.
- Results and handoffs are posted where the work was requested, not filed
  away in a side channel.
- DMs between members are normal wherever they'd be normal on a human team.
- Every request made *of* the end user follows the step-by-step standard in
  Part 7, on every DM channel.

## Part 1 — Slack App Changes

You need to update your existing Slack App (or create a new one) to support Socket Mode.

### 1a. Enable Socket Mode

1. Go to https://api.slack.com/apps → your app
2. Click **Socket Mode** (left sidebar)
3. Toggle **Enable Socket Mode** → ON
4. You'll be prompted to create an **App-Level Token**:
   - Name it: `jesse-agents-socket`
   - Add scope: `connections:write`
    - Click **Generate**
   - **Copy the token** — it starts with `xapp-`. This is your `SLACK_APP_TOKEN`

### 1b. Required OAuth Scopes

In **OAuth & Permissions** → **Bot Token Scopes**, make sure you have:

```
chat:write
channels:read
channels:history
groups:read
groups:history
im:read
im:write
im:history
mpim:read
mpim:write
reactions:read
commands
app_mentions:read
```

> `im:write` / `mpim:write` let agents open DMs; `im:history` lets them read
> DM history. See Part 6.

If you added scopes, click **Reinstall to Workspace**.

### 1c. Required Event Subscriptions

In **Event Subscriptions**:
- Toggle **Enable Events** → ON
- Under **Subscribe to bot events**, add:
  - `app_mention`
  - `message.channels`
  - `message.groups`
  - `message.im`      ← lets agents receive 1:1 DMs
  - `message.mpim`    ← lets agents receive group DMs
  - `reaction_added`

> **Note:** With Socket Mode, you do NOT need to provide a Request URL for events.

### 1d. Create Slack Channels

Make sure these channels exist and the bot is invited to each:

```
#exec-pm
#marketing
#content
#jobs
#research
#it
```

**Note:** `#it` is where the CTO agent posts dev/GitHub updates for transkrybe and other projects.

To invite the bot: in each channel, type `/invite @YourBotName`

---

## Part 2 — GitHub Token

1. Go to https://github.com/settings/tokens/new
2. Name: `jesse-agents-github`
3. Expiration: No expiration (or 1 year)
4. Scopes: Just `repo` (read access to public/private repos)
5. Generate and copy the token

---

## Part 3 — Railway Deployment

### 3a. Deploy from GitHub (recommended)

1. Push this repo to GitHub
2. https://railway.app → New Project → Deploy from GitHub repo
3. Select this repository
4. Set Root Directory: `slack-agents`

### 3b. Add environment variables

```
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-level-token
ANTHROPIC_API_KEY=sk-ant-your-key
GITHUB_TOKEN=ghp-your-github-token
NODE_ENV=production
```

### 3c. Add a persistent volume

1. Railway dashboard → your service → **Volumes**
2. **Add Volume**
3. Mount path: `/data`
4. Add env Var: `RAILWAY_VOLUME_MOUNT_PATH=/data`

### 3d. Deploy

Railway auto-deploys on push. You should see in logs:

```
✅ State loaded
━ All 6 agents initialized
🤖 Jesse Stay Slack Agents v2 — LIVE via Socket Mode
```

---

## Part 4 — Verify

1. In #exec-pm, type `@YourBot hello` → you should get a response
2. Run `/health` in any channel to see agent status
3. Check Railway logs for the startup banner

---

## Part 5 — Vikunja Task Management

Every team member gets their own Vikunja account. Agents can create tasks,
assign them, and be assigned tasks. **Exec PM owns the board**: every
delegation is auto-tracked as a task owned by the receiving agent, and Exec PM
triages the board every weekday morning — escalating overdue work, assigning
unassigned work, and prioritizing by **revenue impact** (work that makes the
company money comes first).

Until this part is done, task tracking is a silent no-op and Slack works normally.

### 5a. Get a Vikunja instance

Use Vikunja Cloud (https://vikunja.io) or self-host it. You need the instance
URL, e.g. `https://tasks.yourdomain.com`.

### 5b. Create one user per agent

As admin, create these users (usernames are suggestions — the mapping in 5f is
what matters):

```
exec-pm, cmo, cco, cro, cfo, cto, cuxo, lawyer, jobcoach, facebook-expert
```

### 5c. Create API tokens

Each agent should have its own API token so actions are attributed correctly.
Two options:

- **Recommended:** log in as each agent → Settings → API Tokens → create a
  token with permissions for projects, tasks, labels, task assignees, and
  comments. Set as `VIKUNJA_TOKEN_<AGENTID>` (e.g. `VIKUNJA_TOKEN_CMO`).
- **Quick start:** create one token as admin with the same permissions and set
  it as `VIKUNJA_TOKEN` — every agent falls back to it when its own token is
  missing.

### 5d. Create the team project

Create a project called `MACF Team` (or per-team projects if you prefer).
Note its numeric project ID (visible in the project URL or via the API).

### 5e. Add environment variables

```
VIKUNJA_URL=https://tasks.yourdomain.com
VIKUNJA_PROJECT_ID=3
VIKUNJA_TOKEN=tk_shared_fallback_token
# Per-agent tokens (recommended; each falls back to VIKUNJA_TOKEN)
VIKUNJA_TOKEN_EXECPM=tk_...
VIKUNJA_TOKEN_CMO=tk_...
# ... one per agent
# Per-agent Vikunja user IDs (from Administration → Users)
VIKUNJA_USER_EXECPM=1
VIKUNJA_USER_CMO=2
# ... one per agent
```

### 5f. How it works

- **Auto-tracking:** every `[from: A → B]` delegation dispatched through the
  relay becomes a Vikunja task owned by B (short acks like "On it." are
  skipped). Check the Railway logs for `[tasks]` lines.
- **Triage:** weekdays at 8:30am MT, Exec PM escalates overdue tasks, assigns
  ownerless tasks by keyword (see `TASK_ROUTING` in `config.js`), bumps
  revenue-impacting work to high priority, and posts a summary in #management.
- **Slash commands:** `/tasks` lists open tasks, `/triage` runs triage on demand.

---

## Part 6 — Direct Messages

Like a real human team, DMs are available wherever they'd be normal:

- **Teammate ↔ teammate:** private 1:1s and small huddles are allowed and
  normal. The private channel between agents is the `[from: X → Y]`
  delegation format — it never posts to a channel, so it works exactly like
  a DM.
- **Jesse → anyone:** Jesse (investor + chairman of the board, the end user)
  may DM any team member directly, and each member responds when that happens.
  DM the bot with no prefix → the **CEO-role holder** (currently Exec PM)
  answers; prefix with `@cmo`, `@facebook-expert`, `cco:` … → that agent
  answers directly in the DM. Agents reply **in the DM** — nothing leaks into
  channels.
- **Anyone → Jesse:** only the **CEO-role holder** may initiate direct
  communication with Jesse, including DMs. Team members who need something
  from Jesse route through the PM/CEO — and only after they're sure the team
  can't resolve it without his input.

The CEO role is assigned in `config.js` (`CEO_AGENT_ID`, currently `'execPM'`)
and can be reassigned by changing that one constant.

### Setup (all in the Slack app dashboard)

1. **Scopes** (Part 1b): `im:write`, `mpim:write`, `im:history` must be granted
   (alongside the already-listed `im:read`). Reinstall the app after adding.
2. **Events** (Part 1c): subscribe to `message.im` and `message.mpim`.
3. No channel invites needed — DMs just work once the bot is installed.

### Notes

- DMs arrive stamped with the agent's persona (name + icon), same as channel posts.
- `conversations.open` results are cached, so repeated DMs don't re-open channels.
- Only the CEO-role holder can DM Jesse proactively — `dmJesse()` in
  `utils/dm.js` enforces this in code (returns null for anyone else).

---

---

## Agent Schedule Reference

| Agent | Trigger | Schedule |
|---|---|---|
| Exec PM | Morning briefing | 8am MT daily |
| Exec PM | Health check | Every 2 hours |
| Marketing | GoFundMe poll | Every 30 minutes |
| Marketing | Weekly calendar | Mondays 9am MT |
| Marketing | Daily nudge | Weekdays 9:30am MT |
| CTO | GitHub poll | Every 15 minutes |
| CTO | Daily dev summary | Weekdays 9am MT |
| Content | Daily draft | Weekdays 10am MT + Sat |
| Content | Weekly roundup | Fridays 4pm MT |
| Jobs | Job search | Every 6 hours |
| Jobs | Weekly pipeline | Fridays 3pm MT |
| Research | Proactive research | Tues + Fri 10am MT |
| Research | Deep dive | Mondays 2pm MT |

---

## Troubleshooting

**"Missing required environment variables"** — Check Railway Variables tab

**Bot isn't responding** — Make sure bot is invited: `/invite @BotName`

**GoFundMe parsing fails** — Check logs for `[gofundme]` errors. Parser has 3 fallback strategies.

**GitHub polling shows no commits** — Check that `GITHUB_TOKEN` has `repo` scope.

**Railway keeps restarting** — Check logs for startup errors - usually a missing env var or Slack token.

---

## Local Development

```bash
cp .env.example .env
# Fill in .env with real values
npm install
npm run dev
```

---

## Part 7 — End-user communication standard

### DM channels

A "DM channel" is any direct line between the end user and a member, or between
members. The MACF recognizes three, and **all follow the same DM rules**
(Part 6):

- **Slack DMs** — `message.im` / `message.mpim` via this repo's bot.
- **Muse chat** — the user's conversation with the assistant. The assistant
  speaks here as the team's consolidated voice.
- **Claude dispatch** — any Claude-initiated handoff that reaches the end user:
  subagent reports, scheduled-job deliveries, background task results.

Rules on every channel: the end user may reach any member and every member
responds; only the CEO-role holder initiates direct end-user contact; teammates
may DM each other whenever it would be normal on a human team.

### Request format — Google's developer documentation framework

**Automate first — operators, not askers.** Before writing steps for the end
user, the team does the task itself whenever possible: browser automation with
vault-stored auth (Jesse authenticates once; the team keeps the auth and
acts), APIs, its own access. Step-by-step instructions are the fallback
**only** for what truly needs his human hands.

When steps are genuinely needed, every request the team makes *of* the end
user, on any DM channel, is a single consolidated step-by-step message:

1. **Goal** — one line: what this accomplishes and why.
2. **Prerequisites** — everything needed before step 1 (access, accounts,
   decisions only the end user can make).
3. **Numbered steps** — one imperative action per step ("Open…", "Add…",
   "Tell me…"), each with its expected outcome so success is verifiable.
4. **If stuck** — what to do when a step fails.
5. **One message per need** — never scatter asks across messages, channels,
   or members.
6. **Links, not hunts** — whenever a step asks the end user to open something
   or go somewhere, include the direct link (or a button/widget where the
   channel supports one) so the action is one tap.

This is the standard for all end-user communication in the MACF. It is also
injected into every agent's system prompt (`HUMAN_VOICE` in `config.js`), and
the recognized channels are declared as `DM_CHANNELS` in `config.js`.

---

## Part 8 — The CEO role

### Succession

The CEO role is held by the first **available** holder in this chain, and the
holder acts as CEO across **all** DM channels (Slack, Muse, Claude dispatch).
Declared as `CEO_SUCCESSION` in `config.js`; the current holder is
`ACTING_CEO_ID`.

1. **Claude Dispatch** — the default CEO.
2. **Jarvis Jr. (Muse channel)** — acts as CEO while Claude Dispatch is down.
3. **Exec PM** — the in-Slack CEO voice; default fallback when neither of the
   above is available. (`CEO_AGENT_ID` stays as the in-Slack authorized voice
   for end-user contact — Slack code paths key off it.)

As of 2026-09-20, Claude Dispatch is down and **Jarvis Jr. is the acting CEO**.

### Charter

Whoever holds the CEO role leads with the judgment, skills, and knowledge of a
world-class CEO (`CEO_CHARTER` in `config.js`, injected into the in-Slack CEO
voice):

- Own every outcome: every thread of work has an owner, a deadline, and a
  definition of done.
- Prioritize ruthlessly: revenue first, leverage second, everything else after.
- Decide with incomplete information; reversible calls go fast.
- Unblock the team same-day; put the best agent on the highest-leverage work.
- One voice to the board: all end-user communication consolidated and
  step-by-step through the CEO. No surprises for the investor/chairman.
- **Hard boundaries (override everything):** nothing is sent, saved, bought,
  published, or committed on Jesse's accounts without his explicit approval.
  Drafts stay drafts. The CEO proposes; Jesse disposes. No spend without
  approval, ever.

### What the CEO can and cannot delegate in Slack

- **App scopes / permissions: cannot be delegated.** Only a human workspace
  admin can add scopes or reinstall the app, in the dashboard. There is no API
  and no workaround — Slack requires human admin approval by design, so the
  bot can never grant itself permissions. Mitigation: the CEO watches for
  missing scopes and sends a one-tap step-by-step (direct links) the moment a
  new one is needed.
- **Channel invites: delegable with one scope.** Any full workspace member can
  already invite people to public channels. For the bot to invite on a
  member's behalf, the app needs the `channels:manage` scope (one-time admin
  add + reinstall) — then any member persona can invite through the bot.
- **Workspace invites (new people): admin-only**, same as scopes.
- **Personas can't hold distinct admin roles.** The ten members are personas
  of one bot user — admin is all-or-nothing at the bot level, so admin stays
  with trusted humans.

---

## Part 9 — The 24/7 Work Engine (`engine/workEngine.js`)

The team's muscle. This is **not** a cron job or a scheduled task — it is an
in-process service loop that starts with the bot (`workEngine.init(app)` in
`index.js`) and runs every `WORK_ENGINE_CYCLE_MIN` minutes (default 30, first
cycle 90s after boot). Wherever the bot runs at boot, the team keeps working:
on the desktop via the `macf-slack-runtime` scheduled task (logon trigger →
`run_task.cmd` → `node index.js`), or on Railway via the Procfile.

Each cycle, the engine:

1. **Pulls the board** — lists open Vikunja tasks, highest priority first.
2. **Pings Jesse immediately** (one DM per cycle, CEO-role holder only) for
   tasks the team cannot do: his logins, approvals, payments. First sighting
   pings; re-pings only when time-critical and 24h+ since the last ping.
   Tasks marked held/parked/guardrail (e.g. HOLD-001) are dormant — never
   pinged, never worked.
3. **Works the top actionable task** — routes it to the owning persona via
   `TASK_ROUTING`, generates the deliverable with that persona's system
   prompt, posts it to the persona's channel, and comments the Vikunja task.
   A task is marked done only when the deliverable fully satisfies it with no
   Jesse approval needed; otherwise it stays open with a status comment.
   Tasks are revisited after a cooldown (6h, 2h for high priority).
4. **Idle mode** — when nothing is actionable, the engine invents one
   revenue/improvement proposal (max 1 per 12h), posts it to #management, and
   creates a Vikunja task for it so the board refills. Draft-only, always.

Hard boundaries are injected into every work prompt: nothing is ever sent,
published, bought, or charged without Jesse's explicit approval.

**Env knobs:** `WORK_ENGINE_ENABLED=1` (set 0 to disable), `WORK_ENGINE_CYCLE_MIN`,
`WORK_ENGINE_COOLDOWN_H`, `WORK_ENGINE_IDLE_PROPOSAL_H`.

**Manual trigger:** `/engine` in Slack runs one cycle on demand.

**Vikunja caution (learned 2026-09-25):** Vikunja v2.6.0's `POST /tasks/{id}`
*replaces* the whole task — a partial POST silently wipes omitted fields like
`description`. Always use `utils/vikunja.js` `updateTask`/`completeTask`
(which GET + merge + POST); never raw-POST partial fields.
