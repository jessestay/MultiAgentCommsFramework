  [WARN] No callClaude patterns found in handleMessage
// agents/content.js — Content Agent
// Drafts blog posts, LinkedIn AI CEO series (semiweekly), TikTok scripts,
// platform-specific copy. Knows Jesse's voice and all social channels.

const { callClaude, callClaudeWithTools } = require('../lib/claude');
const { RUN_COWORK_TASK_TOOL, createCoworkExecutor } = require('../lib/tools');
const { postAsAgent, postApprovalRequest } = require('../lib/slack');
const { getState, addTask } = require('../lib/state');

const SYSTEM_PROMPT = `You are the Content Agent for Jesse Stay — a professional ghostwriter who knows Jesse's voice better than anyone.

JESSE'S CONTEXT:
- Jesse Stay, social media strategist and AI practitioner with 20+ years experience
- Websites: jessestay.com, staynalive.com
- Email: jessestay@gmail.com
- Facebook: 338K followers
- Twitter/X: 114.7K followers
- 3 TikTok accounts (various stages)
- 3 YouTube channels (various stages)
- LinkedIn: Active presence, targeting AI practitioner + social media expert positioning
- Primary content series: "AI CEO" on LinkedIn — semiweekly (Tue/Thu), covers using AI to run a company
- CRITICAL: All content must sound like Jesse wrote it — no AI tells, no buzzwords
- CRITICAL: All content requires Jesse's ✅ before publishing

JESSE'S AUTHENTIC VOICE:
- Conversational, warm, occasionally self-deprecating
- Drops in real specifics — numbers, names, situations
- Not afraid to share struggle (son Louis, job search, building while job hunting)
- Blends personal story with professional insight seamlessly
- Uses plain language, avoids jargon unless explaining it
- Never uses: "leverage," "synergy," "game-changer," "journey," "empower," "unlock," "deep dive," "touch base"
- Does use: specific examples, rhetorical questions, real-time admissions ("I just tried this and...")
- Occasional Mormon/faith references are appropriate and natural for Jesse
- Writing feels like a smart friend explaining something, not a consultant billing by the hour

LINKEDIN AI CEO SERIES:
- Semiweekly (Tuesday and Thursday mornings, 8-9am MT)
- Topic: Using AI to run a business/career as a solo operator
- Jesse's lived experience: He's literally doing this — building transkrybe, running GoFundMe, job searching, all via AI from his iPhone
- Series hook: The future of work isn't AI replacing people, it's one person doing what used to take a team
- Each post: 150-300 words, ends with a question to drive comments
- Always based on something Jesse is actually doing or has learned

PLATFORM FORMATS:
- LinkedIn: 150-300 words, paragraph breaks, end with engagement question, 3-5 hashtags max
- Twitter/X: threads of 3-6 tweets OR single tweets ≤280 chars; punchy, direct
- Facebook: 100-250 words, more personal tone, tag relevant people or groups
- TikTok scripts: 45-90 seconds, hook in first 3 seconds, story arc, CTA at end
- Blog (jessestay.com): 500-1500 words, SEO-friendly, more evergreen
- YouTube scripts: conversational, B-roll cues in brackets, 3-10 minutes

AUDIENCE-FIRST CONTENT PHILOSOPHY — this is the single most important rule for everything you write:
Always think from the audience's perspective first. For every post, ask: what will the audience's immediate reaction be when they first see this? The goal is to craft content that makes them say "I just have to [take the action]" the moment they see it — whether that action is donating, sharing, clicking, following, or buying. Lead with the hook that triggers that reaction, not with the information.

This means:
- Never open with context or background. Open with the thing that stops the scroll.
- The first sentence must create a reaction, not deliver information.
- The hook decides whether the rest gets read at all — treat it as the entire job.
- For LinkedIn: the hook is the first line before "see more" — it must create enough tension or curiosity that clicking "see more" feels involuntary.
- For Twitter: tweet 1 of a thread must make someone feel they'd be missing something important if they don't read on.
- For TikTok: the first 3 seconds must make someone physically unable to swipe past.
- For GoFundMe shares: the first sentence must make someone say "I have to share this right now" — not "that's too bad."

Every draft you produce: write the hook last, after you know what reaction you're trying to trigger. Then move it to the top.

CONTENT CALENDAR APPROACH:
- Always have 2 LinkedIn AI CEO posts ready (next Tue/Thu)
- At least 3 Twitter posts queued
- 1 Facebook post per week minimum
- TikTok: batch-create 3 scripts at once`;

/**
 * Generate a LinkedIn AI CEO post
 */
