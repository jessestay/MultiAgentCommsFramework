// api/slack/actions.js — Slack Interactive Components Handler
// Handles button clicks (block_actions) and modal submissions (view_submission).
// Slack requires a response within 3 seconds, so we ACK immediately then process async.

const { verifySlackSignature, postAsAgent, AGENTS } = require('../../lib/slack');
const execPm = require('../../agents/exec-pm');
const marketing = require('../../agents/marketing');
const transkrybe = require('../../agents/transkrybe');
const content = require('../../agents/content');
const jobs = require('../../agents/jobs');
const research = require('../../agents/research');

const AGENT_HANDLERS = {
  'exec-pm': execPm,
  marketing,
  transkrybe,
  content,
  jobs,
  research,
};

// action_id / callback_id prefix → agent key
// Order matters: more-specific prefixes first.
const ACTION_PREFIX_MAP = [
  ['exec_pm_', 'exec-pm'],
  ['exec_', 'exec-pm'],
  ['marketing_', 'marketing'],
  ['transkrybe_', 'transkrybe'],
  ['content_', 'content'],
  ['jobs_', 'jobs'],
  ['research_', 'research'],
  // approval buttons (any agent — agent key is embedded in value JSON)
  ['approve_', null],
  ['revise_', null],
];

/**
 * Resolve agent key from an action_id or callback_id string.
 * Returns null for approval/revision actions (agent comes from the value payload).
 */
function resolveAgentKey(id) {
  if (!id) return 'exec-pm';
  for (const [prefix, agentKey] of ACTION_PREFIX_MAP) {
    if (id.startsWith(prefix)) return agentKey; // null means "read from value"
  }
  return 'exec-pm'; // default
}

/**
 * Read the full raw body from the request stream.
 */
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/**
 * Parse URL-encoded form body and extract the `payload` JSON field.
 * Slack sends interactive payloads as: application/x-www-form-urlencoded
 * with a single field named `payload` containing a JSON string.
 */
