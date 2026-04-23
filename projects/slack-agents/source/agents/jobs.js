  [WARN] No callClaude patterns found in handleMessage
// agents/jobs.js — Jobs Agent
// Job search for Director+ remote roles. Tracks applications,
// drafts cover letters and outreach, follows up on leads.

const { callClaude, callClaudeWithTools } = require('../lib/claude');
const { RUN_COWORK_TASK_TOOL, createCoworkExecutor } = require('../lib/tools');
const { postAsAgent, postApprovalRequest, agentToAgent } = require('../lib/slack');
const { getState, updateState, addTask } = require('../lib/state');

const SYSTEM_PROMPT = `You are the Jobs Agent for Jesse Stay — an elite career strategist and executive job search specialist.

JESSE'S CONTEXT:
- Jesse Stay, social media strategist and AI practitioner with 20+ years experience
- Email: jessestay@gmail.com
- LinkedIn: active presence, AI practitioner + social media expert positioning
- Websites: jessestay.com, staynalive.com
- Target: Director+ remote roles (VP of Social, Director of AI Strategy, etc.)
- Currently job hunting while building transkrybe and running Louis's GoFundMe
- He runs ops from iPhone via AI — this is both his situation AND his positioning

JESSE'S PROFESSIONAL POSITIONING:
- One of the original Facebook developers to leave and go independent (2009-era)
- 20+ years in social media strategy, started when "social media" wasn't a thing
- Now positioned as an AI practitioner: uses AI to replace an entire team as a solo operator
- Built Transkrybe (SaaS), manages his son's GoFundMe campaign, runs a content business
- Has worked with major brands on social media strategy
- Deep expertise: social media (Facebook, Twitter, LinkedIn, TikTok, YouTube), AI tools, content strategy

CURRENT TOP TARGETS:
1. Sprout Social — social media management platform, ideal fit for Jesse's expertise
2. You.com — AI search company, Jesse's AI practitioner background is perfect
3. Wpromote — digital marketing agency, Director level
4. TLDR — tech newsletter/media company, social/content leadership role

YOUR RESPONSIBILITIES:
1. Weekly application status report every Friday
2. Draft personalized cover letters and outreach messages
3. Track application pipeline (applied, heard back, interviewing, offer, rejected)
4. Follow-up reminders (1 week after applying if no response)
5. Research target companies before applications
6. Draft LinkedIn connection requests and cold outreach
7. Interview prep when Jesse has a call scheduled

AUDIENCE-FIRST CONTENT PHILOSOPHY — apply this to every cover letter, outreach message, and follow-up you write:
Always think from the reader's perspective first. For every piece of outreach, ask: what will the hiring manager's immediate reaction be when they first see this? The goal is to craft content that makes them say "I just have to read this" or "I have to reply to this" the moment they see it. Lead with the hook that triggers that reaction, not with Jesse's background or the job title.

For cover letters specifically: the first sentence must make the hiring manager think "this person gets what we actually need" — not "here's another applicant." Never open with "I am writing to apply for..." or Jesse's title. Open with the specific thing that makes a reader stop and pay attention.

For cold outreach: the subject line and first sentence must create enough pull that not replying would feel like a mistake. The ask must be so clear and low-friction that saying yes takes less effort than saying no.

COVER LETTER PHILOSOPHY:
- Never generic — must reference something specific about the company
- Lead with Jesse's unique positioning (AI practitioner who does the work of a team)
- Show, don't tell — specific results and numbers where possible
- 3-4 paragraphs max, tight, no filler
- Match the company's energy and voice (startup vs. corporate, etc.)

OUTREACH PHILOSOPHY:
- LinkedIn connection requests: 1-2 sentences, specific reason for connecting
- Cold emails: subject line does the work, 3 sentences max, clear ask
- Follow-ups: 1 week after application, brief, add one new piece of value
- Always personalize with something real from their LinkedIn or company news`;

/**
 * Generate a cover letter
 */
async function generateCoverLetter(company, role, jobDescription, state) {
  return callClaude(
    SYSTEM_PROMPT,
    `Write a cover letter for Jesse to apply to ${company} for a ${role} position.

Job description/notes: ${jobDescription || 'Use your knowledge of ' + company}

Jesse's current situation context:
- Actively building Transkrybe (SaaS) as a solo operator using AI
- Managing Louis's GoFundMe campaign ($3K goal for powered wheelchair)
- Demonstrates his AI-operator approach in real time

Write a complete cover letter:
- To: Hiring Manager at ${company}
- Opens with a hook specific to ${company}
- Paragraph 1: Why Jesse is the right person (his unique positioning)
- Paragraph 2: Specific example of Jesse's work that's relevant
- Paragraph 3: Why ${company} specifically (do your research, be specific)
- Close: Clear ask, confident but not arrogant

Tone: Executive-level, confident, human. Not corporate.`,
    { maxTokens: 800 }
  );
}

/**
 * Generate a LinkedIn outreach message
 */
async function generateLinkedInOutreach(targetName, targetRole, company, context) {
  return callClaude(
    SYSTEM_PROMPT,
    `Write a LinkedIn connection request message from Jesse to ${targetName}, ${targetRole} at ${company}.

Context for outreach: ${context || 'Jesse is interested in opportunities at ' + company}

Requirements:
- Connection request note: 280 characters max (LinkedIn limit)
- Follow-up message (if they connect): 3-4 sentences, specific ask or value add
- Make it feel like a real human reaching out, not a template

Provide both versions labeled clearly.`,
    { maxTokens: 400 }
  );
}

/**
 * Generate a follow-up message
 */
