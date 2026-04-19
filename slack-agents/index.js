// index.js — Jesse Stay Slack Agents v2
// Always-on persistent process using @slack/bolt Socket Mode
// Runs on Railway (never Vercel — needs persistent WebSocket connection)

require('dotenv').config();

const { App } = require('@slack/bolt');
const { AGENTS, CHANNELS } = require('./config');
const state = require('./utils/state');

// ─── Validate environment ─────────────────────────────────────────────────────
const REQUIRED_ENV = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_APP_TOKEN', 'ANTHROPIC_API_KEY'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error('❌ Missing required environment variables:', missing.join(', '));
  console.error('   Copy .env.example to .env and fill in all values.');
  process.exit(1);
}

// ─── Bolt App with Socket Mode ────────────────────────────────────────────────
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,                           // 🔑 Key: WebSocket, no public URL needed
  appToken: process.env.SLACK_APP_TOKEN,      // xapp-... token from Basic Information
  logLevel: process.env.LOG_LEVEL || 'info',
});

// ─── Load agents ──────────────────────────────────────────────────────────────
const execPM    = require('./agents/execPM');
const marketing = require('./agents/marketing');
const cto = require('./agents/cto');
const content   = require('./agents/content');
const jobs      = require('./agents/jobs');
const research  = require('./agents/research');

// Channel name → agent module mapping (for delegation routing)
const channelAgentMap = {
  [CHANNELS.execPM]:    execPM,
  [CHANNELS.marketing]: marketing,
  [CHANNELS.it]: cto,
  [CHANNELS.content]:   content,
  [CHANNELS.jobs]:      jobs,
  [CHANNELS.research]:  research,
};

// ─── Bot User ID (resolved after startup) ────────────────────────────────────
let botUserId = null;

// ─── App mention handler ──────────────────────────────────────────────────────
// Routes @mentions to the appropriate agent based on the channel
app.event('app_mention', async ({ event, say, client }) => {
  try {
    // Resolve bot user ID on first mention
    if (!botUserId) {
      const auth = await client.auth.test();
      botUserId = auth.user_id;
    }

    const channelName = await resolveChannelName(event.channel, client);
    console.log(`[index] Mention in #${channelName} from user ${event.user}`);

    state.updateChannelActivity(channelName);

    // Check for delegation pattern first
    const msgText = event.text || '';
    for (const [ch, agent] of Object.entries(channelAgentMap)) {
      if (agent.handleDelegation) {
        const handled = await agent.handleDelegation(msgText, ch);
        if (handled) return;
      }
    }

    // Route to the agent for this channel
    const agent = channelAgentMap[channelName];
    if (agent && agent.handleMention) {
      await agent.handleMention({ event, say, client });
    } else {
      // Fallback: Exec PM handles anything unrouted
      await execPM.handleMention({ event, say, client });
    }
  } catch (err) {
    console.error('[index] Error handling mention:', err);
    await say('Sorry, I hit an error. Check Railway logs for details.').catch(() => {});
  }
});

// ─── Message event handler ────────────────────────────────────────────────────
// Listens to all messages to update channel activity timestamps
// and detect delegation patterns in non-mention messages
app.event('message', async ({ event, client }) => {
  if (event.bot_id || event.subtype === 'bot_message') return; // ignore our own messages

  const channelName = await resolveChannelName(event.channel, client);
  state.updateChannelActivity(channelName);

  // Check for inter-agent delegation messages in the text
  const text = event.text || '';
  const delegationPattern = /\[from: (\w[\w\s]+) → (\w[\w\s]+)\]/;
  const match = text.match(delegationPattern);

  if (match) {
    const toAgent = match[2].trim().toLowerCase().replace(/\s+/g, '');
    console.log(`[index] Delegation detected → ${toAgent}`);

    // Route to the target agent
    const agentHandlers = {
      'execpm': execPM,
      'marketing': marketing,
      'cto': cto,
      'content': content,
      'jobs': jobs,
      'research': research,
    };

    const targetAgent = agentHandlers[toAgent];
    if (targetAgent && targetAgent.handleDelegation) {
      await targetAgent.handleDelegation(text, channelName).catch(err =>
        console.error(`[index] Delegation handling error for ${toAgent}:`, err)
      );
    }
  }
});

