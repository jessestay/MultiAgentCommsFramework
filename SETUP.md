# Setup Guide

Everything you need to run MACF — Slack bot on Railway, MCP server in your IDE, shared memory, live smoke tests, and removing stale bots.

---

## 1. Clone & Configure

```bash
git clone https://github.com/jessestay/MultiAgentCommsFramework.git
cd MultiAgentCommsFramework
cp .env.example .env
```

Fill in `.env`:

```env
# Required for all adapters
ANTHROPIC_API_KEY=sk-ant-...

# Required for the Slack bot
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...

# Optional — defaults shown
AI_BACKEND=anthropic
ANTHROPIC_MODEL=claude-opus-4-5
MEMORY_BACKEND=filesystem

# Required only for shared cross-platform memory (Upstash)
# UPSTASH_REDIS_REST_URL=https://...
# UPSTASH_REDIS_REST_TOKEN=...
```

---

## 2. Slack App Setup

### Create the Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name it (e.g. "MACF Agents"), pick your workspace
3. **Socket Mode** (left sidebar) → Enable Socket Mode → Generate an App-Level Token with `connections:write` scope → this is your `SLACK_APP_TOKEN` (`xapp-...`)
4. **OAuth & Permissions** → Bot Token Scopes — add:
   - `app_mentions:read`
   - `chat:write`
   - `channels:history`
   - `groups:history`
   - `im:history`
   - `mpim:history`
   - `channels:read`
   - `groups:read`
5. **Install App to Workspace** → copy the Bot User OAuth Token → this is your `SLACK_BOT_TOKEN` (`xoxb-...`)
6. **Event Subscriptions** → Enable Events → Subscribe to bot events: `app_mention`, `message.channels`
7. **Slash Commands** → create `/health`, `/briefing`, `/research`, `/content`, `/jobs`

### Invite the Bot to Your Channels

