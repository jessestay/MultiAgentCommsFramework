# MACF Slack Agents — Multi-Agent Slack System

A production-ready, multi-agent Slack bot system built on the [Multi-Agent Communications Framework (MACF)](https://github.com/jessestay/MultiAgentCommsFramework). Six autonomous AI agents — each as a separate Slack app — collaborate across dedicated channels, powered by Claude claude-sonnet-4-6 and deployed to Vercel serverless.

**Live deployment:** `https://jesse-slack-agents.vercel.app`

---

## Architecture

```
Slack Workspace (Stay N Alive)
  │
  ├── #exec-pm       → 📋 staynalive-exec-pm    (executive coordination, task routing)
  ├── #marketing     → 📣 staynalive-marketing   (campaigns, social, growth)
  ├── #transkrybe    → 🎵 staynalive-transkrybe  (sheet music, audio/music ops)
  ├── #content       → ✍️  staynalive-content     (blog posts, copywriting)
  ├── #jobs          → 💼 staynalive-jobs         (job listings, recruiting)
  └── #research      → 🔍 staynalive-research     (research, analysis)
         │
         ▼
  Vercel Serverless (jesse-slack-agents.vercel.app)
    /api/slack/events   ← All 6 apps send events here
    /api/slack/actions  ← Approval buttons
    /api/cron/*         ← Scheduled proactive tasks
         │
         ▼
  Claude claude-sonnet-4-6 (Anthropic API)
  + GitHub State (jessestay/jesse-ops › state/agent_state.json)
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single `/api/slack/events` endpoint for all 6 apps | Simplifies infrastructure; routing handled by channel name |
| Process event BEFORE `res.json()` | Vercel terminates functions after response — async work after `res.json()` is silently killed |
| Per-agent Slack bot tokens | Each app posts as its own identity; clean Slack audit trail |
| `channels:history` scope | Provides recent conversation context to Claude for memory continuity |
| `chat.write.customize` scope | Allows posting with custom username/emoji even with single token (fallback) |
| GitHub for state persistence | Simple, auditable, no database needed |

---

## Slack Apps

Each agent is a separate Slack app installed in the workspace:

| Agent | App ID | Channel | Slack App Name |
|-------|--------|---------|----------------|
| exec-pm | A0ASXQGAABY | #exec-pm | staynalive-exec-pm |
| marketing | A0ASWGAE2SZ | #marketing | staynalive-marketing |
| transkrybe | A0ASJHWUXNK | #transkrybe | staynalive-transkrybe |
| content | A0AT03D6SAW | #content | staynalive-content |
| jobs | A09BTNCVB0C | #jobs | staynalive-jobs |
| research | A0ASWLYUEFP | #research | staynalive-research |

Each app has these OAuth scopes:
```
app_mentions:read
channels:history
channels:read
chat:write
chat:write.customize
reactions:write
users:read
```

And subscribes to these events:
```
app_mention
message.channels
```

Event Subscriptions URL (same for all apps):
```
https://jesse-slack-agents.vercel.app/api/slack/events
```

---

## Source Code Structure

```
source/
├── api/
│   ├── slack/
│   │   ├── events.js      # Main event handler — routes @mentions to agents
│   │   └── actions.js     # Block actions (approve/revise buttons)
│   ├── health.js          # Health check endpoint
│   └── cron/
│       ├── morning-briefing.js    # Daily morning briefing (exec-pm)
│       ├── weekly-content.js     # Weekly content ideas
│       ├── weekly-jobs.js        # Weekly jobs roundup
│       └── weekly-transkrybe.js  # Weekly music/audio update
├── agents/
│   ├── exec-pm.js     # Executive PM — coordination hub
│   ├── marketing.js   # Marketing strategy & campaigns
│   ├── transkrybe.js  # Music/audio intelligence
│   ├── content.js     # Content creation
│   ├── jobs.js        # Jobs & recruiting
│   └── research.js    # Research & analysis
├── lib/
│   ├── slack.js       # Slack API utilities, per-agent token routing
│   ├── claude.js      # Anthropic Claude API wrapper
│   └── state.js       # GitHub-based state persistence
├── package.json
└── vercel.json        # Serverless config with cron schedules
```

---

## Quick Setup / Installation

### Prerequisites
- Node.js 18+
- Vercel account
- Anthropic API key
- Slack workspace (admin access to create apps)

### Step 1 — Create 6 Slack Apps

For each agent, create a Slack app at https://api.slack.com/apps/new using the App Manifest approach.

App Manifest template (substitute `AGENT_NAME`, `CHANNEL_NAME`, `YOUR_VERCEL_URL`):

```yaml
display_information:
  name: staynalive-AGENT_NAME
  description: MACF AI agent for CHANNEL_NAME operations
  background_color: "#1a1a2e"
features:
  bot_user:
    display_name: AGENT_NAME Bot
    always_online: true
oauth_config:
  scopes:
    bot:
      - app_mentions:read
      - channels:history
      - channels:read
      - chat:write
      - chat:write.customize
      - reactions:write
      - users:read
settings:
  event_subscriptions:
    request_url: YOUR_VERCEL_URL/api/slack/events
    bot_events:
      - app_mention
      - message.channels
  interactivity:
    is_enabled: true
    request_url: YOUR_VERCEL_URL/api/slack/actions
  org_deploy_enabled: false
  socket_mode_enabled: false
```

Individual manifests for each app are in the `manifests/` directory.

### Step 2 — Deploy to Vercel

```bash
cd source/
npm install
npx vercel login
npx vercel deploy --prod
```

### Step 3 — Set Environment Variables

In Vercel dashboard → Project Settings → Environment Variables:

```
ANTHROPIC_API_KEY=sk-ant-...

# Per-agent Slack bot tokens (from each app's Install App page)
SLACK_TOKEN_EXEC_PM=xoxb-...
SLACK_TOKEN_MARKETING=xoxb-...
SLACK_TOKEN_TRANSKRYBE=xoxb-...
SLACK_TOKEN_CONTENT=xoxb-...
SLACK_TOKEN_JOBS=xoxb-...
SLACK_TOKEN_RESEARCH=xoxb-...

# Optional: signing secret for request verification (recommended for production)
SLACK_SIGNING_SECRET=...

# Optional: GitHub token for state persistence
GITHUB_TOKEN=ghp_...
```

### Step 4 — Install Each App

For each Slack app:
1. Go to https://api.slack.com/apps/APP_ID/install-on-team
2. Click "Install to Workspace" / "Allow"
3. Copy the Bot User OAuth Token → paste into Vercel env var

### Step 5 — Invite Bots to Channels

In each Slack channel, type:
```
/invite @staynalive-exec-pm
/invite @staynalive-marketing
... etc
```

Or invite all to their respective channels.

### Step 6 — Verify Event Subscriptions

For each app, confirm the Request URL shows ✅ Verified:
- https://api.slack.com/apps/APP_ID/event-subscriptions

---

## Usage

### Talking to an Agent

Mention the bot in its channel:
```
@staynalive-exec-pm what's the plan for this week?
```

### Cross-Channel Routing

From any channel, prefix messages to route to a specific agent:
```
marketing: write a tweet about our new feature
content: draft a blog post about AI trends
research: find recent news about Anthropic
```

### Approval Workflow

Agents can post ✅/❌ buttons for Jesse to approve or request revision on drafts.

---

## Cowork Integration

Claude Cowork (desktop AI assistant) can communicate with these Slack agents through:

1. **`#cowork-tasks` channel** — Cowork posts tasks here, exec-pm picks them up
2. **Direct Slack API** — Cowork has the Slack MCP connector and can message any channel
3. **Agent-to-agent** — The `agentToAgent()` function in `lib/slack.js` enables bot-to-bot messaging

Pattern for Cowork → Slack agents:
```
Cowork → posts to #cowork-tasks → exec-pm agent reads & routes → responds back
```

---

## State Persistence

Agents store persistent state in GitHub:
- **Repo:** `jessestay/jesse-ops`
- **File:** `state/agent_state.json`
- **Env var required:** `GITHUB_TOKEN`

Without `GITHUB_TOKEN`, agents still work — they just start fresh each conversation.

---

## Scheduled Tasks (Cron)

Configured in `vercel.json`:

| Schedule | Handler | Purpose |
|----------|---------|---------|
| `0 9 * * 1-5` | `morning-briefing` | Daily 9am briefing in #exec-pm |
| `0 10 * * 1` | `weekly-content` | Monday content ideas in #content |
| `0 10 * * 2` | `weekly-jobs` | Tuesday jobs roundup in #jobs |
| `0 10 * * 3` | `weekly-transkrybe` | Wednesday music update in #transkrybe |

---

## Security Notes

- **Signing Secret:** Set `SLACK_SIGNING_SECRET` to verify requests are genuinely from Slack. Currently disabled (empty) for debugging — re-enable for production.
- **Tokens:** Never commit bot tokens to git. Use Vercel environment variables only.
- **Deduplication:** Event IDs are tracked in-memory to prevent double-processing Slack retries.

---

## Troubleshooting

### Bot not responding to @mentions

1. Check Event Subscriptions are enabled and URL shows ✅
2. Check bot is invited to the channel (`/invite @bot-name`)
3. Check Vercel logs: `vercel logs jesse-slack-agents`
4. Verify `ANTHROPIC_API_KEY` and token env vars are set
5. Check signing secret — if verification fails, set `SLACK_SIGNING_SECRET=""` to disable temporarily

### "Missing scope" errors

Re-install the app after adding scopes. The new scopes only take effect after reinstallation.

### Vercel function timing out / silent failures

The event handler processes the message BEFORE sending `res.status(200).json({ok:true})`. If you ever see the bot not responding but no errors, verify `processEvent(body)` is called BEFORE `res.json()` — Vercel terminates the function as soon as the response is sent.

---

## Contributing / AI Agent Onboarding

This project is designed to be AI-agent-friendly. See `.cursorrules` for the complete Cursor AI setup. Key conventions:

- Each agent file exports `{ handleMessage(text, context) }`
- `context` always includes `{ channel, channelId, thread_ts, userName, history }`
- `history` is an array of recent messages for conversation continuity
- Use `postAsAgent(agentKey, channel, text)` from `lib/slack.js` to post messages
- Agent keys: `exec-pm`, `marketing`, `transkrybe`, `content`, `jobs`, `research`

---

*Part of the [Multi-Agent Communications Framework](https://github.com/jessestay/MultiAgentCommsFramework) by Jesse Stay*
