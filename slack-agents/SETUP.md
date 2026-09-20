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

Like a real human team, any member can DM Jesse 1:1 (or start a small group DM)
when a conversation is private and an @mention in a channel is too much —
an unapproved draft, a sensitive question, a quiet heads-up. Agents never DM
each other (they share one process and use the delegation format instead).

### How Jesse uses it

- **DM the bot** with no prefix → **Exec PM** answers (Jesse's single point of contact).
- **DM the bot** starting with `@cmo`, `@facebook-expert`, `cco:` … → that
  agent answers directly in the DM.
- Agents reply **in the DM thread** — nothing leaks into channels.

### Setup (all in the Slack app dashboard)

1. **Scopes** (Part 1b): `im:write`, `mpim:write`, `im:history` must be granted
   (alongside the already-listed `im:read`). Reinstall the app after adding.
2. **Events** (Part 1c): subscribe to `message.im` and `message.mpim`.
3. No channel invites needed — DMs just work once the bot is installed.

### Notes

- DMs arrive stamped with the agent's persona (name + icon), same as channel posts.
- `conversations.open` results are cached, so repeated DMs don't re-open channels.
- An agent can also DM Jesse proactively (e.g. something truly urgent) — the
  helper is `dmJesse()` in `utils/dm.js`, using the `JESSE_SLACK_ID` in `config.js`.

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
