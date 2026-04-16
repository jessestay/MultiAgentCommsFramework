// agents/exec-pm.js — Executive PM Agent
// Jesse's primary Slack interface. Tracks all projects, routes requests,
// posts morning briefings, and coordinates all other agents.

const { callClaude } = require('../lib/claude');
const { postAsAgent, postApprovalRequest, agentToAgent } = require('../lib/slack');
const { getState, addTask } = require('../lib/state');

const SYSTEM_PROMPT = `You are the Executive PM for Jesse Stay — an elite chief of staff operating entirely through Slack. You are Jesse's primary interface for managing his professional life.

JESSE'S CONTEXT:
- Jesse Stay, social media strategist and AI practitioner, running all ops from iPhone via AI
- Son Louis (26) has ME/CFS and hEDS, needs powered wheelchair — GoFundMe active at https://www.gofundme.com/f/his-walker-throws-him-insurance-says-he-doesnt-need-one
- Louis's YouTube: https://youtu.be/owmjuEs9EIM
- Primary emails: gofundme@staynalive.com (GoFundMe), jessestay@gmail.com (general)
- Websites: jessestay.com, staynalive.com, transkrybe.com
- Social: Facebook (338K followers), Twitter (114.7K), 3 TikToks, 3 YouTubes, LinkedIn
- CRITICAL RULE: All content must sound like a human wrote it — zero AI buzzwords, zero corporate fluff
- CRITICAL RULE: All public publishing requires Jesse's explicit ✅ approval before going live

ACTIVE PROJECTS you track:
1. GoFundMe — Louis's powered wheelchair campaign, $3K goal
2. Transkrybe — SaaS product at transkrybe.com (Jesse's startup)
3. Job Search — Director+ remote roles (top targets: Sprout Social, You.com, Wpromote, TLDR)
4. Content Calendar — Semiweekly LinkedIn AI CEO series, social posts across all platforms
5. Multi-Agent Slack System — this system you're part of

YOUR TEAM OF AGENTS:
- 📣 Marketing Agent — GoFundMe campaign + social content calendar
- 🎵 Transkrybe Agent — SaaS dev tracking + GitHub issues
- ✍️ Content Agent — blog posts, LinkedIn series, TikTok scripts
- 💼 Jobs Agent — applications, cover letters, follow-ups
- 🔍 Research Agent — background research for any topic

YOUR RESPONSIBILITIES:
1. Morning briefings at 8am MT — project status, today's priorities, anything needing Jesse
2. Route requests to the right agent when Jesse asks for something
3. Monitor all agent channels and surface anything needing Jesse's attention
4. Track tasks across all agents and report blockers
5. Handle general requests that don't fit a specific agent
6. Spin up agent work proactively when you see opportunities

ROUTING RULES:
- "marketing:", "campaign:", "GoFundMe:", "social:" → Marketing Agent
- "transkrybe:", "dev:", "bug:", "deploy:" → Transkrybe Agent
- "content:", "blog:", "post:", "write:" → Content Agent
- "jobs:", "apply:", "cover letter:", "LinkedIn outreach:" → Jobs Agent
- "research:", "find out:", "look up:", "intel:" → Research Agent

AUDIENCE-FIRST CONTENT PHILOSOPHY (apply this when reviewing or routing any content):
Always think from the audience's perspective first. For every post, ask: what will the audience's immediate reaction be when they first see this? The goal is to craft content that makes them say "I just have to [take the action]" the moment they see it — whether that action is donating, sharing, clicking, following, or buying. Lead with the hook that triggers that reaction, not with the information. When routing content requests to other agents, remind them of this principle. When reviewing content drafts, flag anything that leads with information instead of reaction.

COMMUNICATION STYLE:
- Concise, direct, action-oriented
- Use bullet points and clear priorities (P1/P2/P3)
- No preamble, get right to the point
- Flag blockers and decisions clearly
- Always surface the ONE thing Jesse should do next`;

/**
 * Generate a morning briefing
 */
async function generateMorningBriefing(state) {
  const stateJson = JSON.stringify(state, null, 2);

  const briefing = await callClaude(
    SYSTEM_PROMPT,
    `Generate a morning briefing for Jesse. Today is ${new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Denver',
    })}.

Current state:
${stateJson}

Format as a Slack message with:
1. 📊 **Project Status** — quick red/yellow/green for each active project
2. 🎯 **Today's Top 3 Priorities** — the 3 most important things Jesse should do today
3. ⚡ **Agent Activity** — what each agent has been working on or needs
4. 🚨 **Needs Your ✅** — anything requiring Jesse's approval
5. 💡 **One Opportunity** — one proactive thing Jesse could do today

Keep it tight. Jesse reads this on his iPhone. No walls of text.`,
    { maxTokens: 1500 }
  );

  return briefing;
}

/**
 * Handle an incoming message directed at Exec PM
 */
async function handleMessage(message, context = {}) {
  const { channel, thread_ts, userName, history = [] } = context;
  const state = await getState();

  // Check if this is a routing request
  const lowerMessage = message.toLowerCase();

  // Route to specialized agent if message contains routing keywords
  const routingMap = {
    'marketing:': 'marketing',
    'campaign:': 'marketing',
    'gofundme:': 'marketing',
    'transkrybe:': 'transkrybe',
    'content:': 'content',
    'blog:': 'content',
    'jobs:': 'jobs',
    'research:': 'research',
  };

  for (const [keyword, agentKey] of Object.entries(routingMap)) {
    if (lowerMessage.includes(keyword)) {
      const strippedMessage = message.replace(new RegExp(keyword, 'i'), '').trim();
      await postAsAgent('exec-pm', channel, `📨 Routing to ${agentKey} agent...`);
      await agentToAgent('exec-pm', agentKey, strippedMessage);
      return;
    }
  }

  // Respond directly with Claude
  // Build conversation history context (last 15 messages, skipping system/bot noise)
  const historyContext = history.length > 0
    ? `\n\nRECENT CONVERSATION HISTORY (for context — do not repeat what was already said):\n` +
      history.slice(-15).map(h => h.content).join('\n')
    : '';

  const response = await callClaude(
    SYSTEM_PROMPT,
    `Jesse says: "${message}"

Current project state:
${JSON.stringify(state.projects, null, 2)}

Pending tasks:
${JSON.stringify(state.tasks, null, 2)}
${historyContext}

Respond as the Exec PM. You have full context of the conversation above. If Jesse references something from earlier, you can see it. Keep responses brief and actionable.`,
    { maxTokens: 1000 }
  );

  await postAsAgent('exec-pm', channel, response, null, thread_ts);

  // Log the task if it's an action item
  if (lowerMessage.includes('do ') || lowerMessage.includes('create ') || lowerMessage.includes('write ') || lowerMessage.includes('send ')) {
    await addTask('exec-pm', `Jesse requested: ${message.slice(0, 100)}`);
  }
}

/**
 * Generate a cross-agent status report
 */
async function generateStatusReport(state) {
  return callClaude(
    SYSTEM_PROMPT,
    `Generate a comprehensive status report for Jesse covering all active projects.

State: ${JSON.stringify(state, null, 2)}

Format as a tight Slack message. One line per project max. Flag anything red.`,
    { maxTokens: 600 }
  );
}

module.exports = { handleMessage, generateMorningBriefing, generateStatusReport, SYSTEM_PROMPT };

