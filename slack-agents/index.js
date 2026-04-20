// index.js — MACF Slack Adapter v3
// 8 MACF-aligned agents running as one Bolt Socket Mode process on Railway.
// Each agent has an isolated persona, memory, and responsibility set.
// Inter-agent communication: [from: {Agent} → {Agent}] {message} pattern.

require('dotenv').config();

const { App } = require('@slack/bolt');
const { AGENTS, CHANNELS, CHANNEL_IDS, DELEGATION_TARGETS } = require('./config');
const state = require('./utils/state');

// ─── Validate environment ─────────────────────────────────────────────────────
const REQUIRED_ENV = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_APP_TOKEN', 'ANTHROPIC_API_KEY'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error('❌ Missing required env vars:', missing.join(', '));
  process.exit(1);
}

// ─── Bolt App (Socket Mode) ───────────────────────────────────────────────────
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: process.env.LOG_LEVEL || 'info',
});

// ─── Load all 8 agent modules ─────────────────────────────────────────────────
const execPM   = require('./agents/execPM');
const cmo      = require('./agents/cmo');
const cco      = require('./agents/cco');
const jobcoach = require('./agents/jobcoach');
const cuxo     = require('./agents/cuxo');
const cro      = require('./agents/cro');
const lawyer   = require('./agents/lawyer');
const cfo      = require('./agents/cfo');

// Map agentId → module (for delegation routing)
const AGENT_MODULES = {
  execPM,
  cmo,
  cco,
  jobcoach,
  cuxo,
  cro,
  lawyer,
  cfo,
};

// ─── Channel → Primary Agent routing ─────────────────────────────────────────
// When a message arrives in a channel, this determines which agent "owns" it.
const CHANNEL_PRIMARY_AGENT = {
  [CHANNELS.execPM]:    'execPM',
  [CHANNELS.marketing]: 'cmo',
  [CHANNELS.research]:  'cro',
  [CHANNELS.content]:   'cco',
  [CHANNELS.jobs]:      'jobcoach',
  [CHANNELS.it]:        null,      // No primary agent for #it — exec-pm handles
  [CHANNELS.management]:null,      // #management — exec-pm handles
};

// ─── Channel name cache ───────────────────────────────────────────────────────
// Reverse lookup: ID → name, using static map to avoid channels:read scope
const CHANNEL_ID_TO_NAME = Object.fromEntries(
  Object.entries(CHANNEL_IDS).map(([name, id]) => [id, name])
);
async function resolveChannelName(channelId, client) {
  if (CHANNEL_ID_TO_NAME[channelId]) return CHANNEL_ID_TO_NAME[channelId];
  try {
    const info = await client.conversations.info({ channel: channelId });
    const name = info.channel?.name || channelId;
    return name;
  } catch {
    return channelId;
  }
}

// ─── Detect explicit agent addressing in message text ────────────────────────
// Allows Jesse (or any agent) to address a specific agent by name or handle
// e.g. "@cmo can you..." or "CMO:" or "[from: X → CMO]"
function detectAddressedAgent(text) {
  if (!text) return null;

  // Check for delegation pattern: [from: X → Target]
  const delegMatch = text.match(/\[from:\s*.+?\s*→\s*(.+?)\]/i);
  if (delegMatch) {
    const target = delegMatch[1].trim().toLowerCase().replace(/[\s-]+/g, '');
    return DELEGATION_TARGETS[target] || null;
  }

  // Check for @handle or "AgentName:" addressing
  const handleMap = {
    'exec-pm': 'execPM', 'execpm': 'execPM', 'exec pm': 'execPM',
    'cmo': 'cmo',
    'cco': 'cco',
    'jobcoach': 'jobcoach', 'job coach': 'jobcoach',
    'cuxo': 'cuxo',
    'cro': 'cro',
    'lawyer': 'lawyer', 'counsel': 'lawyer',
    'cfo': 'cfo',
  };
  for (const [pattern, agentId] of Object.entries(handleMap)) {
    // Match @handle or "AgentName:" at start of message
    if (new RegExp(`(@|\\b)${pattern.replace(' ', '[- ]?')}(:|\\b)`, 'i').test(text)) {
      return agentId;
    }
  }
  return null;
}

// ─── App mention handler ──────────────────────────────────────────────────────
app.event('app_mention', async ({ event, say, client }) => {
  const channelName = await resolveChannelName(event.channel, client);
  const text = event.text || '';
  console.log(`[index] Mention in #${channelName}: "${text.slice(0, 80)}"`);

  state.updateChannelActivity(channelName);

  // 1. Try to detect if a specific agent was addressed
  const addressedId = detectAddressedAgent(text);

  // 2. Fall back to the channel's primary agent
  const primaryId = CHANNEL_PRIMARY_AGENT[channelName];

  // 3. Resolve the agent to use
  const agentId = addressedId || primaryId || 'execPM';
  const agentModule = AGENT_MODULES[agentId];

  if (agentModule?.handleMention) {
    await agentModule.handleMention({ event, say, client });
  } else {
    await execPM.handleMention({ event, say, client });
  }
});

