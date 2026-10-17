# Agent-Runtime MCP Client Integration — Design

**Status:** design, approved for build (Jesse greenlit Oct 1, 2026)
**Problem:** Slack agents make one LLM call with no tool loop. The macf-finance
pilot server is built and tested, but nothing can call it yet.

## Where the client lives

`~/workspace/macf/slack-agents/mcp-client/` — a new module in the agent runtime.
It sits between the agent's LLM call and the MCP servers:

```
Agent (cfo.js) → mcp-client → macf-finance (stdio) → PayPal API
              → mcp-client → n8n-mcp (stdio) → n8n
```

## Components

### 1. Role allowlist loader
Reads `~/workspace/macf/hands/grants.json` (new file):
```json
{
  "cfo": ["macf-finance"],
  "cro": ["macf-outreach"],
  "cto": ["macf-ops", "n8n"],
  "ceo": ["macf-finance", "macf-outreach", "macf-ops", "n8n"]
}
```
The client refuses to spawn a server not in the caller's grant list.
This is enforcement layer 1 (client config). Layer 2 is the server-side
role token check, already built into macf-finance.

### 2. Server spawner
For each granted server, spawns the stdio process from mcp.json:
- Resolves `${VAR}` env references (e.g. `${N8N_API_KEY}`) from the
  environment. Refuses to start if a required secret is missing —
  never passes an empty credential.
- Loads the role token from `~/workspace/macf/hands/.role-tokens`
  and injects it as the MCP session's auth context.

### 3. ReAct tool loop
Replaces the current single-shot LLM call in agents that get hands:
1. Agent builds its prompt + the tool schemas from its granted servers.
2. LLM responds with either a tool call or a final answer.
3. Client executes the tool call, appends the result, loops back to the LLM.
4. Loop ends on: final answer, tool-call budget exhausted, or latency
   budget exhausted.

### 4. Budgets (from ARCHITECTURE.md)
Per task, per role (defaults, tunable in grants.json):
- Max 8 tool calls per task
- Max 120 seconds total tool latency per task
- On budget exhaustion: return what was verified so far, flag the rest
  as UNVERIFIED. Never fabricate to fill the gap.

The desktop gateway's 45% timeout rate is the reason budgets exist.
A tool loop without a budget multiplies the timeout problem.

### 5. Audit logging
Every tool call appends to `~/workspace/macf/hands/logs/tool-calls.log`:
`timestamp | role | server | tool | args-hash | result-summary | latency-ms`
Args are hashed, not logged raw (may contain PII/financial data).

## Rollout order

1. **CFO + macf-finance (pilot).** Read-only tools. The CFO's next revenue
   dashboard must come from `paypal_transactions_read`, not from the LLM's
   imagination. This is the proof-of-concept.
2. **CRO + macf-outreach.** Wraps existing worker scripts. Send tools stay
   behind the draft-approval gate (code-level, not prompt-level).
3. **CTO + macf-ops + n8n.** Health checks, deploys, watchdog.

## What this does NOT do

- Does not give the engine (Vikunja worker) tool access. The engine stays
  text-only by design; hands belong to the Slack agents who answer Jesse.
- Does not bypass Jesse's approval gates. Send/publish/spend tools check
  the approval state in code before executing. A "send it" in the prompt
  without a recorded approval is refused.
- Does not log credentials or raw financial data. Hashes and summaries only.

## Open questions for the build

1. The Slack agents run on the VM; macf-finance runs stdio. Same-machine
   stdio is fine for the pilot. If agents move off-VM, switch to SSE/HTTP
   transport with TLS.
2. Role tokens currently live in a 600-mode file. For production, move to
   the vault/broker pattern (same as the n8n key quarantine).
3. The ReAct loop needs the LLM to support tool calling. The desktop
   gateway's LiteLLM supports OpenAI-style tool calls; verify with a
   two-tool test before wiring the CFO.
