  [WARN] No callClaude patterns found in handleMessage
// agents/exec-pm.js — Executive PM Agent
//
// Jesse's primary Slack interface. Tracks all projects, routes requests,
// posts morning briefings, and coordinates all other agents.
//
// v2: Added proactive task dispatch — when morning briefing runs, Exec PM
// now also queues work for other agents based on project state.

const { callClaude, callClaudeWithTools } = require('../lib/claude');
const { RUN_COWORK_TASK_TOOL, createCoworkExecutor } = require('../lib/tools');
const { postAsAgent, postApprovalRequest, agentToAgent } = require('../lib/slack');
const { getState, addTask, getAgentMemory, updateAgentMemory } = require('../lib/state');

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
5. Multi-Agent Slack System (MACF) — this open-source system you're part of, being built for public release

YOUR TEAM OF AGENTS:
- 📣 Marketing Agent (#marketing) — GoFundMe campaign + social content calendar
- 🔧 CTO Agent (#cto) — Transkrybe SaaS dev tracking + GitHub issues
- ✍️ Content Agent (#content) — blog posts, LinkedIn series, TikTok scripts
- 💼 Jobs Agent (#jobs) — applications, cover letters, follow-ups
- 🔍 Research Agent (#research) — background research for any topic

YOUR RESPONSIBILITIES:
1. Morning briefings at 8am MT — project status, today's priorities, anything needing Jesse
2. Route requests to the right agent when Jesse asks for something
3. PROACTIVELY queue work for agents when you see opportunities or based on project status
4. Track tasks across all agents and report blockers
5. Handle general requests that don't fit a specific agent

PROACTIVE WORK (critical for autonomous operation):
When generating morning briefings or responding to Jesse, if you see actionable work that an agent should do:
- Use addTask to queue it: "marketing: write 2 new GoFundMe share posts with updated stats"
- Be specific — give agents enough context to execute without checking back
- Agents will pick these up within the hour via the task queue processor

AUDIENCE-FIRST PHILOSOPHY: Always think from the audience's perspective. Lead with the hook, not the information.

COMMUNICATION STYLE:
- Concise, direct, action-oriented
- Use bullet points and clear priorities (P1/P2/P3)
- No preamble, get right to the point
- Flag blockers and decisions clearly
- Always surface the ONE thing Jesse should do next`;

/**
 * Generate a morning briefing AND queue proactive tasks for agents
 */
async function generateMorningBriefing(state) {
  const stateJson = JSON.stringify(state, null, 2);
  const memory = await getAgentMemory('exec-pm');

  // Step 1: Generate the briefing
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

Long-term memory:
${JSON.stringify(memory, null, 2)}

Format as a Slack message with:
1. 📊 **Project Status** — quick red/yellow/green for each active project
2. 🎯 **Today's Top 3 Priorities** — the 3 most important things Jesse should do today
3. ⚡ **Agent Activity** — what each agent has been working on or needs
4. 🚨 **Needs Your ✅** — anything requiring Jesse's approval
5. 💡 **One Opportunity** — one proactive thing Jesse could do today

Keep it tight. Jesse reads this on his iPhone. No walls of text.`,
    { maxTokens: 1500 }
  );

  // Step 2: Queue proactive tasks for agents based on current state
  await queueProactiveTasks(state);

  return briefing;
}

/**
 * Analyze project state and queue proactive work for agents.
 * This is the engine of autonomous operation — called during morning briefing.
 */
async function queueProactiveTasks(state) {
  // Use Claude to decide what tasks to queue
  const taskDecisions = await callClaude(
    SYSTEM_PROMPT,
    `Based on the current project state, decide what proactive tasks to queue for each agent.

State: ${JSON.stringify(state.projects, null, 2)}
Existing pending tasks: ${JSON.stringify(
  Object.fromEntries(
    Object.entries(state.tasks).map(([k, v]) => [k, v.filter(t => t.status === 'pending').map(t => t.task)])
  ), null, 2
)}
Last cron runs: ${JSON.stringify(state.last_run, null, 2)}

Return a JSON array of tasks to queue. Only include tasks that are genuinely useful — don't create busy work.
Format: [{"agent": "marketing", "task": "...", "priority": "high|normal|low"}, ...]

Rules:
- Don't re-queue tasks already pending
- Marketing: content, GoFundMe updates, social posts — at most 2 per day
- CTO: GitHub issue checks, deployment status — max 1 per day
- Content: drafts ready for LinkedIn/blog — max 1 per day
- Jobs: application follow-ups, new leads — max 1 per day
- Research: only queue if a project needs new intel

Return valid JSON only. If no tasks are needed, return [].`,
    { maxTokens: 800 }
  );

  let tasks = [];
  try {
    const jsonMatch = taskDecisions.match(/\[[\s\S]*\]/);
    if (jsonMatch) tasks = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.log('[exec-pm] Could not parse task decisions:', e.message);
    return;
  }

  for (const { agent, task, priority } of tasks) {
    if (!agent || !task) continue;
    try {
      await addTask(agent, task, { priority: priority || 'normal', source: 'exec-pm' });
      console.log(`[exec-pm] Queued task for ${agent}: ${task.slice(0, 60)}`);
    } catch (err) {
      console.error(`[exec-pm] Failed to queue task for ${agent}:`, err.message);
    }
  }

  if (tasks.length > 0) {
    console.log(`[exec-pm] Queued ${tasks.length} proactive task(s)`);
  }
}

/**
 * Handle an incoming message directed at Exec PM
 */
async function handleMessage(message, context = {}) {
  const { channel, thread_ts, userName, history = [], isScheduled = false } = context;
  const state = await getState();
  const memory = await getAgentMemory('exec-pm');

  // Check if this is a routing request
  const lowerMessage = message.toLowerCase();

  // Route to specialized agent if message contains routing keywords
  const routingMap = {
    'marketing:': 'marketing',
    'campaign:': 'marketing',
    'gofundme:': 'marketing',
    'transkrybe:': 'transkrybe',
    'cto:': 'transkrybe',
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

  // Build conversation history context
  const historyContext = history.length > 0
    ? `\n\nRECENT CONVERSATION HISTORY:\n` +
      history.slice(-15).map(h => h.content).join('\n')
    : '';

  // Scheduled tasks: use a briefer system prompt
  const systemPrompt = isScheduled
    ? `${SYSTEM_PROMPT}\n\nThis is a scheduled autonomous task. Execute it completely and post results to your channel.`
    : SYSTEM_PROMPT;

  const response = await callClaude(
    systemPrompt,
    `${isScheduled ? 'SCHEDULED TASK: ' : 'Jesse says: '}"${message}"

Current project state:
${JSON.stringify(state.projects, null, 2)}

Pending tasks:
${JSON.stringify(state.tasks, null, 2)}

Long-term memory:
${JSON.stringify(memory, null, 2)}
${historyContext}

Respond as the Exec PM. Keep responses brief and actionable.`,
    { maxTokens: 1000 }
  );

  await postAsAgent('exec-pm', channel, response, null, thread_ts);

  // Log the task if it's an action item
  if (!isScheduled && (lowerMessage.includes('do ') || lowerMessage.includes('create ') ||
      lowerMessage.includes('write ') || lowerMessage.includes('send '))) {
    // Check if response suggests routing to an agent — if so, add to their queue
    await addTask('exec-pm', `Jesse requested: ${message.slice(0, 100)}`, { source: 'user' });
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