// ─── Message handler (inter-agent delegation + activity tracking) ─────────────
app.event('message', async ({ event, client }) => {
  // Ignore bot messages to prevent infinite loops
  if (event.bot_id || event.subtype === 'bot_message') return;

  const channelName = await resolveChannelName(event.channel, client);
  state.updateChannelActivity(channelName);

  const text = event.text || '';

  // Check for delegation pattern and route to target agent
  const delegMatch = text.match(/\[from:\s*(.+?)\s*→\s*(.+?)\]/i);
  if (delegMatch) {
    const toName = delegMatch[2].trim().toLowerCase().replace(/[\s-]+/g, '');
    const toAgentId = DELEGATION_TARGETS[toName];
    if (toAgentId && AGENT_MODULES[toAgentId]?.handleDelegation) {
      console.log(`[index] Delegation → ${toAgentId}: "${text.slice(0, 80)}"`);
      await AGENT_MODULES[toAgentId].handleDelegation(text).catch(err =>
        console.error(`[index] Delegation error for ${toAgentId}:`, err)
      );
    }
  }
});

// ─── Reaction handler (content approval) ──────────────────────────────────────
app.event('reaction_added', async ({ event, client }) => {
  if (['white_check_mark', 'heavy_check_mark', 'x'].includes(event.reaction)) {
    await cco.handleReaction({ event, client }).catch(err =>
      console.error('[index] Reaction handling error:', err)
    );
  }
});

// ─── Slash commands ───────────────────────────────────────────────────────────
app.command('/health', async ({ ack, say }) => {
  await ack();
  const agents = Object.keys(AGENT_MODULES);
  const checks = agents.map(id => {
    const mod = AGENT_MODULES[id];
    return `• ${AGENTS[id]?.emoji || '🤖'} *${AGENTS[id]?.slackName || id}*: ✅ running`;
  }).join('\n');

  await say(`*🤖 MACF Slack Team — Health Status*\n\n${checks}\n\n• Process uptime: ${Math.round(process.uptime() / 60)} minutes\n• Memory files: Railway /data volume`);
});

app.command('/briefing', async ({ ack, say }) => {
  await ack();
  await say('Running morning briefing now...');
  await execPM.runMorningBriefing().catch(err => {
    console.error('[index] Manual briefing error:', err);
    say('Briefing failed. Check Railway logs.');
  });
});

app.command('/research', async ({ ack, say, command }) => {
  await ack();
  const query = command.text?.trim();
  if (!query) { await say('Usage: `/research <topic>`'); return; }
  await say(`🔍 Researching: _${query}_...`);
  await cro.handleMention({ event: { text: query }, say }).catch(err =>
    console.error('[index] Manual research error:', err)
  );
});

app.command('/content', async ({ ack, say }) => {
  await ack();
  await say('Generating a content draft now...');
  await cco.postDailyContentSuggestion().catch(err => {
    console.error('[index] Manual content error:', err);
    say('Content generation failed. Check Railway logs.');
  });
});

app.command('/jobs', async ({ ack, say }) => {
  await ack();
  await say('Scanning for job opportunities...');
  await jobcoach.searchJobs().catch(err => {
    console.error('[index] Manual job scan error:', err);
    say('Job scan failed. Check Railway logs.');
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────
app.error(async (error) => {
  console.error('[bolt] Unhandled Bolt error:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled rejection:', reason);
});

process.on('SIGTERM', () => {
  console.log('[process] SIGTERM — shutting down gracefully.');
  process.exit(0);
});

// ─── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  // Load all agent memory from disk
  state.loadAll();

  // Initialize all 8 agents (registers cron jobs, captures app.client)
  execPM.init(app);
  cmo.init(app);
  cco.init(app);
  jobcoach.init(app);
  cuxo.init(app);
  cro.init(app);
  lawyer.init(app);
  cfo.init(app);

  console.log('✅ All 8 MACF agents initialized');

  // Open WebSocket connection to Slack
  await app.start();

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🤖 MACF Slack Team v3 — LIVE via Socket Mode');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🔵 Exec PM    (@exec-pm)   — #exec-pm + ALL channels');
  console.log('  📊 CMO        (@cmo)        — #marketing, #research');
  console.log('  ✍️  CCO        (@cco)        — #content, #marketing');
  console.log('  💼 Job Coach  (@jobcoach)   — #jobs');
  console.log('  🟣 CUXO       (@cuxo)       — #marketing');
  console.log('  🔍 CRO        (@cro)        — #research, #marketing');
  console.log('  ⚖️  Lawyer     (@lawyer)     — #management');
  console.log('  💰 CFO        (@cfo)        — #management');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Slash commands: /health /briefing /research /content /jobs');
  console.log('Delegation: [from: AgentA → AgentB] message');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

start().catch(err => {
  console.error('❌ Fatal startup error:', err);
  process.exit(1);
});
