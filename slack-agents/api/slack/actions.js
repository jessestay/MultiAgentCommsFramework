// api/slack/actions.js — Vercel serverless handler for Slack Interactivity
// Handles block_actions, shortcut, and view_submission payloads.
'use strict';

const crypto = require('crypto');

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

  // Interactivity payloads come as application/x-www-form-urlencoded
  const rawBody = typeof req.body === 'string'
    ? req.body
    : new URLSearchParams(req.body).toString();

  const timestamp = req.headers['x-slack-timestamp'];
  const signature = req.headers['x-slack-signature'];
  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return res.status(401).send('Unauthorized');
  }

  let payload;
  try {
    const payloadStr = typeof req.body === 'object' && req.body.payload
      ? req.body.payload
      : req.body;
    payload = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr;
  } catch (err) {
    return res.status(400).send('Bad Request');
  }

  console.log('[actions] type=' + payload.type);

  // Acknowledge immediately
  res.status(200).send('');
};
