// agents/transkrybe.js — Transkrybe Agent
// Tracks dev status, open bugs, deployments for transkrybe.com SaaS product.
// Reads GitHub repo jessestay/transkrybe for context.

const { callClaude } = require('../lib/claude');
const { postAsAgent, postApprovalRequest, agentToAgent } = require('../lib/slack');
const { getState, updateState, addTask } = require('../lib/state');

const SYSTEM_PROMPT = `You are the Transkrybe Agent for Jesse Stay — a sharp technical product manager and dev tracker for Jesse's SaaS startup Transkrybe.

JESSE'S CONTEXT:
- Jesse Stay, social media strategist and AI practitioner
- Transkrybe is Jesse's SaaS product at https://transkrybe.com
- GitHub repo: jessestay/transkrybe
- Jesse runs ops from iPhone via AI — needs clear, mobile-friendly updates
- CRITICAL: All deployment decisions require Jesse's ✅ approval

TRANSKRYBE CONTEXT:
- Transkrybe is an audio/music transcription SaaS tool
- Jesse is building this while also managing job search and other projects
- Key concerns: uptime, bug reports, feature progress, deployment health

YOUR RESPONSIBILITIES:
1. Weekly dev status report every Monday — what shipped, what's in progress, open bugs
2. Track open GitHub issues and PRs
3. Alert Jesse to any critical bugs or deployment failures immediately
4. Suggest prioritization when there are multiple open issues
5. Help Jesse think through technical decisions
6. Coordinate with Research Agent for competitive analysis

AUDIENCE-FIRST CONTENT PHILOSOPHY (apply when Transkrybe needs any user-facing copy, landing page text, onboarding messages, or marketing):
Always think from the audience's perspective first. For every piece of copy, ask: what will the user's immediate reaction be when they first see this? The goal is to craft content that makes them say "I just have to [take the action]" the moment they see it — whether that action is signing up, upgrading, sharing, or clicking. Lead with the hook that triggers that reaction, not with the feature list or technical explanation. When reviewing any Transkrybe marketing copy, flag anything that leads with features instead of the user's desired outcome.

COMMUNICATION STYLE:
- Technical but clear — Jesse is smart but reads on iPhone
- Flag P1 (critical) issues immediately, P2/P3 in weekly report
- Always include estimated effort and impact for suggested work
- Keep weekly reports to one Slack message, use emoji status indicators
- 🟢 = healthy/shipped, 🟡 = in progress/minor issue, 🔴 = blocked/critical

GITHUB INTEGRATION:
When asked about GitHub issues or PRs, fetch them via the GitHub API.
Repo: jessestay/transkrybe
Look for: open issues (bugs, features, enhancements), recent commits, open PRs`;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

/**
 * Fetch open GitHub issues for transkrybe
 */
async function fetchGitHubIssues() {
  if (!GITHUB_TOKEN) {
    return { issues: [], error: 'GITHUB_TOKEN not set' };
  }

  try {
    const [issuesRes, prsRes] = await Promise.all([
      fetch('https://api.github.com/repos/jessestay/transkrybe/issues?state=open&per_page=20', {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }),
      fetch('https://api.github.com/repos/jessestay/transkrybe/pulls?state=open&per_page=10', {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }),
    ]);

    const issues = issuesRes.ok ? await issuesRes.json() : [];
    const prs = prsRes.ok ? await prsRes.json() : [];

    // Filter out PRs from issues list (GitHub includes PRs in issues endpoint)
    const pureIssues = Array.isArray(issues)
      ? issues.filter((i) => !i.pull_request)
      : [];

    return { issues: pureIssues, prs: Array.isArray(prs) ? prs : [] };
  } catch (err) {
    console.error('GitHub fetch error:', err);
    return { issues: [], prs: [], error: err.message };
  }
}

/**
 * Fetch recent commits
 */
async function fetchRecentCommits(limit = 10) {
  if (!GITHUB_TOKEN) return [];

  try {
    const res = await fetch(
      `https://api.github.com/repos/jessestay/transkrybe/commits?per_page=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

/**
 * Generate a weekly dev status report
 */
async function generateWeeklyStatus(state) {
  const [{ issues, prs, error }, commits] = await Promise.all([
    fetchGitHubIssues(),
    fetchRecentCommits(10),
  ]);

  const transkrybe = state.projects?.transkrybe || {};

  const issuesSummary = error
    ? `(GitHub API unavailable: ${error})`
    : `${issues.length} open issues, ${prs?.length || 0} open PRs`;

  const recentCommitsList = Array.isArray(commits)
    ? commits
        .slice(0, 5)
        .map((c) => `• ${c.commit?.message?.split('\n')[0]} (${c.commit?.author?.date?.slice(0, 10)})`)
        .join('\n')
    : 'No recent commits found';

  const openIssuesList = issues
    .slice(0, 8)
    .map((i) => `• #${i.number} [${i.labels?.map((l) => l.name).join(', ') || 'no label'}] ${i.title}`)
    .join('\n') || 'No open issues';

  const report = await callClaude(
    SYSTEM_PROMPT,
    `Generate a weekly dev status report for Transkrybe.

GitHub summary: ${issuesSummary}
Recent commits:
${recentCommitsList}

Open issues:
${openIssuesList}

Open PRs: ${prs?.map((p) => `#${p.number} ${p.title}`).join(', ') || 'none'}

Last deploy: ${transkrybe.last_deploy || 'unknown'}
Stored state: ${JSON.stringify(transkrybe, null, 2)}

Format as a Slack message:
1. 🚦 Overall health (green/yellow/red with one sentence why)
2. ✅ What shipped this week
3. 🔨 In progress
4. 🐛 Open bugs (flag any P1s)
5. 📋 Suggested priorities for next week
6. ❓ Anything Jesse needs to decide

Keep it scannable on mobile.`,
    { maxTokens: 1000 }
  );

  return report;
}

/**
 * Handle an incoming message
 */
async function handleMessage(message, context = {}) {
  const { channel, thread_ts } = context;
  const state = await getState();
  const lowerMessage = message.toLowerCase();

  // Fetch live GitHub data for context
  const githubData = await fetchGitHubIssues();
  const issueContext = `Open issues: ${githubData.issues?.length || 0}, Open PRs: ${githubData.prs?.length || 0}`;

  // Route to research if competitive question
  if (lowerMessage.includes('competitor') || lowerMessage.includes('compare') || lowerMessage.includes('market')) {
    await postAsAgent('transkrybe', channel, '🔍 Routing to Research Agent for competitive intel...');
    await agentToAgent('transkrybe', 'research', `Transkrybe competitive research needed: ${message}`);
    return;
  }

  const response = await callClaude(
    SYSTEM_PROMPT,
    `Jesse (or another agent) asks: "${message}"

GitHub status: ${issueContext}
${githubData.issues?.length > 0 ? `Recent issues:\n${githubData.issues.slice(0, 5).map((i) => `• #${i.number}: ${i.title}`).join('\n')}` : ''}

Transkrybe state: ${JSON.stringify(state.projects?.transkrybe || {}, null, 2)}

Respond as the Transkrybe Agent. Be specific and technical when needed. If this is a task, confirm you're tracking it.`,
    { maxTokens: 800 }
  );

  await postAsAgent('transkrybe', channel, response, null, thread_ts);
  await addTask('transkrybe', message.slice(0, 100));
}

module.exports = {
  handleMessage,
  generateWeeklyStatus,
  fetchGitHubIssues,
  SYSTEM_PROMPT,
};

