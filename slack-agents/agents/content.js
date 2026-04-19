// agents/content.js — Content Agent ✍️
// Posts daily draft content for Jesse's approval. Never posts live.

const cron = require('node-cron');
const { AGENTS, CHANNELS } = require('../config');
const state = require('../utils/state');
const { generateReport, generateProactivePost } = require('../utils/anthropic');
const { fetchDonationTotal } = require('../utils/gofundme');

const AGENT = AGENTS.content;

// Platforms Jesse posts on — rotate through them
const PLATFORMS = [
  { name: 'Facebook', audience: '338K followers', type: 'long-form or short update, images work well' },
  { name: 'Twitter/X', audience: '114.7K followers', type: 'max 280 chars, punchy and direct' },
  { name: 'LinkedIn', audience: 'professional network', type: 'professional tone, 150-300 words, story-driven' },
  { name: 'TikTok', audience: 'short video audience', type: 'video script concept, hook in first 3 seconds' },
];

// Content themes to rotate
const CONTENT_THEMES = [
  'GoFundMe awareness for Louis — disability advocacy angle',
  'transkrybe product — what it does and why musicians love it',
  "Jesse's personal brand — social media expertise, dad life, accessibility",
  'GoFundMe — donor thank-you or milestone celebration',
  'ME/CFS and hEDS awareness — Louis story, educational angle',
  'transkrybe — behind-the-scenes development story',
  'Motivation/insight post — Jesse as thought leader',
  'GoFundMe — urgent appeal, why the wheelchair matters for Louis',
];

let slackClient = null;
let channelIdMap = {};
let platformIndex = 0;
let themeIndex = 0;

async function resolveChannel(name) {
  if (channelIdMap[name]) return channelIdMap[name];
  try {
    const result = await slackClient.conversations.list({ types: 'public_channel,private_channel', limit: 200 });
    for (const ch of result.channels) {
      channelIdMap[ch.name] = ch.id;
    }
    return channelIdMap[name];
  } catch (err) {
    console.error('[content] Could not resolve channel:', name, err.message);
    return null;
  }
}

async function postToChannel(channelName, text) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) {
    console.warn(`[content] Could not find channel: ${channelName}`);
    return;
  }
  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      text: `${AGENT.emoji} *Content* | ${text}`,
      unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[content] Posted to #${channelName}`);
  } catch (err) {
    console.error(`[content] Error posting to #${channelName}:`, err.message);
  }
}

// ─── Daily content suggestion (10am MT = 16:00 UTC, Mon-Fri) ─────────────────
async function postDailyContentSuggestion() {
  console.log('[content] Generating daily content suggestion...');

  const today = new Date().toDateString();
  const lastSuggested = state.get('content.lastSuggestedDate');
  if (lastSuggested === today) {
    console.log('[content] Already suggested content today, skipping.');
    return;
  }

  // Rotate platform and theme
  const platform = PLATFORMS[platformIndex % PLATFORMS.length];
  const theme = CONTENT_THEMES[themeIndex % CONTENT_THEMES.length];
  platformIndex++;
  themeIndex++;

  const gofundme = await fetchDonationTotal();
  const pendingApprovals = state.get('content.pendingApprovals') || [];
  const pendingCount = pendingApprovals.length;

  const context = `
Generate a draft piece of content for Jesse Stay to review and approve.

Platform: ${platform.name} (${platform.audience})
Format: ${platform.type}
Theme: ${theme}
GoFundMe status: ${gofundme ? `$${gofundme.amount} raised of $2,800 (${gofundme.percentFunded}%)` : 'Unknown'}
${pendingCount > 0 ? `Note: Jesse has ${pendingCount} other content piece(s) pending approval.` : ''}

Write the actual draft content. Make it sound like Jesse wrote it — human, direct, no AI buzzwords.
For Facebook/LinkedIn: include a hook and closing CTA.
For Twitter/X: stay under 280 chars.
For TikTok: write a video script concept with hook, main point, CTA.

After the draft, add a one-line rationale: "Why this works: [reason]"
  `.trim();

  const draft = await generateReport({ systemPrompt: AGENT.systemPrompt, context, maxTokens: 800 });

  // Generate a simple ID for tracking
  const id = Date.now().toString(36);
  const pending = state.get('content.pendingApprovals') || [];
  pending.push({
    id,
    platform: platform.name,
    theme,
    suggestedAt: new Date().toISOString(),
    status: 'pending',
  });
  // Keep only last 10 pending items
  state.set('content.pendingApprovals', pending.slice(-10));
  state.set('content.lastSuggestedDate', today);

  await postToChannel(
    AGENT.channel,
    `*📝 Daily Content Draft* — ${platform.name}\n\n${draft}\n\n---\n_ID: ${id} | Reply ✅ to approve, ❌ to skip_`
  );
}

