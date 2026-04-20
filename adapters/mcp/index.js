#!/usr/bin/env node
// adapters/mcp/index.js — MACF MCP Server for Cursor / Claude Code
//
// Exposes the MACF agent team as MCP tools that any Claude-based coding
// assistant (Cursor, Claude Code CLI, Claude Desktop) can call natively.
//
// Install in Claude Code:
//   claude mcp add macf-team -- node /path/to/MultiAgentCommsFramework/adapters/mcp/index.js
//
// Or add to ~/.claude.json / .cursor/mcp.json:
//   {
//     "mcpServers": {
//       "macf-team": {
//         "command": "node",
//         "args": ["/path/to/MultiAgentCommsFramework/adapters/mcp/index.js"],
//         "env": {
//           "ANTHROPIC_API_KEY": "...",
//           "MEMORY_BACKEND": "filesystem"
//         }
//       }
//     }
//   }
//
// Same agent team, same memory, same personalities — just a different frontend.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Server }               = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} = require('@modelcontextprotocol/sdk/types.js');

const { AGENTS, DELEGATION_TARGETS } = require('../../core/config');
const memory    = require('../../core/memory/index');
const { generateReport } = require('../../core/ai/anthropic');
const { relay, stripDelegations } = require('../../slack-agents/utils/delegation');

// ─── Orchestrator: route a message to an agent and return its response ────────
async function orchestrate(agentId, userMessage) {
  const agent = AGENTS[agentId];
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  // Gather agent's memory context
  const agentState = memory.dump ? memory.dump(agentId) : {};

  const context = `
Platform: Cursor / Claude Code IDE (the user is Jesse working directly in their code editor)
Jesse said: "${userMessage}"

Agent memory snapshot:
${JSON.stringify(agentState, null, 2).slice(0, 800)}

Respond naturally. You're in the user's IDE, not in Slack, so keep responses concise and directly useful for someone in a coding context. Same persona, same memory, different surface.
  `.trim();

  const response = await generateReport({
    systemPrompt: agent.systemPrompt,
    context,
    maxTokens: 1500,
  });

  // Fire any delegations in-process (same relay system as Slack adapter)
  await relay(response, agentId);

  // Return stripped response (no delegation lines shown to user)
  return stripDelegations(response);
}

// ─── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'ask_exec_pm',
    description: "Ask your Executive Secretary (Exec PM) — Jesse's primary point of contact for project status, priorities, and team coordination. Start here for any cross-team question.",
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: "Your question or task for Exec PM" }
      },
      required: ['message'],
    },
    agentId: 'execPM',
  },
  {
    name: 'ask_cmo',
    description: "Ask your CMO — marketing strategy, GoFundMe campaigns, content calendar, social media growth for Jesse's projects.",
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
    agentId: 'cmo',
  },
  {
    name: 'ask_cco',
    description: "Ask your CCO — draft content, social posts, blog posts, email copy, GoFundMe updates. All drafts need Jesse's approval before posting.",
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
    agentId: 'cco',
  },
  {
    name: 'ask_cro',
    description: "Ask your CRO — research requests, competitive intelligence, industry trends, GoFundMe tactics, job market analysis.",
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
    agentId: 'cro',
  },
  {
    name: 'ask_cuxo',
    description: "Ask your CUXO — UX/design review, accessibility audit (WCAG 2.1), transkrybe.com UX improvements, visual design direction.",
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
    agentId: 'cuxo',
  },
  {
    name: 'ask_lawyer',
    description: "Ask your Lawyer — legal risks in transkrybe or MACF, GDPR/CCPA compliance, IP protection, contract review. Guidance only, not representation.",
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
    agentId: 'lawyer',
  },
  {
    name: 'ask_cfo',
    description: "Ask your CFO — SaaS financial strategy, MRR/CAC/LTV tracking, tax planning, revenue optimization for transkrybe. Not a CPA.",
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
    agentId: 'cfo',
  },
  {
    name: 'ask_jobcoach',
    description: "Ask your Job Coach — executive job search strategy, positioning for Director/VP/C-suite roles, pipeline review, networking advice.",
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
    agentId: 'jobcoach',
  },
  {
    name: 'ask_team',
    description: "Ask the whole MACF team — Exec PM will route your message to the right specialists and aggregate their responses. Use when you're not sure who to ask.",
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: "Your question or task for the team" }
      },
      required: ['message'],
    },
    agentId: 'execPM', // always routes through exec-pm
  },
];

// ─── MCP Server ───────────────────────────────────────────────────────────────
const server = new Server(
  { name: 'macf-team', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = TOOLS.find(t => t.name === name);

  if (!tool) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
  if (!args?.message) {
    throw new McpError(ErrorCode.InvalidParams, 'message is required');
  }

  try {
    const response = await orchestrate(tool.agentId, args.message);
    return {
      content: [{ type: 'text', text: response }],
    };
  } catch (err) {
    console.error(`[mcp] Error calling ${name}:`, err.message);
    throw new McpError(ErrorCode.InternalError, err.message);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  // Load agent memory on startup
  if (memory.loadAll) memory.loadAll();

  // Initialize the delegation relay with a stub (MCP has no Slack channels to post to)
  // Delegations still fire in-process; responses go back through orchestrate()
  const { init } = require('../../slack-agents/utils/delegation');
  const agentModules = {};
  for (const agentId of Object.keys(AGENTS)) {
    agentModules[agentId] = {
      handleDelegation: async (text, visited) => {
        const match = text.match(/\[from:\s*.+?\s*→\s*.+?\]\s*([\s\S]+)/i);
        if (match) {
          // In MCP context, delegation responses are fire-and-forget to memory
          // (no Slack channels to post to) — agents can still read each other's output
          // via shared memory in a future enhancement
          console.log(`[mcp/delegation] ${agentId} received delegation — logging to memory`);
        }
      },
    };
  }
  init(agentModules, DELEGATION_TARGETS);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[macf-mcp] MACF team MCP server running on stdio');
}

main().catch(err => {
  console.error('[macf-mcp] Fatal error:', err);
  process.exit(1);
});
