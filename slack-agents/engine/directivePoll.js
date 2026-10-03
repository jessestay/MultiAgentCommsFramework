// engine/directivePoll.js — VM-local CEO directive processor.
//
// The interactive Slack bot (Railway) is brain-dead while its LLM path points
// at the down desktop tunnel. This poller gives the VM a directive channel:
// every run it scans team channels for new `[from: CEO → Role]` messages and
// routes each to the matching agent's handleDelegation, which posts its own
// reply. No Socket Mode, no new tokens — reuses the engine's WebClient +
// surrogate and the VM-local Meta gateway for LLM.
//
// Run every 5 min via cron. State: .directive-poll-state.json next to this file.
// Usage: node engine/directivePoll.js
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { WebClient } = require('@slack/web-api');
const { resolveSlackToken } = require('./slackToken');
const { DELEGATION_TARGETS } = require('../config');

const STATE_PATH = path.join(__dirname, '.directive-poll-state.json');
// Channels the team actually uses for directives.
const CHANNELS = [
  'C0ASH4TF604', // #management
  'C0ASDH1HC1Y', // #marketing
];

const AGENT_IDS = ['execPM', 'cmo', 'cco', 'cfo', 'cro', 'cto', 'cuxo', 'jobcoach', 'lawyer', 'facebook', 'hr'];
const loadedAgents = {};

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return {}; }
}
function saveState(s) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

function getAgent(id) {
  if (!loadedAgents[id]) {
    loadedAgents[id] = require(`../agents/${id}.js`);
  }
  return loadedAgents[id];
}

async function main() {
  const token = resolveSlackToken();
  if (!token) { console.error('[directivePoll] no Slack token'); process.exit(1); }
  const client = new WebClient(token);

  const state = loadState();
  let processed = 0;

  for (const channel of CHANNELS) {
    const lastTs = state[channel] || '0';
    let history;
    try {
      history = await client.conversations.history({ channel, limit: 30 });
    } catch (e) {
      console.error(`[directivePoll] history failed for ${channel}:`, e.message);
      continue;
    }
    const msgs = (history.messages || [])
      .filter(m => parseFloat(m.ts) > parseFloat(lastTs))
      .sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

    for (const m of msgs) {
      const text = m.text || '';
      // Track the newest seen ts even for non-directives so we don't rescan.
      if (parseFloat(m.ts) > parseFloat(state[channel] || '0')) state[channel] = m.ts;

      const dm = text.match(/\[from:\s*CEO\s*→\s*(.+?)\]/i);
      if (!dm) continue;
      const toName = dm[1].trim().toLowerCase().replace(/[\s-]+/g, '');
      const agentId = DELEGATION_TARGETS[toName];
      if (!agentId || !AGENT_IDS.includes(agentId)) {
        console.log(`[directivePoll] no agent for target "${dm[1]}" — skipping`);
        continue;
      }
      const agent = getAgent(agentId);
      if (typeof agent.init === 'function') {
        try { agent.init({ client }); } catch (e) { /* already inited */ }
      }
      if (typeof agent.handleDelegation !== 'function') {
        console.log(`[directivePoll] ${agentId} has no handleDelegation — skipping`);
        continue;
      }
      console.log(`[directivePoll] routing to ${agentId}: "${text.slice(0, 80)}"`);
      try {
        await agent.handleDelegation(text, new Set(), channel);
        processed++;
      } catch (e) {
        console.error(`[directivePoll] ${agentId} delegation failed:`, e.message);
      }
    }
  }

  saveState(state);
  console.log(`[directivePoll] done, processed ${processed} directive(s)`);
}

main().catch(e => { console.error('[directivePoll] fatal:', e.message); process.exit(1); });