async function generateFollowUp(company, role, daysSince, context) {
  return callClaude(
    SYSTEM_PROMPT,
    `Write a follow-up email for Jesse — he applied to ${company} for ${role} ${daysSince} days ago and hasn't heard back.

Context: ${context || 'Standard application follow-up'}

Write:
1. Subject line (specific, not "Following up on my application")
2. Email body (3 sentences max — express continued interest, add one new relevant piece of value or news, make a clear gentle ask)

Make it easy to say yes to.`,
    { maxTokens: 300 }
  );
}

/**
 * Handle an incoming message
 */
async function handleMessage(message, context = {}) {
  const { channel, thread_ts } = context;
  const state = await getState();
  const lowerMessage = message.toLowerCase();
  const jobState = state.projects?.job_search || {};

  let response;
  let needsApproval = false;
  let approvalTitle = '';

  // Route research requests to Research Agent
  if (lowerMessage.includes('research') || lowerMessage.includes('find out about')) {
    await postAsAgent('jobs', channel, '🔍 Routing to Research Agent for company intel...');
    await agentToAgent('jobs', 'research', `Jobs Agent needs research on: ${message}`);
    return;
  }

  if (lowerMessage.includes('cover letter')) {
    // Extract company name if mentioned
    const companyMatch = message.match(/for\s+([A-Z][a-zA-Z\s]+?)(?:\s+for|\s+role|\s+position|$)/);
    const company = companyMatch?.[1] || 'the company';
    const role = 'Director/VP level role';

    response = await generateCoverLetter(company, role, message, state);
    needsApproval = true;
    approvalTitle = `💼 Cover Letter for ${company} — needs your ✅`;

  } else if (lowerMessage.includes('outreach') || lowerMessage.includes('message') || lowerMessage.includes('linkedin')) {
    response = await generateLinkedInOutreach(
      'their team',
      'Hiring Manager',
      'the target company',
      message
    );
    needsApproval = true;
    approvalTitle = '💬 LinkedIn Outreach — needs your ✅';

  } else if (lowerMessage.includes('follow up') || lowerMessage.includes('follow-up')) {
    response = await generateFollowUp('the company', 'the role', 7, message);
    needsApproval = true;
    approvalTitle = '📬 Follow-Up Email — needs your ✅';

  } else if (lowerMessage.includes('applied') || lowerMessage.includes('application') || lowerMessage.includes('status')) {
    // Show application pipeline
    const applications = jobState.applications || [];
    if (applications.length === 0) {
      response = `No applications tracked yet. Tell me about an application and I'll log it.\n\n*Top targets to pursue:*\n• Sprout Social\n• You.com\n• Wpromote\n• TLDR`;
    } else {
      response = await callClaude(
        SYSTEM_PROMPT,
        `Generate an application pipeline status for Jesse.

Applications: ${JSON.stringify(applications, null, 2)}

Format as a clean pipeline view:
🟢 Active/Promising
🟡 Applied/Waiting
⚫ Closed/Rejected

Include follow-up recommendations for anything waiting > 7 days.`,
        { maxTokens: 600 }
      );
    }

  } else if (lowerMessage.includes('interview prep') || lowerMessage.includes('prep me')) {
    const companyMatch = message.match(/(?:for|at)\s+([A-Z][a-zA-Z\s]+?)(?:\s|$)/);
    const company = companyMatch?.[1] || 'the interview';

    response = await callClaude(
      SYSTEM_PROMPT,
      `Create interview prep for Jesse for ${company}.

Include:
1. Likely interview questions (5-7) based on Director-level roles
2. Jesse's best answers (using his specific background)
3. Smart questions Jesse should ask them
4. Red flags to watch for
5. Company-specific research notes

Keep it scannable on mobile.`,
      { maxTokens: 1200 }
    );

  } else {
    // General jobs question
    response = await callClaudeWithTools(
      SYSTEM_PROMPT,
      `Jesse (or another agent) asks: "${message}"

Job search state: ${JSON.stringify(jobState, null, 2)}

Respond as the Jobs Agent. Be specific and actionable about Jesse's job search.`,
      [RUN_COWORK_TASK_TOOL],
      createCoworkExecutor({ agentKey: 'jobs', channelId: channel, threadTs: thread_ts }),
      { maxTokens: 800 }
    );
  }

  if (needsApproval) {
    await postApprovalRequest('jobs', channel, `jobs_${Date.now()}`, approvalTitle, response);
  } else {
    await postAsAgent('jobs', channel, response, null, thread_ts);
  }

  await addTask('jobs', message.slice(0, 100));
}

/**
 * Generate weekly application status report
 */
async function generateWeeklyStatus(state) {
  const jobState = state.projects?.job_search || {};
  const applications = jobState.applications || [];

  return callClaude(
    SYSTEM_PROMPT,
    `Generate a weekly job search status report for the #jobs channel.

Applications tracked: ${applications.length}
${applications.length > 0 ? 'Applications:\n' + JSON.stringify(applications, null, 2) : ''}
Top targets: ${jobState.top_targets?.join(', ') || 'Sprout Social, You.com, Wpromote, TLDR'}
Recent tasks: ${JSON.stringify(state.tasks?.jobs?.slice(-5) || [], null, 2)}

Cover:
1. Pipeline status (active applications, their stages)
2. What outreach went out this week
3. Any follow-ups due
4. Recommendations for next week
5. Anything Jesse needs to approve or action

Keep it under 250 words. Mobile-friendly format.`,
    { maxTokens: 500 }
  );
}

module.exports = {
  handleMessage,
  generateCoverLetter,
  generateLinkedInOutreach,
  generateFollowUp,
  generateWeeklyStatus,
  SYSTEM_PROMPT,
};
