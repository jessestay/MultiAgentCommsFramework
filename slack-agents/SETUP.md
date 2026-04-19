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
mpim:read
reactions:read
commands
app_mentions:read
```

If you added scopes, click **Reinstall to Workspace**.

### 1c. Required Event Subscriptions

In **Event Subscriptions**:
- Toggle **Enable Events** → ON
- Under **Subscribe to bot events**, add:
  - `app_mention`
  - `message.channels`
  - `message.groups`
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
