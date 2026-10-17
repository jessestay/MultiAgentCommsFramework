# Multi-Agent Claude Framework (MACF)

**Give every company a full AI team that shows up to work.**

MACF is an open-source framework for deploying persistent, collaborative AI agents across any chat platform. Each agent has a defined role, a persistent identity, and its own memory — so it behaves the same whether it's in Slack, Cursor, or any connector you build.

---

## The Problem

Most AI agent systems are stateless scripts: they receive a message, generate a response, and forget everything. They can't coordinate with each other, they can't initiate work, and they restart from zero on every call.

Real teams don't work that way. A Marketing Director doesn't forget yesterday's campaign when you message them today. An Engineering Lead doesn't need to be @mentioned to notice a build is broken. A Chief of Staff proactively queues work without being asked.

MACF is built on a different model.

---

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                   MACF Framework                    │
│                                                     │
│  ┌─────────────┐    ┌─────────────────────────┐    │
│  │  Registry   │    │    Persistence Layer     │    │
│  │             │    │                          │    │
│  │ roles/      │    │ • Agent memory (per role)│    │
│  │ exec-pm.yml │    │ • Task queue             │    │
│  │ marketing.yml│   │ • Project state          │    │
│  │ engineering.│    │ • Conversation history   │    │
│  └─────────────┘    └─────────────────────────┘    │
│         │                      │                    │
│  ┌──────▼──────────────────────▼──────────┐        │
│  │            Agent Runtime               │        │
│  │                                        │        │
│  │  loadRole(config) → SystemPrompt       │        │
│  │  handleMessage(text, context) → void   │        │
│  │  processQueue() → void                 │        │
│  │  agentToAgent(from, to, task) → void   │        │
│  └──────────────────┬─────────────────────┘        │
│                     │                               │
└─────────────────────┼───────────────────────────────┘
                      │
          ┌───────────┼───────────┐
          │           │           │
   ┌──────▼───┐ ┌─────▼────┐ ┌───▼──────┐
   │  Slack   │ │  Cursor  │ │  Future  │
   │Connector │ │Connector │ │Connectors│
   └──────────┘ └──────────┘ └──────────┘
```

### Three Layers

**1. Registry** — Agent role definitions in YAML. Not company-specific. A `marketing.yaml` role defines what a Marketing Director knows, how they communicate, and what they can do — not who they're doing it for. You bring the context.

**2. Persistence Layer** — Every agent has memory that survives between sessions: facts they've learned, tasks queued to them, and conversation history. Agents accumulate context over time exactly like a human team member would.

**3. Connectors** — Thin adapters that translate a platform's event model into MACF's runtime. The Slack connector handles webhooks, routing, and bot posting. The Cursor connector handles `.cursorrules` loading. Building a new connector means implementing one interface.

---

## Autonomous Operation

MACF agents don't just respond to messages. They work on their own.

- **Task Queue**: Any agent can queue work for any other agent via `addTask('marketing', 'draft 3 LinkedIn posts about...')`. The queue processor (a scheduled job) runs every hour and executes pending tasks automatically.

- **Proactive Dispatch**: The Executive PM runs a daily briefing that analyzes project state and automatically queues work for agents based on what's needed — no human trigger required.

- **Memory**: Agents accumulate facts between sessions. The Research Agent remembers that a company is a competitor. The Jobs Agent remembers which applications are pending. The Marketing Agent remembers what voice the owner uses.

---

## Quick Start

### Deploy the Slack Connector (10 minutes)

```bash
# Clone the repo
git clone https://github.com/jessestay/MultiAgentCommsFramework
cd MultiAgentCommsFramework

# Copy the Slack agent template
cp -r projects/slack-agents/source my-team
cd my-team

# Copy the example team config and customize it
cp ../examples/jesse-ops/agents.yaml config/agents.yaml
# Edit config/agents.yaml with your team's context