function parseSlackPayload(rawBody) {
  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get('payload');
  if (!payloadStr) return null;
  try {
    return JSON.parse(payloadStr);
  } catch {
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Read raw body first (needed for signature verification)
  let rawBody;
  try {
    rawBody = await getRawBody(req);
    req.rawBody = rawBody;
  } catch (err) {
    console.error('Error reading body:', err);
    return res.status(400).json({ error: 'Bad request' });
  }

  // Verify Slack signing secret
  if (process.env.SLACK_SIGNING_SECRET) {
    if (!verifySlackSignature(req)) {
      console.warn('Invalid Slack signature on actions endpoint');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // Parse the URL-encoded payload
  const payload = parseSlackPayload(rawBody);
  if (!payload) {
    console.warn('Could not parse Slack actions payload');
    return res.status(400).json({ error: 'Invalid payload' });
  }

  // ACK immediately — Slack will show an error if we don't respond within 3s
  res.status(200).json({ ok: true });

  // Process asynchronously after the response is sent
  try {
    await processPayload(payload);
  } catch (err) {
    console.error('Error processing Slack action:', err);
  }
};

// ─── Payload routing ──────────────────────────────────────────────────────────

async function processPayload(payload) {
  const { type } = payload;

  if (type === 'block_actions') {
    await handleBlockActions(payload);
  } else if (type === 'view_submission') {
    await handleViewSubmission(payload);
  } else {
    console.log(`Unhandled actions payload type: ${type}`);
  }
}

// ─── block_actions ────────────────────────────────────────────────────────────

async function handleBlockActions(payload) {
  const actions = payload.actions || [];
  const channelId = payload.channel?.id;
  const userName = payload.user?.name || payload.user?.id;
  const responseUrl = payload.response_url;

  for (const action of actions) {
    const actionId = action.action_id || '';
    let value = {};
    try {
      value = action.value ? JSON.parse(action.value) : {};
    } catch {
      value = { raw: action.value };
    }

    console.log(`block_actions: action_id=${actionId} user=${userName}`);

    if (actionId.startsWith('approve_')) {
      await handleApproval(true, value, channelId, userName, responseUrl);
    } else if (actionId.startsWith('revise_')) {
      await handleApproval(false, value, channelId, userName, responseUrl);
    } else {
      // Route to the appropriate agent based on action_id prefix
      const agentKey = resolveAgentKey(actionId);
      await routeActionToAgent(agentKey, actionId, value, channelId, userName, responseUrl);
    }
  }
}

// ─── view_submission ──────────────────────────────────────────────────────────

async function handleViewSubmission(payload) {
  const callbackId = payload.view?.callback_id || '';
  const userName = payload.user?.name || payload.user?.id;
  const values = payload.view?.state?.values || {};

  console.log(`view_submission: callback_id=${callbackId} user=${userName}`);

  const agentKey = resolveAgentKey(callbackId);

  // Flatten modal field values into a simple key→value map
  const formData = {};
  for (const [blockId, blockValues] of Object.entries(values)) {
    for (const [actionId, actionValue] of Object.entries(blockValues)) {
      const key = actionId || blockId;
      formData[key] =
        actionValue.value ||
        actionValue.selected_option?.value ||
        actionValue.selected_options?.map((o) => o.value) ||
        null;
    }
  }

  const handler = AGENT_HANDLERS[agentKey];
  if (handler?.handleModalSubmission) {
    await handler.handleModalSubmission(callbackId, formData, { userName });
  } else {
    // Generic fallback: log the submission and notify in the agent's channel
    const agent = AGENTS[agentKey];
    await postAsAgent(
      agentKey,
      agent?.channel,
      `📝 Modal submitted by ${userName} (callback: \`${callbackId}\`)\n\`\`\`${JSON.stringify(formData, null, 2)}\`\`\``
    );
  }
}

// ─── Approval / revision ──────────────────────────────────────────────────────

async function handleApproval(approved, value, channelId, userName, responseUrl) {
  const { agentKey = 'exec-pm', actionId = 'unknown' } = value;

  if (approved) {
    await postAsAgent(
      agentKey,
      null,
      `✅ *Approved by ${userName}* — ready to publish.\n\n_Quick gut-check before you post: does the first thing people see make them say "I have to act on this"? Lead with that reaction hook, not the context._`
    );
    console.log(`Approved: ${actionId} by ${userName}`);
  } else {
    await postAsAgent(
      agentKey,
      null,
      `❌ *Revision requested by ${userName}*\n\nReply with what you'd like changed and I'll revise right away.\n\nIf you're not sure what's off, ask yourself:\n• Does the opening line trigger an immediate reaction — or just deliver information?\n• Would someone scrolling past stop because of that first line alone?\n• Is the action buried, or is it the first thing they feel?`
    );
    console.log(`Revision requested: ${actionId} by ${userName}`);
  }

  // Update the original message to remove the buttons (optional UX improvement)
  if (responseUrl) {
    try {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replace_original: true,
          text: approved
            ? `✅ Approved by ${userName}`
            : `❌ Revision requested by ${userName}`,
        }),
      });
    } catch (err) {
      console.error('Error updating original message via response_url:', err);
    }
  }
}

// ─── Generic agent action routing ─────────────────────────────────────────────

async function routeActionToAgent(agentKey, actionId, value, channelId, userName, responseUrl) {
  const handler = AGENT_HANDLERS[agentKey];

  if (handler?.handleAction) {
    // Agent implements a dedicated action handler
    await handler.handleAction(actionId, value, { channelId, userName, responseUrl });
  } else {
    // Fallback: treat the action as a message to the agent
    const text = value.text || value.raw || `Action triggered: ${actionId}`;
    const context = { channelId, userName };
    if (handler?.handleMessage) {
      await handler.handleMessage(text, context);
    } else {
      console.warn(`No handler for agent=${agentKey} action=${actionId}`);
    }
  }
}

