  [WARN] No callClaude patterns found in handleMessage
// agents/research.js — Research Agent
// Background research for any agent or Jesse directly.
// Web search, competitive intel, data gathering.

const { callClaude, callClaudeWithTools } = require('../lib/claude');
const { RUN_COWORK_TASK_TOOL, createCoworkExecutor } = require('../lib/tools');
const { postAsAgent } = require('../lib/slack');
const { addTask } = require('../lib/state');

const SYSTEM_PROMPT = `You are the Research Agent for Jesse Stay — a sharp research analyst who finds signal in noise and delivers it concisely.

JESSE'S CONTEXT:
- Jesse Stay, social media strategist and AI practitioner
- You support Jesse and all other agents (Exec PM, Marketing, Transkrybe, Content, Jobs)
- Jesse reads everything on iPhone — keep research outputs scannable and actionable
- Results should always answer: "So what? What should Jesse do with this?"

YOUR CAPABILITIES:
1. Company research (for job applications, partnerships, competitors)
2. Person research (hiring managers, potential contacts, collaborators)
3. GoFundMe campaign research (comparable campaigns, best practices, outreach targets)
4. Transkrybe competitive analysis (transcription market, SaaS competitors)
5. Content research (trending topics, Jesse's audience interests)
6. General fact-finding for any question from Jesse or other agents

RESEARCH OUTPUT FORMAT:
- Always start with a TL;DR (1-2 sentences of the most important finding)
- Key facts in bullet form
- Sources noted inline (company website, LinkedIn, news, etc.)
- End with "Recommended action:" — what Jesse or the requesting agent should do with this
- Flag if you couldn't find something reliable

WHEN RESPONDING TO AGENT-TO-AGENT REQUESTS:
- The message will be tagged [agent→agent]
- Address the response back to the requesting agent specifically
- Give them exactly what they need for their use case
- If it's Marketing asking for GoFundMe comps, give comps — not a general fundraising lecture

AUDIENCE-FIRST CONTENT PHILOSOPHY (apply when evaluating content effectiveness or researching what works):
Always think from the audience's perspective first. For every post or campaign being researched, ask: what will the audience's immediate reaction be when they first see this? The goal is to craft content that makes them say "I just have to [take the action]" the moment they see it — whether that action is donating, sharing, clicking, following, or buying. Lead with the hook that triggers that reaction, not with the information.

When researching GoFundMe campaigns, competitor content, or successful outreach — specifically look for: what hooks they lead with, what the first-impression reaction would be, and why it drives action. Highlight examples of hooks that work and explain why they trigger an immediate response. Flag anything that buries the action trigger.

RESEARCH ETHICS:
- Only use publicly available information
- Don't speculate as fact — clearly label assumptions
- If something is unverifiable, say so`;

/**
 * Research a company for job applications
 */
async function researchCompany(company) {
  return callClaude(
    SYSTEM_PROMPT,
    `Research ${company} for Jesse's job application context.

Provide:
1. What ${company} does (in plain English, 2-3 sentences)
2. Company size, stage, funding/public status
3. Current notable news, initiatives, or changes (anything in last 6 months)
4. Key leadership (CEO, relevant VPs)
5. Their likely pain points that Jesse's skills address
6. Culture signals from job postings, LinkedIn, Glassdoor, etc.
7. 2-3 specific things Jesse should reference in his application to show he did his homework

TL;DR first. Keep total response under 400 words.`,
    { maxTokens: 800 }
  );
}

/**
 * Research GoFundMe campaign comparisons
 */
async function researchGoFundMeComps() {
  return callClaude(
    SYSTEM_PROMPT,
    `Research successful GoFundMe campaigns for medical equipment or disability needs.

Louis Stay's campaign:
- For a powered wheelchair ($3K goal)
- Son has ME/CFS and hEDS
- Insurance denied coverage
- Campaign: https://www.gofundme.com/f/his-walker-throws-him-insurance-says-he-doesnt-need-one

Research and provide:
1. What makes medical equipment GoFundMe campaigns successful
2. Typical share patterns and what drives viral spread
3. Best practices for updates (frequency, content, tone)
4. Communities/groups that typically support these causes (Facebook groups, Reddit, disability advocacy orgs)
5. Outreach channels that work well (beyond just personal networks)
6. 3 specific actionable tactics Jesse could implement this week

Be specific about ME/CFS and EDS communities — these are real conditions with active advocacy communities.`,
    { maxTokens: 800 }
  );
}

/**
 * Research Transkrybe competitors
 */
async function researchTranskrybeCompetitors() {
  return callClaude(
    SYSTEM_PROMPT,
    `Research the transcription SaaS market for Transkrybe (transkrybe.com).

Provide:
1. Key competitors in audio/music transcription
2. Their pricing models
3. Features that differentiate them
4. Market gaps Transkrybe could fill
5. Recent funding or major moves in the space
6. User complaints about existing tools (Reddit, Product Hunt reviews, App Store reviews)

Focus on what makes Transkrybe's niche potentially defensible. What should Jesse double down on?

TL;DR first. Under 400 words.`,
    { maxTokens: 800 }
  );
}

/**
 * Handle an incoming message (from Jesse or another agent)
 */
async function handleMessage(message, context = {}) {
  const { channel, thread_ts } = context;
  const lowerMessage = message.toLowerCase();

  // Detect if this is an agent-to-agent request
  const isAgentRequest = message.startsWith('[agent→agent');

  let response;

  // Route to specialized research functions when possible
  if (lowerMessage.includes('gofundme') || lowerMessage.includes('campaign') || lowerMessage.includes('fundrais')) {
    response = await researchGoFundMeComps();
  } else if (
    lowerMessage.includes('transkrybe') && (lowerMessage.includes('competitor') || lowerMessage.includes('market'))
  ) {
    response = await researchTranskrybeCompetitors();
  } else if (
    lowerMessage.includes('research') &&
    (lowerMessage.includes('sprout') || lowerMessage.includes('you.com') || lowerMessage.includes('wpromote') || lowerMessage.includes('tldr'))
  ) {
    const companyMatch = lowerMessage.match(/sprout social|you\.com|wpromote|tldr/i);
    const company = companyMatch ? companyMatch[0] : 'the company';
    response = await researchCompany(company);
  } else {
    // General research request
    response = await callClaude(
      SYSTEM_PROMPT,
      `Research request${isAgentRequest ? ' (from another agent)' : ' from Jesse'}: "${message}"

Provide thorough, actionable research. Use your knowledge to give the best answer possible.
If you'd normally need to search the web, use your training data but clearly note it and suggest Jesse verify anything time-sensitive.

TL;DR first, then details, then "Recommended action:".`,
      { maxTokens: 1000 }
    );
  }

  await postAsAgent('research', channel, response, null, thread_ts);
  await addTask('research', message.slice(0, 100));
}

module.exports = {
  handleMessage,
  researchCompany,
  researchGoFundMeComps,
  researchTranskrybeCompetitors,
  SYSTEM_PROMPT,
};
