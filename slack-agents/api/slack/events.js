// api/slack/events.js — Vercel serverless handler for Slack HTTP events
// Handles URL verification and dispatches app_mention events to MACF agents.
'use strict';

const crypto = require('crypto');

// Signature verification
function verifySlackSignature(rawBody, timestamp, signature) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret || !timestamp || !signature) return false;
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) return false;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update('v0:' + timestamp + ':' + rawBody);
  const computed = 'v0=' + hmac.digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const body = req.body || {};

  // Slack URL verification — respond before signature check
  if (body.type === 'url_verification') {
    return res.status(200).json({ challenge: body.challenge });
  }

  // Verify Slack signature
  const rawBody = JSON.stringify(body);
  const timestamp = req.headers['x-slack-timestamp'];
  const signature = req.headers['x-slack-signature'];
  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return res.status(401).send('Unauthorized');
  }

  // Acknowledge receipt immediately
  res.status(200).send('');

  // Async event processing
  try {
    const event = body.event || {};
    console.log('[events] type=' + event.type + ' channel=' + event.channel);

    if (event.type === 'app_mention') {
      const { CHANNELS } = require('../../config');
      const CHANNEL_AGENT_MAP = {
        [CHANNELS.marketing]: '../../agents/cmo',
        [CHANNELS.research]:  '../../agents/cro',
        [CHANNELS.content]:   '../../agents/cco',
        [CHANNELS.jobs]:      '../../agents/jobcoach',
        [CHANNELS.execpm]:    '../../agents/execPM',
      };
      const agentPath = CHANNEL_AGENT_MAP[event.channel] || '../../agents/execPM';
      const agent = require(agentPath);
      if (typeof agent.handle === 'function') {
        const { WebClient } = require('@slack/web-api');
        const client = new WebClient(process.env.SLACK_BOT_TOKEN);
        const say = async (msg) => client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.thread_ts || event.ts,
          ...(typeof msg === 'string' ? { text: msg } : msg),
        });
        await agent.handle({ event, client, say });
      }
    }
  } catch (err) {
    console.error('[events] handler error:', err.message);
  }
};