# Deploy to Vercel
vercel --prod
```

Then add your credentials to Vercel:
- `ANTHROPIC_API_KEY` — your Claude API key
- `SLACK_BOT_TOKEN` — from api.slack.com
- `SLACK_SIGNING_SECRET` — from api.slack.com → Basic Information
- `GITHUB_TOKEN` — for persistent state storage (or swap in your own persistence adapter)

### Define Your Team

Create `config/agents.yaml`:

```yaml
name: "My Company's AI Team"

owner:
  name: "Your Name"
  title: "Your Title"
  context: |
    Brief description of your company, goals, and context.
    This gets injected into every agent's system prompt.

agents:
  - role: exec-pm          # from registry/roles/exec-pm.yaml
    channel: management
    enabled: true

  - role: marketing
    channel: marketing
    enabled: true
    context: |
      Our target market is enterprise SaaS companies.
      Brand voice: direct, data-driven, no fluff.

  - role: engineering
    channel: engineering
    enabled: true

projects:
  - name: "Product Launch Q2"
    status: active
  - name: "Hiring Pipeline"
    status: active
```

That's it. The framework loads your config, hydrates the role definitions from the registry, and each agent's system prompt is automatically assembled.

---

## Repository Structure

```
MultiAgentCommsFramework/
│
├── macf/                          # Framework core
│   ├── packages/
│   │   ├── core/                  # @macf/core — runtime, registry, persistence
│   │   └── connector-slack/       # @macf/connector-slack — Slack adapter
│   ├── registry/
│   │   ├── roles/                 # Generalized role definitions (YAML)
│   │   │   ├── exec-pm.yaml
│   │   │   ├── marketing.yaml
│   │   │   ├── engineering.yaml
│   │   │   ├── content.yaml
│   │   │   ├── jobs.yaml
│   │   │   └── research.yaml
│   │   └── skills/                # Reusable skill definitions
│   └── examples/
│       ├── jesse-ops/             # Jesse Stay's team config (reference impl)
│       └── startup-team/          # Generic startup example
│
├── projects/slack-agents/         # Production Slack deployment
│   ├── manifests/                 # Slack App manifests (one per agent)
│   └── source/                    # Deployed to Vercel
│       ├── agents/                # Agent implementations
│       ├── api/                   # Vercel API routes + cron jobs
│       └── lib/                   # Slack, Claude, state utilities
│
└── rules/                         # Cursor IDE rules (existing framework)
    └── roles/                     # Per-role Cursor rules
```

---

## The Roles

The registry ships with these generalized roles:

| Role | Purpose |
|------|---------|
| `exec-pm` | Chief of staff — coordinates team, morning briefings, routes requests |
| `marketing` | Marketing strategy, campaigns, content calendar |
| `engineering` | Technical implementation, GitHub, deployments |
| `content` | Long-form writing, blog posts, social copy |
| `jobs` | Job search coordination, applications, outreach |
| `research` | Background research, competitive intel, data gathering |

Each role is platform-neutral. The Slack connector maps roles to channels. The Cursor connector maps roles to `.cursorrules` files.

---

## Adding a New Platform Connector

Implement the connector interface:

```javascript
// connector-interface.js
class MacfConnector {
  // Called when an external event (message, mention) arrives
  async onMessage(agentKey, text, context) { }
  
  // Called when an agent wants to post output
  async postMessage(agentKey, channel, text, options) { }
  
  // Called when an agent wants to notify another agent
  async agentToAgent(fromAgent, toAgent, message) { }
  
  // Start the connector (register webhooks, etc.)
  async start(agentRegistry) { }
}
```

---

## Why Open Source?

Every company should be able to run an AI team that actually works — not just a chatbot, but a coordinated system where agents remember, delegate, and act autonomously. MACF is the infrastructure layer that makes that possible, built on Claude and designed to be extended.

This framework was built by Jesse Stay ([@jessestay](https://github.com/jessestay)) as a production system for running his own business operations, and open-sourced to demonstrate what's possible with modern AI tooling.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Priority areas:
- New platform connectors (Teams, Discord, Linear, email)
- New role definitions for the registry  
- Persistence adapters beyond GitHub (Redis, Postgres, Supabase)
- The `@macf/core` npm package extraction

---

## License

MIT
