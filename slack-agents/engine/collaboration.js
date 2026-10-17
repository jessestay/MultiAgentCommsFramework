// engine/collaboration.js — Agent-to-agent collaboration facilitator.
//
// Makes the team work like a real human team: when agents have overlapping
// or dependent work, the engine connects them directly in Slack using the
// [from: X → Y] private channel format, so Jesse sees real collaboration
// instead of just hub-and-spoke CEO directives.
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { WebClient } = require('@slack/web-api');
const { resolveSlackToken } = require('./slackToken');

// Collaboration map: which agents should talk to each other on overlapping work.
// Key is a topic/keyword, value is the pair of agents who should collaborate.
const COLLABORATION_PAIRS = [
  {
    topic: 'funnel',
    agents: ['cco', 'cto'],
    reason: 'funnel UX audit overlaps with n8n automation that powers the funnel',
  },
  {
    topic: 'product',
    agents: ['cmo', 'cuxo'],
    reason: 'product copy claims must match the actual mobile UX',
  },
  {
    topic: 'revenue',
    agents: ['cfo', 'execpm'],
    reason: 'revenue dashboard and sprint tracking need aligned numbers',
  },
  {
    topic: 'workshop',
    agents: ['cmo', 'cco'],
    reason: 'workshop promo and content kit must tell the same story',
  },
  {
    topic: 'n8n',
    agents: ['cto', 'cco'],
    reason: 'n8n workflows directly serve the content funnel',
  },
];

const CHANNELS = {
  management: 'C0ASH4TF604',
  marketing: 'C0ASDH1HC1Y',
};

// Deduplication: track recent suggestions to avoid spam.
// Key: `${agentId}:${partner}:${topic}`, value: timestamp
const recentSuggestions = new Map();
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check a directive text for collaboration opportunities.
 *
 * DISABLED (Oct 4, 2026 — Jesse: "Less you telling them what to do").
 * The engine no longer posts collaboration nudges to Slack. The team
 * communicates on their own via [from: X → Y] direct messages.
 * This function is kept for API compatibility but does nothing.
 */
async function suggestCollaboration(directiveText, targetAgentId) {
  // NO-OP by design. The team self-organizes.
  // See: Jesse Oct 4 — "I want to see the team constantly communicating
  // with each other... Less you telling them what to do."
  return;
}

module.exports = { suggestCollaboration, COLLABORATION_PAIRS };
