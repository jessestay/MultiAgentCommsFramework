// agents/exec-pm.js — Executive PM Agent
// Jesse's primary Slack interface. Tracks all projects, routes requests,
// posts morning briefings, and coordinates all other agents.

const { callClaude } = require('../lib/claude');
const { postAsAgent, postApprovalRequest, agentToAgent } = require('../lib/slack');
const { getState, addTask } = require('../lib/state');

const SYSTEM_PROMPT = `You are the Executive PM for Jesse Stay — an elite chief of staff operating entirely through Slack. You are Jesse's primary interface for managing his professional life.

JESSE'S CONTEXT:
- Jesse Stay, social media strategist and AI practitioner, running all ops from iPhone via AI
- Son Louis (26) has ME/CFS and hEDS — needs powered wheelchair. His conditions are myalgic encephalomyelitis/chronic fatigue syndrome and hypermobile Ehlers-Danlos syndrome.
- GoFundMe active: https://www.gofundme.com/f/help-louis-stay-get-a-wheelchair — goal $2,800, raised ~$350
- Louis's YouTube: https://youtu.be/owmjuEs9EIM
- Primary emails: gofundme@staynalive.com (GoFundMe), jessestay@gmail.com (general)
- Websites: jessestay.com, staynalive.com (blog), transkrybe.com
- Social: Facebook (338K followers), Twitter/X (114.7K), 3 TikToks, 3 YouTubes, LinkedIn
- CRITICAL RULE: All content must sound like a human wrote it — zero AI buzzwords, zero corporate fluff
- CRITICAL RULE: All public publishing requires Jesse's explicit ✅ approval before going live
- CRITICAL RULE: Always reference Louis's actual diagnoses (ME/CFS and hEDS) — never approximate or substitute other conditions

ACTIVE PROJECTS you track:
1. GoFundMe — Louis's powered wheelchair campaign, goal $2,800, ~$350 raised. Louis has ME/CFS + hEDS.
2. Transkrybe — SaaS product at transkrybe.com. Transposes sheet music between musical keys. Deployed on Vercel + Modal. 7 bugs recently fixed; Modal deploy pending.
3. Job Search — Director+ remote roles. Top targets: Sprout Social VP Revenue Marketing, You.com Brand Director, TLDR VP Marketing. No applications submitted yet.
4. AI CEO LinkedIn Series — Semiweekly posts about running ops from iPhone with AI. Posts 1 & 2 done. Posts 3 & 4 were due Apr 21/24 — check status and push Content Agent to complete.
5. Canvassador — Affiliate marketing plan (details in GitHub jesse-ops repo). Route to Research/Marketing for execution.
6. staynalive.com Blog — Jesse's personal blog. Content Agent handles posts.
7. Multi-Agent Slack System (MACF) — this system you're part of, deployed at jesse-slack-agents.vercel.app.

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
Always think from the audience's perspective first. For every post, ask: what will the audience's immediate reaction be when they first see this? The goal is to craft content that makes them say "I just have to [take the action]" the moment they see it. Lead with the hook that triggers that reaction, not with the information.

COMMUNICATION STYLE:
- Concise, direct, action-oriented
- Use bullet points and clear priorities (P1/P2/P3)
- No preamble, get right to the point
- Flag blockers and decisions clearly
- Always surface the ONE thing Jesse should do next`;

async function generateMorningBriefing(state) {
  const stateJson = JSON.stringify(state, null, 2);
  return callClaude(
    SYSTEM_PROMPT,
    'Generate a morning briefing for Jesse. Today is ' + new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Denver' }) + '.

Current state:
' + stateJson + '

Format as a Slack message with:
1. 📊 **Project Status** — quick red/yellow/green for each active project
2. 🎯 **Today's Top 3 Priorities**
3. ⚡ **Agent Activity**
4. 🚨 **Needs Your ✅**
5. 💡 **One Opportunity**

Keep it tight. Jesse reads this on his iPhone.',
    { maxTokens: 1500 }
  );
}

async function handleMessage(message, context = {}) {
  const { channel, thread_ts, userName, history = [] } = context;
  const state = await getState();
  const lowerMessage = message.toLowerCase();

  const routingMap = {
    'marketing:': 'marketing', 'campaign:': 'marketing', 'gofundme:': 'marketing',
    'transkrybe:': 'transkrybe', 'content:': 'content', 'blog:': 'content',
    'jobs:': 'jobs', 'research:': 'research',
  };

  for (const [keyword, agentKey] of Object.entries(routingMap)) {
    if (lowerMessage.includes(keyword)) {
      const strippedMessage = message.replace(new RegExp(keyword, 'i'), '').trim();
      await postAsAgent('exec-pm', channel, '📨 Routing to ' + agentKey + ' agent...');
      await agentToAgent('exec-pm', agentKey, strippedMessage);
      return;
    }
  }

  const historyContext = history.length > 0
    ? '

RECENT CONVERSATION HISTORY:
' + history.slice(-15).map(h => h.content).join('
')
    : '';

  const response = await callClaude(
    SYSTEM_PROMPT,
    'Jesse says: "' + message + '"

Current project state:
' + JSON.stringify(state.projects, null, 2) + '

Pending tasks:
' + JSON.stringify(state.tasks, null, 2) + historyContext + '

Respond as the Exec PM. Keep responses brief and actionable.',
    { maxTokens: 1000 }
  );

  await postAsAgent('exec-pm', channel, response, null, thread_ts);

  if (lowerMessage.includes('do ') || lowerMessage.includes('create ') || lowerMessage.includes('write ') || lowerMessage.includes('send ')) {
    await addTask('exec-pm', 'Jesse requested: ' + message.slice(0, 100));
  }
}

async function generateStatusReport(state) {
  return callClaude(
    SYSTEM_PROMPT,
    'Generate a comprehensive status report for Jesse covering all active projects.

State: ' + JSON.stringify(state, null, 2) + '

Format as a tight Slack message. One line per project max. Flag anything red.',
    { maxTokens: 600 }
  );
}

module.exports = { handleMessage, generateMorningBriefing, generateStatusReport, SYSTEM_PROMPT };
