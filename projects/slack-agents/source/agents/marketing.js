  [WARN] No callClaude patterns found in handleMessage
// agents/marketing.js — Marketing Agent
// Manages GoFundMe campaign for Louis (powered wheelchair, $3K goal),
// social content calendar, drafts copy, reports campaign metrics.

const { callClaude, callClaudeWithTools } = require('../lib/claude');
const { RUN_COWORK_TASK_TOOL, createCoworkExecutor } = require('../lib/tools');
const { postAsAgent, postApprovalRequest, agentToAgent } = require('../lib/slack');
const { getState, updateState, addTask } = require('../lib/state');

const SYSTEM_PROMPT = `You are the Marketing Agent for Jesse Stay — a senior social media strategist and campaign manager.

JESSE'S CONTEXT:
- Jesse Stay, social media strategist and AI practitioner, running all ops from iPhone via AI
- Son Louis (26) has ME/CFS and hEDS, needs powered wheelchair
- GoFundMe: https://www.gofundme.com/f/his-walker-throws-him-insurance-says-he-doesnt-need-one — $3,000 goal
- Louis's YouTube: https://youtu.be/owmjuEs9EIM
- GoFundMe email: gofundme@staynalive.com
- Social channels: Facebook (338K), Twitter (114.7K), 3 TikToks, 3 YouTubes, LinkedIn
- CRITICAL: Content must sound like a human wrote it — zero AI buzzwords, zero corporate speak
- CRITICAL: All public publishing requires Jesse's ✅ approval before going live

YOUR PRIMARY RESPONSIBILITIES:
1. GoFundMe campaign — drive donations toward $3K goal for Louis's powered wheelchair
2. Weekly social content calendar — posts for Facebook, Twitter, LinkedIn
3. Campaign copy — fundraiser updates, share requests, thank-you posts
4. Metrics reporting — donations raised, shares, engagement
5. Outreach ideas — who to contact, what to say, timing

GOFUNDME CAMPAIGN CONTEXT:
- Louis (Jesse's 26-year-old son) has ME/CFS (Myalgic Encephalomyelitis/Chronic Fatigue Syndrome) and hEDS (hypermobile Ehlers-Danlos Syndrome)
- His insurance denied coverage for a powered wheelchair he desperately needs for mobility
- A powered walker actually threw him, causing injury — the campaign title references this
- Goal: $3,000 for a powered wheelchair
- Campaign should be authentic, personal, never manipulative
- Always mention Louis's dignity and agency — he's a person, not a tragic figure

CONTENT VOICE:
- Write like Jesse actually talks — direct, warm, knowledgeable about social media
- Never use: "game-changing", "leverage", "synergy", "empower", "journey", "resonate"
- Do use: specific details, real emotions, calls to action that feel natural
- Facebook posts can be longer and more personal
- Twitter: sharp, short, punchy
- LinkedIn: professional but still human, tie to Jesse's work in AI/social media
- TikTok scripts: conversational, tell Louis's story directly

AUDIENCE-FIRST CONTENT PHILOSOPHY — this is the foundation of everything you create:
Always think from the audience's perspective first. For every post, ask: what will the audience's immediate reaction be when they first see this? The goal is to craft content that makes them say "I just have to [take the action]" the moment they see it — whether that action is donating, sharing, clicking, following, or buying. Lead with the hook that triggers that reaction, not with the information.

For GoFundMe specifically: a donor's first reaction should be "I have to share this" or "I have to give right now" — not "that's a sad situation." The hook must create urgency or emotional immediacy, not just describe the circumstance. Never bury the ask. Never open with background context. Open with the thing that makes someone stop scrolling.

SOCIAL MEDIA STRATEGY:
- Best times: Facebook 9am/1pm/7pm MT, Twitter 8am/12pm/5pm MT, LinkedIn Tue-Thu 8am-10am MT
- Mix: 40% GoFundMe updates, 30% Jesse's professional content, 30% general value
- Always include direct GoFundMe link in fundraiser posts
- Repost when donations hit milestones ($500, $1K, $2K, $3K)`;

/**
 * Generate a weekly content calendar
 */
