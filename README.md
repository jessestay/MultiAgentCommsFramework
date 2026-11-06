# Multi-Agent Communications Framework (MACF)

**A 24/7 AI executive team that runs real business operations on your own infrastructure — and is only allowed to call something done when the outcome verifies at the source.**

MACF is a persistent team of named AI agents with real roles that works around the clock the way a staffed company would: work is assigned as tickets, executed by the responsible agent, receipted, and audited against verified outcomes. You are the chairman. You make only the decisions only you can make; the team does the rest, and proves it. The same team — same personalities, memory, and skills — meets you on Slack, in Cursor, in Claude Desktop, or in any MCP-compatible assistant.

**Why MACF:**

- **LLM-agnostic.** Bring your own models: local models (LM Studio / Ollama-class), subscription AI apps, OpenRouter, or direct provider APIs. Routing is budget-first — cheap work defaults to local models, reasoning defaults to the most capable model you have connected. Swap or add models without touching the team's roles, memory, or tools. A zero-API-budget instance still runs on local models alone.
- **Repeats.** Standing loops that do the recurring work: scheduled agent routines, per-agent or team-wide, optionally emulating a named expert's framework (a Lou Adler lens for hiring, a Neil Patel lens for SEO, and other expert lenses wired into the roles). Every Repeat runs under a resource governor that yields to direct work, keeps a learning ledger of actions and conversions (each run must do measurably better), and swaps personas champion/challenger only on tracked wins. Repeats are data — clone them to new roles, sites, and businesses.
- **MCP-native, extensible by configuration.** Tools arrive as MCP servers through a grants system: a baseline set unioned into every agent, role grants on top, and gated tools (payments, desktop control, finance) behind explicit owner decisions. Adding capability means granting an MCP server, building a custom MCP tool, or adding a skill or an action — never rebuilding the team.
- **Accountability you can audit.** Agents cannot mark their own work done. Every tool call writes a receipt, a task closes only when its postconditions verify, and a recurring outcome audit counts only verified deliveries: a portal confirmation, a live URL, a changed page, a send reference. Activity is not delivery.
- **Managed like a real scrum team.** Every unit of work is a user story ("As a ...") with acceptance criteria and a difficulty score, built BDD-first, then TDD, with automated tests running on a schedule.
- **Owner-controlled.** Nothing external — a send, a post, a purchase, a filing — happens outside your approval rules. It runs on your infrastructure (a free-tier instance is enough), so your data, your memory, and your audit trail stay yours.

The full definition — every function, the outcome that counts for each, and the verification standard the system is audited against — lives in [MACF-DEFINITION-AND-VERIFICATION-SPEC.md](MACF-DEFINITION-AND-VERIFICATION-SPEC.md).

---

## The Team

- **CEO** — runs the company day to day, verifies the team's work, and brings the chairman only the decisions that are his
- **Exec PM** — routing and coordination across the team
- **CTO** — engineering, infrastructure, tooling
- **CMO** — marketing strategy, campaigns, social content
- **CCO** — content drafting (always for your review, never auto-publishes)
- **CRO** — research, competitive intelligence, trends
- **CFO** — financial tracking, metrics, strategy (not a CPA)
- **Lawyer** — legal risk, contracts, compliance (guidance only, not representation)
- **Job Coach** — executive job search strategy, pipeline, applications
- **SEO Expert** — search and AI-visibility audits turned into changed pages
- **CUXO** — UX/design review, accessibility audits

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
- An LLM backend of your choice: a local model server, an OpenRouter key, an Anthropic or Perplexity API key, or a subscription AI app (see Swappable Backends)

### Run the Slack Bot

```bash
git clone https://github.com/jessestay/MultiAgentCommsFramework.git
cd MultiAgentCommsFramework
cp .env.example .env   # fill in your chosen LLM backend credentials, SLACK_BOT_TOKEN, SLACK_APP_TOKEN
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
| `ANTHROPIC_API_KEY` | required for the `anthropic` backend | Anthropic Claude API key |
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
