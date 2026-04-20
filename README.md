# Multi-Agent Communications Framework (MACF)

**An open-source toolkit for running a persistent AI team across Slack, Cursor, Claude Desktop, and any MCP-compatible coding assistant.**

Your agents share the same personalities, memory, and skills regardless of where you talk to them — Slack on your phone, Cursor in your IDE, or Claude Desktop on your laptop. Same team, same context, different surfaces.

---

## What It Does

MACF gives you a coordinated team of AI agents that actually work together:

- **Exec PM** — your single point of contact. Routes everything, aggregates responses, never redirects you to another agent
- **CMO** — marketing strategy, GoFundMe/campaign management, social content
- **CCO** — content drafting (always for your review, never auto-publishes)
- **CRO** — research, competitive intelligence, trends
- **CFO** — SaaS metrics, financial strategy, burn rate (not a CPA)
- **Lawyer** — legal risk, GDPR/CCPA, IP (guidance only, not representation)
- **Job Coach** — executive job search strategy, pipeline review
- **CUXO** — UX/design review, accessibility audits

You only ever talk to Exec PM. Everything else happens behind the scenes.

---

## Architecture

Three layers, each independently swappable:

```
┌─────────────────────────────────────────────────────┐
│              PLATFORM ADAPTERS                       │
│  Slack app  │  MCP server  │  Discord  │  Teams  │…  │
├─────────────────────────────────────────────────────┤
│                   CORE LAYER                         │
│  Agent definitions  │  AI backends  │  Memory        │
└─────────────────────────────────────────────────────┘
```

- **`core/`** — platform-agnostic agent definitions, AI backend factory, memory backend factory
- **`adapters/mcp/`** — MCP server for Cursor, Claude Code, Claude Desktop, GitHub Copilot Chat (VS Code)
- **`slack-agents/`** — production Slack app (Railway/Bolt Socket Mode)

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.

---

## Quick Start

### Prerequisites
- Node.js 18+
- Anthropic API key

### Run the Slack Bot

```bash
git clone https://github.com/jessestay/MultiAgentCommsFramework.git
cd MultiAgentCommsFramework
cp .env.example .env   # fill in ANTHROPIC_API_KEY, SLACK_BOT_TOKEN, SLACK_APP_TOKEN
npm run start:slack
```

### Add to Cursor / Claude Code / Claude Desktop

```bash
cd adapters/mcp && npm install
```

**Claude Code:**
```bash
claude mcp add macf-team -- node /path/to/MultiAgentCommsFramework/adapters/mcp/index.js
```

**Cursor or Claude Desktop** (`~/.cursor/mcp.json` / `~/.claude.json`):
```json
{
  "mcpServers": {
    "macf-team": {
      "command": "node",
      "args": ["/path/to/MultiAgentCommsFramework/adapters/mcp/index.js"],
      "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
    }
  }
}
```

**GitHub Copilot Chat in VS Code** (`.vscode/mcp.json` in your workspace):
```json
{
  "servers": {
    "macf-team": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/MultiAgentCommsFramework/adapters/mcp/index.js"],
      "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
    }
  }
}
```

See [SETUP.md](SETUP.md) for the full setup guide including shared memory, Railway deployment, and adding GitHub secrets for the live smoke test.

---

## Swappable Backends

**AI backend** — set `AI_BACKEND` in your `.env`:
- `anthropic` (default) — Claude via Anthropic API
- `perplexity` — Perplexity Sonar (drop-in, same interface)
- Add your own: create `core/ai/<vendor>.js` implementing `generateReport()` + `chat()`

**Memory backend** — set `MEMORY_BACKEND`:
- `filesystem` (default) — local JSON files, works on Railway volumes
- `upstash` — HTTP Redis for shared memory across Railway (Slack) + local (Cursor) simultaneously
- `sqlite` — multi-process single-machine

---

## Shared Memory Across Platforms

With Upstash Redis, your Slack bot and Cursor MCP server read the same agent state:

```
Railway (Slack)          Your laptop (Cursor)
      │                         │
      └──────────┬──────────────┘
                 ▼
        Upstash Redis (HTTP)
        macf:{agentId}:{key}
```

Set `MEMORY_BACKEND=upstash` and the same `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` on both. The Exec PM your Slack bot knows is the same one your Cursor IDE knows.

---

## CI / Quality

- **Unit tests** — `npm test` in `slack-agents/`, runs on every PR
- **Live smoke test** — after every push to `main`, a GitHub Action waits for Railway to deploy, sends a real Slack message, and verifies the bot responds

See [SETUP.md](SETUP.md) for adding the required GitHub secrets.

---

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | required | Anthropic Claude API key |
| `SLACK_BOT_TOKEN` | required for Slack | `xoxb-...` OAuth token |
| `SLACK_APP_TOKEN` | required for Slack | `xapp-...` Socket Mode token |
| `AI_BACKEND` | `anthropic` | `anthropic` or `perplexity` |
| `ANTHROPIC_MODEL` | `claude-opus-4-5` | Model override |
| `MEMORY_BACKEND` | `filesystem` | `filesystem`, `upstash`, or `sqlite` |
| `UPSTASH_REDIS_REST_URL` | — | Required for `upstash` backend |
| `UPSTASH_REDIS_REST_TOKEN` | — | Required for `upstash` backend |

---

## License

MIT — free to use, modify, and run your own instance.

## Author

Built by [Jesse Stay](https://staynalive.com). Contributions welcome — see [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together.
