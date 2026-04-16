// lib/slack.js — Slack API utilities
const crypto = require('crypto');

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

// Primary posting token — Jesse Ops Agents bot, already in all 6 channels.
// Uses chat.write.customize scope to post with per-agent usernames/emojis.
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// Per-agent bot tokens — configured in Vercel (SLACK_TOKEN_EXEC_PM, etc.) but currently
// using SLACK_BOT_TOKEN as primary since individual bots still need channels:join scope.
// UPGRADE PATH: Add channels:join scope to each app, invite to channel, then switch to:
//   'exec-pm': process.env.SLACK_TOKEN_EXEC_PM || SLACK_BOT_TOKEN, etc.
const AGENT_TOKENS = {
  'exec-pm':    SLACK_BOT_TOKEN,
  marketing:    SLACK_BOT_TOKEN,
  transkrybe:   SLACK_BOT_TOKEN,
  content:      SLACK_BOT_TOKEN,
  jobs:         SLACK_BOT_TOKEN,
  research:     SLACK_BOT_TOKEN,
};

// Agent personas
const AGENTS = {
  'exec-pm': {
    username: '📋 Exec PM',
    icon_emoji: ':clipboard:',
    channel: 'exec-pm',
  },
  marketing: {
    username: '📣 Marketing Agent',
    icon_emoji: ':mega:',
    channel: 'marketing',
  },
  transkrybe: {
    username: '🎵 Transkrybe Agent',
    icon_emoji: ':musical_note:',
    channel: 'transkrybe',
  },
  content: {
    username: '✍️ Content Agent',
    icon_emoji: ':writing_hand:',
    channel: 'content',
  },
  jobs: {
    username: '💼 Jobs Agent',
    icon_emoji: ':briefcase:',
    channel: 'jobs',
  },
  research: {
    username: '🔍 Research Agent',
    icon_emoji: ':mag:',
    channel: 'research',
  },
};

// Channel name → agent key mapping
const CHANNEL_TO_AGENT = {
  'exec-pm': 'exec-pm',
  marketing: 'marketing',
  transkrybe: 'transkrybe',
  content: 'content',
  jobs: 'jobs',
  research: 'research',
};

// Message prefix → agent key mapping
const PREFIX_TO_AGENT = {
  'exec:': 'exec-pm',
  'marketing:': 'marketing',
  'transkrybe:': 'transkrybe',
  'content:': 'content',
  'jobs:': 'jobs',
  'research:': 'research',
};

/**
 * Verify Slack request signature
 */
function verifySlackSignature(req) {
  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];

  if (!timestamp || !signature) return false;

  // Prevent replay attacks (5 minute window)
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp) < fiveMinutesAgo) return false;

  const rawBody = req.rawBody || '';
  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto
    .createHmac('sha256', SLACK_SIGNING_SECRET)
    .update(sigBasestring)
    .digest('hex');
  const computedSig = `v0=${hmac}`;

  return crypto.timingSafeEqual(
    Buffer.from(computedSig, 'utf8'),
    Buffer.from(signature, 'utf8')
  );
}

/**
 * Post a message as a specific agent persona
 */
async function postAsAgent(agentKey, channel, text, blocks = null, thread_ts = null) {
  const agent = AGENTS[agentKey];
  if (!agent) throw new Error(`Unknown agent: ${agentKey}`);

  // Allow channel override; default to agent's home channel
  const targetChannel = channel || agent.channel;

  const body = {
    channel: targetChannel,
    username: agent.username,
    icon_emoji: agent.icon_emoji,
    text,
  };

  if (blocks) body.blocks = blocks;
  if (thread_ts) body.thread_ts = thread_ts;

  // Use per-agent token if available, fall back to default
  const token = AGENT_TOKENS[agentKey] || SLACK_BOT_TOKEN;

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!data.ok) {
    console.error(`Slack postMessage error [${agentKey}]:`, data.error);
  }
  return data;
}

/**
 * Post an approval request with ✅/❌ buttons
 */
async function postApprovalRequest(agentKey, channel, actionId, title, content, metadata = {}) {
  const agent = AGENTS[agentKey];
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${title}*\n\n${content}`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '✅ Approve' },
          style: 'primary',
          action_id: `approve_${actionId}`,
          value: JSON.stringify({ agentKey, actionId, ...metadata }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '❌ Revise' },
          style: 'danger',
          action_id: `revise_${actionId}`,
          value: JSON.stringify({ agentKey, actionId, ...metadata }),
        },
      ],
    },
  ];

  return postAsAgent(agentKey, channel, title, blocks);
}

/**
 * Determine which agent should handle a message
 */
function routeMessage(channelName, messageText) {
  // Check for explicit prefix first (any channel)
  const lowerText = messageText.toLowerCase().trim();
  for (const [prefix, agentKey] of Object.entries(PREFIX_TO_AGENT)) {
    if (lowerText.startsWith(prefix)) {
      return {
        agentKey,
        cleanText: messageText.slice(prefix.length).trim(),
      };
    }
  }

  // Route by channel name
  const agentKey = CHANNEL_TO_AGENT[channelName] || 'exec-pm';
  return { agentKey, cleanText: messageText };
}

/**
 * Post an agent-to-agent message (tagged for routing)
 */
async function agentToAgent(fromAgent, toAgent, message) {
  const targetChannel = AGENTS[toAgent]?.channel;
  if (!targetChannel) throw new Error(`Unknown target agent: ${toAgent}`);

  const taggedMessage = `[agent→agent from ${AGENTS[fromAgent]?.username || fromAgent}]\n${message}`;
  return postAsAgent(toAgent, targetChannel, taggedMessage);
}

/**
 * Add a reaction to a message
 */
async function addReaction(channel, timestamp, emoji) {
  const response = await fetch('https://slack.com/api/reactions.add', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, timestamp, name: emoji }),
  });
  return response.json();
}

/**
 * Get channel info by name (resolve channel ID)
 */
async function getChannelId(channelName) {
  const response = await fetch(
    `https://slack.com/api/conversations.list?limit=200&types=public_channel,private_channel`,
    {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    }
  );
  const data = await response.json();
  if (!data.ok) return null;

  const channel = data.channels.find(
    (c) => c.name === channelName || c.name === channelName.replace('#', '')
  );
  return channel?.id || null;
}

module.exports = {
  AGENTS,
  AGENT_TOKENS,
  CHANNEL_TO_AGENT,
  PREFIX_TO_AGENT,
  verifySlackSignature,
  postAsAgent,
  postApprovalRequest,
  routeMessage,
  agentToAgent,
  addReaction,
  getChannelId,
};