In each channel (#management, #marketing, #research, #content, #jobs, #cto):
```
/invite @YourBotName
```

The Exec PM bot posts to all channels and listens for @mentions.

### Remove Old/Duplicate Bots

If you have a stale bot (e.g. an old "Jesse Ops Agents" app) still connected:

1. Go to **Slack workspace settings** → **Manage apps** (or `[workspace].slack.com/apps`)
2. Find the old app → **Remove app**

Or as a workspace admin: **Settings & Administration** → **Manage Members** → find the bot user → remove.

Having two bots respond to the same messages creates confusing duplicate responses. Only one app should be running at a time.

---

## 3. Run Locally

```bash
npm run start:slack
```

To test a specific agent:
```bash
node -e "require('./slack-agents/agents/execPM.js')"
```

Run tests:
```bash
npm test
```

---

## 4. Deploy to Railway

### First Deploy

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select `MultiAgentCommsFramework`
3. Set environment variables in Railway dashboard (same as your `.env`)
4. Railway auto-detects Node.js. Set the **Start Command**: `npm run start:slack`
5. Optional: add a Railway volume and set `RAILWAY_VOLUME_MOUNT_PATH=/data` for persistent agent memory

### Auto-Deploy on Push

Railway watches `main` by default. Every `git push origin main` triggers a redeploy automatically. No manual action needed.

---

## 5. MCP Server — Cursor, Claude Code, Claude Desktop

The MCP adapter exposes your entire agent team as tools to any Claude-based IDE assistant.

### Install Dependencies

```bash
cd adapters/mcp && npm install && cd ../..
```

### Claude Code (CLI)

```bash
claude mcp add macf-team -- node /absolute/path/to/MultiAgentCommsFramework/adapters/mcp/index.js
```

Verify it loaded:
```bash
claude mcp list
```

### Cursor

Edit `~/.cursor/mcp.json` (create if it doesn't exist):

```json
{
  "mcpServers": {
    "macf-team": {
      "command": "node",
      "args": ["/absolute/path/to/MultiAgentCommsFramework/adapters/mcp/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "MEMORY_BACKEND": "filesystem"
      }
    }
  }
}
```

Restart Cursor. You'll see `ask_exec_pm`, `ask_cmo`, `ask_team`, etc. as available tools in Cursor chat.

### Claude Desktop

Edit `~/.claude.json`:

```json
{
  "mcpServers": {
    "macf-team": {
      "command": "node",
      "args": ["/absolute/path/to/MultiAgentCommsFramework/adapters/mcp/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "MEMORY_BACKEND": "filesystem"
      }
    }
  }
}
```

Restart Claude Desktop. The agent tools will appear in the tool picker.

### GitHub Copilot Chat (VS Code 1.99+)

Create `.vscode/mcp.json` in your workspace (or add to User settings):

```json
{
  "servers": {
    "macf-team": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/MultiAgentCommsFramework/adapters/mcp/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

In Copilot Chat, use `#macf-team` to reference the server, or just type naturally and Copilot will offer the tools when relevant. This works with VS Code's built-in MCP support (no extension needed in VS Code 1.99+).

### Other MCP-Compatible Clients

The MACF MCP server speaks standard stdio JSON-RPC as defined by the Model Context Protocol spec. Any client that supports MCP works:
- Continue.dev
- Zed editor (MCP support in progress)
- Any custom MCP client using `@modelcontextprotocol/sdk`

The config format varies by client but the `command` + `args` pattern is universal.

---

## 6. Shared Memory Across Platforms (Optional)

By default each platform (Railway + local Cursor) has its own isolated memory. To share agent state across all surfaces, use the Upstash backend.

### Setup Upstash

1. Go to [upstash.com](https://upstash.com) → Create a Redis database (free tier works)
2. Copy the **REST URL** and **REST Token** from the database page

### Configure Both Deployments

In Railway environment variables:
```
MEMORY_BACKEND=upstash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

In your local MCP config (Cursor/Claude Desktop `mcp.json`):
```json
"env": {
  "ANTHROPIC_API_KEY": "sk-ant-...",
  "MEMORY_BACKEND": "upstash",
  "UPSTASH_REDIS_REST_URL": "https://...",
  "UPSTASH_REDIS_REST_TOKEN": "..."
}
```

Now the same agent state is shared across your Slack bot (Railway) and your local IDE (Cursor/Claude Desktop). The Exec PM your Slack bot knows is the same Exec PM your Cursor knows.

---

## 7. Live Smoke Test (CI/CD)

After every push to `main`, a GitHub Action automatically:
1. Waits 2 minutes for Railway to finish deploying
2. Sends a test ping to your #management channel
3. Waits 30 seconds
4. Verifies the bot replied
5. Posts a pass/fail result back to Slack

### Required: Update Your GitHub PAT

The smoke test workflow file requires a Personal Access Token with `workflow` scope.

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Find the token you use for this repo → Edit → check the **workflow** box → Save
3. Update the remote in your local clone if needed:
   ```bash
   git remote set-url origin https://<NEW_TOKEN>@github.com/jessestay/MultiAgentCommsFramework.git
   ```
4. Then push the workflow files:
   ```bash
   cd /path/to/MultiAgentCommsFramework
   git add .github/workflows/smoke-test.yml .github/workflows/slack-agents-ci.yml
   git commit -m "ci: add smoke test and unit test workflows"
   git push origin main
   ```

### Required: Add GitHub Secrets

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret name | Value |
|---|---|
| `SLACK_BOT_TOKEN` | Your bot's `xoxb-...` token |
| `SLACK_MANAGEMENT_CHANNEL_ID` | `C0ASH4TF604` (your #management channel ID) |

---

## 8. Swapping AI Backends

Set `AI_BACKEND` in your environment:

```env
AI_BACKEND=perplexity
PERPLEXITY_API_KEY=pplx-...
```

Or add a new backend:
1. Create `core/ai/<vendor>.js` with these exports:
   ```js
   async function generateReport({ systemPrompt, context, maxTokens }) { ... }
   async function chat({ systemPrompt, userMessage, maxTokens }) { ... }
   module.exports = { generateReport, chat };
   ```
2. Add a `case` in `core/ai/interface.js`
3. Set `AI_BACKEND=<vendor>`

No agent code changes required.

---

## 9. Adding a New Platform Adapter

1. Create `adapters/<platform>/index.js`
2. Import from core:
   ```js
   const { AGENTS } = require('../../core/config');
   const memory = require('../../core/memory/index');
   const { generateReport } = require('../../core/ai/interface').createAIBackend();
   const { relay, stripDelegations } = require('../../slack-agents/utils/delegation');
   ```
3. Implement platform message receipt → call `orchestrate(agentId, message)` → send response
4. The MCP adapter (`adapters/mcp/index.js`) is the reference implementation

---

## 10. Troubleshooting

**Bot not responding in Slack**
- Check Railway logs for errors
- Verify `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` are set correctly
- Confirm Socket Mode is enabled on the app
- Make sure the bot is invited to the channel you're messaging in

**MCP tools not appearing in Cursor/Claude Desktop**
- Run `cd adapters/mcp && npm install` — the MCP SDK must be installed
- Use an absolute path in the `args` field (not `~/` — it won't expand)
- Restart the IDE after changing `mcp.json`
- Check the MCP server log: run `node adapters/mcp/index.js` manually and look for errors

**Duplicate bot responses**
- You have two Slack apps running simultaneously
- Go to **Manage apps** in your Slack workspace and remove the old one
- Only one app should be connected at a time

**Delegation lines visible in messages (`[from: X → Y]`)**
- This was fixed in commit `c92b6be` — make sure Railway has redeployed after that commit
- Check Railway dashboard → your project → latest deployment timestamp

**Health check spamming idle-channel alerts**
- Fixed in the latest commit — idle alerts are now logged only, not posted to Slack
- Real alerts (new donations, new commits) still post

**`@jesse` not tagging Jesse correctly**
- Fixed in config.js — agents now use `<@U12QFAS8L>` for real Slack tags
- Needs a Railway redeploy to take effect