async function generateWeeklyCalendar(state) {
  const gofundme = state.projects?.gofundme || {};
  const raised = gofundme.raised || 0;
  const goal = gofundme.goal || 3000;
  const pct = Math.round((raised / goal) * 100);

  const calendar = await callClaude(
    SYSTEM_PROMPT,
    `Generate a weekly social media content calendar for Jesse.

GoFundMe status: $${raised} raised of $${goal} goal (${pct}%)
Week of: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

Create posts for:
- Monday: Facebook (GoFundMe update or share request)
- Tuesday: LinkedIn (professional content with GoFundMe mention)
- Wednesday: Twitter thread (3-5 tweets about Louis or Jesse's work)
- Thursday: Facebook (shareable content about ME/CFS or disability awareness)
- Friday: All platforms (weekly wrap + GoFundMe push)

For each post include:
- Platform
- Suggested time (MT)
- Draft copy (ready to use, not a template)
- Character count (Twitter must be ≤280 each)
- Relevant hashtags (max 3-5, only if they actually help)

Format clearly for Slack. Each post separated with a divider.`,
    { maxTokens: 2000 }
  );

  return calendar;
}

/**
 * Generate a GoFundMe campaign update post
 */
async function generateCampaignUpdate(milestone, state) {
  const gofundme = state.projects?.gofundme || {};

  return callClaude(
    SYSTEM_PROMPT,
    `Generate a GoFundMe campaign update for Jesse to post.

Milestone/context: ${milestone}
Amount raised: $${gofundme.raised || 0} of $${gofundme.goal || 3000}

Write 3 versions:
1. GoFundMe update (can be longer, 150-300 words, personal and grateful)
2. Facebook share post (80-150 words)
3. Twitter (under 240 chars, leave room for the link)

Make them feel like Jesse wrote them tonight after a long day, checking his phone. Not polished PR copy.`,
    { maxTokens: 1000 }
  );
}

/**
 * Handle an incoming message
 */
async function handleMessage(message, context = {}) {
  const { channel, thread_ts } = context;
  const state = await getState();
  const lowerMessage = message.toLowerCase();

  // Determine what kind of request this is
  let taskType = 'general';
  if (lowerMessage.includes('calendar') || lowerMessage.includes('schedule')) {
    taskType = 'calendar';
  } else if (lowerMessage.includes('gofundme') || lowerMessage.includes('campaign') || lowerMessage.includes('donation')) {
    taskType = 'campaign';
  } else if (lowerMessage.includes('twitter') || lowerMessage.includes('facebook') || lowerMessage.includes('linkedin')) {
    taskType = 'social_post';
  } else if (lowerMessage.includes('research') || lowerMessage.includes('comp') || lowerMessage.includes('find')) {
    // Route research requests to Research Agent
    await postAsAgent('marketing', channel, '🔍 Asking Research Agent for backup on this...');
    await agentToAgent('marketing', 'research', `Marketing needs: ${message}`);
    return;
  }

  let response;

  if (taskType === 'calendar') {
    response = await generateWeeklyCalendar(state);
    await postApprovalRequest(
      'marketing',
      channel,
      `calendar_${Date.now()}`,
      '📅 Weekly Content Calendar — needs your ✅',
      response
    );
    return;
  }

  if (taskType === 'campaign') {
    response = await generateCampaignUpdate(message, state);
    await postApprovalRequest(
      'marketing',
      channel,
      `campaign_${Date.now()}`,
      '📣 GoFundMe Campaign Update — needs your ✅',
      response
    );
    return;
  }

  // General marketing question
  response = await callClaude(
    SYSTEM_PROMPT,
    `Jesse (or another agent) says: "${message}"

GoFundMe status: $${state.projects?.gofundme?.raised || 0} raised of $3,000 goal

Respond as the Marketing Agent. Be specific and actionable.`,
    { maxTokens: 800 }
  );

  await postAsAgent('marketing', channel, response, null, thread_ts);
  await addTask('marketing', message.slice(0, 100));
}

/**
 * Generate weekly marketing status
 */
async function generateWeeklyStatus(state) {
  return callClaude(
    SYSTEM_PROMPT,
    `Generate a brief weekly marketing status update for the #marketing channel.

GoFundMe: $${state.projects?.gofundme?.raised || 0}/$${state.projects?.gofundme?.goal || 3000}
Recent tasks: ${JSON.stringify(state.tasks?.marketing?.slice(-5) || [])}

Cover: GoFundMe momentum, what content went out, what's planned this week, anything Jesse needs to approve or action.

Keep it under 200 words. Bullet format.`,
    { maxTokens: 400 }
  );
}

module.exports = {
  handleMessage,
  generateWeeklyCalendar,
  generateCampaignUpdate,
  generateWeeklyStatus,
  SYSTEM_PROMPT,
};
