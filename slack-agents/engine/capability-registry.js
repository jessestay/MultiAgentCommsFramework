// engine/capability-registry.js — What each agent can actually DO.
//
// The PM (execPM) uses this to route capability requests: when an agent
// reports [ROADBLOCK], execPM checks if another team member already has
// the needed capability. If yes, route/delegate. If no, escalate to CEO.
//
// Capabilities are grouped by type. Each entry lists the agent ID and
// the specific tool/mechanism they use.

const CAPABILITIES = {
  // ─── Publishing (real posts, not drafts) ──────────────────────────
  'publish-x': {
    agents: ['cco'],
    via: 'engine/publisher.js postToX()',
    note: 'Posts to X/Twitter via API. Returns post ID.',
  },
  'publish-buffer': {
    agents: ['cmo'],
    via: 'NOT IMPLEMENTED',
    note: 'BROKEN (Oct 5, 2026 audit): MCP server never built. Do not route here.',
  },

  // ─── Research & Search ───────────────────────────────────────────
  'web-search': {
    agents: ['cro', 'cmo', 'cco'],
    via: 'Tavily MCP (cmo/cco) or webSearch util (cro)',
    note: 'Live web search with sources.',
  },
  'mcp-tavily': {
    agents: [],
    via: 'NOT IMPLEMENTED',
    note: 'BROKEN (Oct 5, 2026 audit): Tavily MCP server never built. Use web-search instead.',
  },

  // ─── Finance (verified, not guessed) ─────────────────────────────
  'paypal-read': {
    agents: [],
    via: 'NOT IMPLEMENTED',
    note: 'BROKEN (Oct 5, 2026 audit): MCP bridge is prototype, cannot invoke tools. CFO must fail closed.',
  },
  'finance-verify': {
    agents: ['cfo'],
    via: 'answerWithHands() in cfo.js',
    note: 'Verified money answers via tools, never LLM guesses.',
  },

  // ─── Task Management ─────────────────────────────────────────────
  'vikunja-api': {
    agents: ['execPM'],
    via: 'utils/vikunja.js',
    note: 'Create/update/comment on Vikunja tasks via API.',
  },
  'task-assign': {
    agents: ['execPM'],
    via: 'vikunja.updateTask()',
    note: 'Assign tasks to owners (via description routing).',
  },

  // ─── Desktop Access (Jesse's desktop, DESKTOP-4U63DES) ──────────
  'desktop-access': {
    agents: ['cto', 'ceo'],
    via: 'desktopHealth/desktopRun tools in utils/agentTools.js (role-gated at executeTool) + desktop-agent MCP server (hands/grants.json)',
    note: 'Health + bounded PowerShell + agent log on the desktop via the desktop agent (100.92.127.117:8099). Granted Oct 12, 2026 by Jesse\'s order (Vikunja #738) so the CTO can inspect desktop-side process/config/logs (e.g. the LiteLLM gateway, #736). Commands must stay small and bounded — the desktop agent is single-threaded.',
  },

  // ─── Content Generation (LLM text) ───────────────────────────────
  // Every agent has this via generateReport(). Not a differentiator.
  // Listed for completeness — if an agent needs "write X", any agent can.

  // ─── Gaps (no agent has these — CEO must build) ─────────────────
  // These are KNOWN missing capabilities. When requested, skip the
  // "check registry" step and escalate directly to CEO.
  'facebook-api-post': {
    agents: [],
    via: null,
    note: 'NO AGENT can post to Facebook. Facebook Expert is text-only.',
  },
  'instagram-api': {
    agents: [],
    via: null,
    note: 'NO AGENT has Instagram API access.',
  },
  'linkedin-api': {
    agents: [],
    via: null,
    note: 'NO AGENT has LinkedIn API access.',
  },
  'email-send': {
    agents: [],
    via: null,
    note: 'NO AGENT can send email directly. Requires FluentCRM/n8n.',
  },
  'deploy-verify': {
    agents: [],
    via: null,
    note: 'NO AGENT can verify Railway deployments. Needs API token.',
  },
  'browser-automation': {
    agents: [],
    via: null,
    note: 'NO AGENT has browser automation in the VM path.',
  },
};

// Reverse lookup: agent -> list of capability keys
const AGENT_CAPABILITIES = {};
for (const [cap, def] of Object.entries(CAPABILITIES)) {
  for (const agentId of def.agents) {
    if (!AGENT_CAPABILITIES[agentId]) AGENT_CAPABILITIES[agentId] = [];
    AGENT_CAPABILITIES[agentId].push(cap);
  }
}

function findCapability(needText) {
  const lower = (needText || '').toLowerCase();
  const matches = [];

  // Keyword matching against capability keys and notes
  for (const [cap, def] of Object.entries(CAPABILITIES)) {
    const haystack = `${cap} ${def.note} ${def.via || ''}`.toLowerCase();
    // Simple keyword overlap: check if any significant word from need appears
    const needWords = lower.split(/\W+/).filter(w => w.length > 3);
    const hitWords = needWords.filter(w => haystack.includes(w));
    if (hitWords.length > 0) {
      matches.push({
        capability: cap,
        agents: def.agents,
        via: def.via,
        note: def.note,
        score: hitWords.length,
        hasProvider: def.agents.length > 0,
      });
    }
  }

  // Sort by score (best match first)
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

function getAgentCapabilities(agentId) {
  return AGENT_CAPABILITIES[agentId] || [];
}

module.exports = {
  CAPABILITIES,
  AGENT_CAPABILITIES,
  findCapability,
  getAgentCapabilities,
};