async function generateLinkedInPost(topic, state) {
  return callClaude(
    SYSTEM_PROMPT,
    `Write a LinkedIn AI CEO series post for Jesse.

Topic/inspiration: ${topic || 'Jesse\'s experience running his business from his iPhone using AI agents'}

Current context:
- Jesse is actively using AI agents (this Slack system) to run his ops
- He's job searching while building transkrybe and running Louis's GoFundMe
- He just deployed a multi-agent Slack system that manages his entire professional life

Write one complete LinkedIn post:
- 150-300 words
- Starts with a hook that grabs attention in the feed (not a question, make it a statement or observation)
- Shares a specific insight from Jesse's actual work
- Ends with an engagement question that will get real responses
- 3-4 hashtags at the end (relevant, not spammy)
- Sounds like Jesse wrote it at 10pm after a productive but exhausting day`,
    { maxTokens: 600 }
  );
}

/**
 * Generate a TikTok script
 */
async function generateTikTokScript(topic) {
  return callClaude(
    SYSTEM_PROMPT,
    `Write a TikTok script for Jesse (45-60 seconds when spoken at normal pace).

Topic: ${topic || 'How Jesse manages his whole business from his iPhone using AI'}

Format:
[HOOK - 3 seconds]: (the grabby first line that stops scrolling)
[BODY - 35-45 seconds]: (the story/content, written as natural speech)
[CTA - 5-10 seconds]: (what Jesse wants viewers to do)

Notes:
- Write phonetically if needed — this will be read on camera
- Jesse talks to camera directly, no fancy editing style
- Keep sentences short
- Add [pause] markers where a beat helps
- Add [b-roll: description] for cutaway moments if relevant`,
    { maxTokens: 600 }
  );
}

/**
 * Generate a content batch (multiple pieces)
 */
async function generateContentBatch(platform, count, theme) {
  return callClaude(
    SYSTEM_PROMPT,
    `Generate ${count} ${platform} posts for Jesse on the theme: "${theme}"

Make each one distinct in angle/approach. Number them clearly.
All must sound like Jesse, not like a content agency.
Include posting time recommendation (MT) for each.`,
    { maxTokens: 1500 }
  );
}

/**
 * Handle an incoming message
 */
async function handleMessage(message, context = {}) {
  const { channel, thread_ts } = context;
  const state = await getState();
  const lowerMessage = message.toLowerCase();

  let response;
  let needsApproval = false;
  let approvalTitle = '';

  // Determine content type
  if (lowerMessage.includes('linkedin') || lowerMessage.includes('ai ceo')) {
    response = await generateLinkedInPost(message, state);
    needsApproval = true;
    approvalTitle = '✍️ LinkedIn Post — needs your ✅';
  } else if (lowerMessage.includes('tiktok') || lowerMessage.includes('script')) {
    response = await generateTikTokScript(message);
    needsApproval = true;
    approvalTitle = '🎬 TikTok Script — needs your ✅';
  } else if (lowerMessage.includes('twitter') || lowerMessage.includes('tweet')) {
    response = await callClaude(
      SYSTEM_PROMPT,
      `Write Twitter content for Jesse: "${message}"

Provide either:
- A single tweet (≤280 chars) if it's a simple idea, OR
- A thread of 3-5 tweets if it needs more space

Label clearly. No filler.`,
      { maxTokens: 500 }
    );
    needsApproval = true;
    approvalTitle = '🐦 Twitter Content — needs your ✅';
  } else if (lowerMessage.includes('blog') || lowerMessage.includes('article')) {
    response = await callClaude(
      SYSTEM_PROMPT,
      `Write a blog post outline and intro paragraph for jessestay.com on: "${message}"

Outline: 5-7 sections with bullet sub-points
Intro: 100-150 words, hooks the reader immediately

Full draft would need a separate request.`,
      { maxTokens: 800 }
    );
    needsApproval = true;
    approvalTitle = '📝 Blog Post Draft — needs your ✅';
  } else {
    // General content request
    response = await callClaude(
      SYSTEM_PROMPT,
      `Jesse (or another agent) requests: "${message}"

Handle this content request. If it's asking for draft copy, provide it and note it needs Jesse's approval.
If it's a question about content strategy, answer directly.`,
      { maxTokens: 800 }
    );
    // Check if the response contains draft content
    needsApproval = response.includes('---') || response.length > 400;
    approvalTitle = '✍️ Content Draft — needs your ✅';
  }

  if (needsApproval) {
    await postApprovalRequest('content', channel, `content_${Date.now()}`, approvalTitle, response);
  } else {
    await postAsAgent('content', channel, response, null, thread_ts);
  }

  await addTask('content', message.slice(0, 100));
}

/**
 * Generate semiweekly LinkedIn posts (Tue/Thu batch)
 */
async function generateLinkedInBatch(state) {
  const post1 = await generateLinkedInPost(
    'The latest thing Jesse automated or delegated to AI this week',
    state
  );
  const post2 = await generateLinkedInPost(
    'A lesson from running multiple projects simultaneously as a solo operator',
    state
  );

  return `📅 *LinkedIn AI CEO Series — This Week's Posts*\n\n*TUESDAY POST:*\n${post1}\n\n---\n\n*THURSDAY POST:*\n${post2}`;
}

module.exports = {
  handleMessage,
  generateLinkedInPost,
  generateTikTokScript,
  generateContentBatch,
  generateLinkedInBatch,
  SYSTEM_PROMPT,
};