// ─── Reaction handler ─────────────────────────────────────────────────────────
// ✅ reactions on Content agent messages mark content as approved
app.event('reaction_added', async ({ event, client }) => {
  if (['white_check_mark', 'heavy_check_mark', 'x'].includes(event.reaction)) {
    await content.handleReaction({ event, client }).catch(err =>
      console.error('[index] Reaction handling error:', err)
    );
  }
});

// ─── Slash commands ───────────────────────────────────────────────────────────
app.command('/health', async ({ ack, say }) => {
  await ack();
  const gofundmeAmount = state.get('gofundme.lastAmount') || 0;
  const lastCommit = state.get('github.lastCommitSha') || 'unknown';
  const lastHealthCheck = state.get('execPM.lastHealthCheck') || 'never';

  await say(`*🤖 Jesse Ops Agent Health*\n\n• GoFundMe tracked: *$${gofundmeAmount}*\n• Last commit SHA: \`${lastCommit}\`\n• Last health check: ${lastHealthCheck}\n• All agents: ✅ running\n• Process uptime: ${Math.round(process.uptime() / 60)} minutes`);
});

app.command('/content-suggest', async ({ ack, say }) => {
  await ack();
  await say('Generating a content suggestion now...');
  await content.postDailyContentSuggestion().catch(err => {
    console.error('[index] Manual content suggest error:', err);
    say('Failed to generate content suggestion. Check logs.');
  });
});

app.command('/research', async ({ ack, say, command }) => {
  await ack();
  const query = command.text?.trim();
  if (!query) {
    await say('Usage: `/research <topic>`');
    return;
  }
  await say(`Researching: _${query}_...`);
  await research.handleMention({ event: { text: query }, say }).catch(err =>
    console.error('[index] Manual research error:', err)
  );
});

// ─── Helper: resolve channel name from ID ─────────────────────────────────────
const channelNameCache = {};
async function resolveChannelName(channelId, client) {
  if (channelNameCache[channelId]) return channelNameCache[channelId];
  try {
    const info = await client.conversations.info({ channel: channelId });
    const name = info.channel?.name || channelId;
    channelNameCache[channelId] = name;
    return name;
  } catch (err) {
    return channelId;
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  // Load state from disk
  state.loadState();
  console.log('✅ State loaded');

  // Initialize all agents (registers their cron jobs)
  execPM.init(app);
  marketing.init(app);
  cto.init(app);
  content.init(app);
  jobs.init(app);
  research.init(app);
  console.log('✅ All 6 agents initialized');

  // Start the Bolt app (opens WebSocket connection to Slack)
  await app.start();
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🤖 Jesse Stay Slack Agents v2 — LIVE via Socket Mode');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Agents active:');
  console.log('  📋 Exec PM     → #exec-pm     (2hr health checks, 8am briefing)');
  console.log('  📣 Marketing   → #marketing   (GoFundMe every 30min, Mon calendar)');
  console.log('  🎵 CTO        → #it       (GitHub every 15min)');
  console.log('  ✍️  Content     → #content     (daily drafts, Mon-Sat)');
  console.log('  💼 Jobs        → #jobs        (search every 6hr, Fri pipeline)');
  console.log('  🔍 Research    → #research    (Tue/Fri proactive posts)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ─── Error handling ───────────────────────────────────────────────────────────
app.error(async (error) => {
  console.error('[bolt] Unhandled error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[process] Unhandled rejection at:', promise, 'reason:', reason);
});

process.on('SIGTERM', () => {
  console.log('[process] SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

// ─── Go! ──────────────────────────────────────────────────────────────────────
start().catch(err => {
  console.error('❌ Fatal startup error:', err);
  process.exit(1);
});