// ─── Weekly content roundup (Fridays 4pm MT = 22:00 UTC) ─────────────────────
async function postWeeklyRoundup() {
  console.log('[content] Generating weekly content roundup...');
  const pending = state.get('content.pendingApprovals') || [];
  const pendingThisWeek = pending.filter(p => {
    const age = Date.now() - new Date(p.suggestedAt).getTime();
    return age < 7 * 24 * 60 * 60 * 1000;
  });

  if (pendingThisWeek.length === 0) {
    await postToChannel(AGENT.channel, '📊 *Weekly Content Roundup* — No pending content this week. Run `/content suggest` to generate new drafts.');
    return;
  }

  const list = pendingThisWeek.map(p => `• *${p.platform}* — ${p.theme.substring(0, 50)} (${p.status === 'pending' ? '⏳ awaiting ✅' : '✅ approved'})`).join('\n');
  await postToChannel(AGENT.channel, `📊 *Weekly Content Roundup*\n${list}\n\nApprove or skip each piece to keep the queue clean.`);
}

// ─── Handle ✅ approval reactions ────────────────────────────────────────────
async function handleReaction({ event }) {
  if (!['white_check_mark', 'heavy_check_mark'].includes(event.reaction)) return;
  // This is a simplified handler — in production you'd look up the message
  // to find the content ID and mark it approved
  console.log('[content] Approval reaction received:', event.reaction);
}

// ─── Respond to @mentions ────────────────────────────────────────────────────
async function handleMention({ event, say }) {
  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) return;

  const pending = state.get('content.pendingApprovals') || [];
  const response = await generateReport({
    systemPrompt: AGENT.systemPrompt,
    context: `Jesse asked: "${text}"\n\nPending approvals: ${pending.length}\nLast suggestion date: ${state.get('content.lastSuggestedDate') || 'never'}`,
  });

  await say(`${AGENT.emoji} *Content* | ${response}`);
  state.updateChannelActivity(AGENT.channel);
}

// ─── Handle delegation ───────────────────────────────────────────────────────
async function handleDelegation(message, channelName) {
  const delegationMatch = message.match(/\[from: (\w[\w\s]+) → Content\] (.+)/s);
  if (!delegationMatch) return false;

  const fromAgent = delegationMatch[1];
  const request = delegationMatch[2].trim();
  console.log(`[content] Delegation from ${fromAgent}:`, request);

  const response = await generateReport({
    systemPrompt: AGENT.systemPrompt,
    context: `Delegation request from ${fromAgent} agent:\n${request}`,
    maxTokens: 1000,
  });

  await postToChannel(AGENT.channel, `[from: Content → ${fromAgent}] ${response}`);
  return true;
}

// ─── Init ────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[content] Agent initialized');

  // Daily content suggestion — 10am MT weekdays (16:00 UTC)
  cron.schedule('0 16 * * 1-5', () => postDailyContentSuggestion().catch(err => console.error('[content] Daily suggestion error:', err)));

  // Weekend suggestion — Saturday 11am MT (17:00 UTC)
  cron.schedule('0 17 * * 6', () => postDailyContentSuggestion().catch(err => console.error('[content] Weekend suggestion error:', err)));

  // Weekly roundup — Fridays 4pm MT (22:00 UTC)
  cron.schedule('0 22 * * 5', () => postWeeklyRoundup().catch(err => console.error('[content] Weekly roundup error:', err)));
}

module.exports = { init, handleMention, handleDelegation, handleReaction, postDailyContentSuggestion };
