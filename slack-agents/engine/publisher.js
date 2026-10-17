// engine/publisher.js — Direct social media publishing for the MACF team.
//
// This is the execution layer the team was missing. Agents call these functions
// to actually publish content, not just talk about publishing.
'use strict';

const crypto = require('crypto');
const https = require('https');

function loadEnv() {
  const fs = require('fs');
  const env = {};
  try {
    const content = fs.readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) env[match[1].trim()] = match[2].trim();
    }
  } catch (e) {}
  return env;
}

// OAuth 1.0a signature for X API
function oauth1Signature(method, url, params, consumerSecret, tokenSecret) {
  const sortedParams = Object.keys(params).sort().map(k =>
    `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`
  ).join('&');

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams)
  ].join('&');

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret || '')}`;
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

function oauth1Header(method, url, extraParams, credentials) {
  const oauthParams = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: '1.0',
    ...extraParams
  };

  const signature = oauth1Signature(
    method, url, oauthParams,
    credentials.apiSecret, credentials.accessTokenSecret
  );
  oauthParams.oauth_signature = signature;

  return 'OAuth ' + Object.keys(oauthParams)
    .filter(k => k.startsWith('oauth_'))
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');
}

/**
 * Post a tweet via X API v2 with OAuth 1.0a.
 * Uses curl to respect proxy settings.
 */
const { scoreContent } = require('./gates/contentGate');

/**
 * Gate a structured draft through the content quality gate before publishing.
 * Fail-closed: REJECT verdict => throw, nothing is posted. Unscored (no draft)
 * => throw: unscored content cannot be published.
 * Returns the gate result on PASS so callers can log the scores.
 */
function gateForPublish(draft) {
  if (!draft || typeof draft !== 'object') {
    throw new Error(
      'content-gate: unscored content cannot be published. ' +
      'Pass a structured draft {hook, body, platform, persona, format, ...} so the gate can score it. ' +
      'Fail-closed: unscored = rejected.'
    );
  }
  const result = scoreContent(draft);
  if (result.verdict !== 'PASS') {
    throw new Error(
      `content-gate REJECT (avg ${result.average}; failing: ${result.failures.join(', ')}). ` +
      `Nothing was published. Rewrite the draft — never ship as-is with caveats. ` +
      `Rule scores: ${result.rules.map((r) => `${r.id}=${r.score}`).join(', ')}. ` +
      `${result.notes}`
    );
  }
  return result;
}

async function postToX(text, draft = null) {
  // ── CONTENT GATE CHOKE POINT ──────────────────────────────────────────────
  // Honest architecture note: the MACF engine has NO content-approval path for
  // the weekly draft batch — drafts flow agent -> content-batch/post_drafts.py
  // (Python, outside this engine) -> #content -> Jesse. This publisher is the
  // only engine choke point where content leaves toward the public, so the
  // gate is enforced here. The batch worker must run
  //   node engine/gates/score-batch.js drafts.json
  // before post_drafts.py; a non-zero exit means the batch does not post.
  // ──────────────────────────────────────────────────────────────────────────
  const gateResult = gateForPublish(draft);
  console.log(`[publisher] content-gate PASS (avg ${gateResult.average}) — posting to X`);
  const env = loadEnv();
  const credentials = {
    apiKey: env.X_API_KEY,
    apiSecret: env.X_API_SECRET,
    accessToken: env.X_ACCESS_TOKEN,
    accessTokenSecret: env.X_ACCESS_TOKEN_SECRET
  };

  if (!credentials.apiKey || !credentials.accessToken) {
    throw new Error('X credentials not configured');
  }

  const url = 'https://api.twitter.com/2/tweets';
  const body = JSON.stringify({ text });
  const authHeader = oauth1Header('POST', url, {}, credentials);

  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync('curl', [
      '-s', '-X', 'POST', url,
      '-H', `Authorization: ${authHeader}`,
      '-H', 'Content-Type: application/json',
      '-d', body,
      '--max-time', '30'
    ]);

    const json = JSON.parse(stdout);
    if (json.data?.id) {
      return { id: json.data.id, text: json.data.text };
    } else {
      throw new Error(`X API error: ${stdout.slice(0, 200)}`);
    }
  } catch (e) {
    throw new Error(`X post failed: ${e.message}`);
  }
}

module.exports = { postToX, gateForPublish };
