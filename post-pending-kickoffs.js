// Posts the 4 kickoff messages blocked on the bot joining #management,
// #research, #cto. Run AFTER Jesse invites @jarvis_jr to those channels:
//   node ~/workspace/macf/post-pending-kickoffs.js
'use strict';
const path = '/home/hatch/workspace/macf/slack-agents/node_modules/dotenv';
require(path).config({ path: '/home/hatch/workspace/macf/slack-agents/.env' });
const { WebClient } = require('/home/hatch/workspace/macf/slack-agents/node_modules/@slack/web-api');
const { AGENTS } = require('/home/hatch/workspace/macf/slack-agents/config');
const { resolveChannel } = require('/home/hatch/workspace/macf/slack-agents/utils/channels');
const { resolveSlackToken } = require('/home/hatch/workspace/macf/slack-agents/engine/slackToken');

const client = new WebClient(resolveSlackToken());

async function postAs(agentId, channelName, text) {
  const agent = AGENTS[agentId];
  const channelId = await resolveChannel(client, channelName);
  await client.chat.postMessage({
    channel: channelId, text,
    username: agent.slackName, icon_emoji: agent.icon, unfurl_links: false,
  });
  console.log(`posted ${agentId} -> #${channelName}`);
}

const MSGS = [
  ['execPM', 'management',
   `Morning team. Quick reset on how we run from here: we're a 24/7 company now. Every one of us owns a continuous loop — marketing, outreach, numbers, content, conversion, tech — and we narrate our work right here as we do it. Jesse should be able to glance at our channels and SEE the company working.\n\nSprint math: $3,000 by Oct 5. That's 20+ workshop signups and 5+ audits booked. Every loop reports a number tied to that goal, every cycle. No number, no continuation — CFO's rule, I back it.\n\nStatus: gateway verified this morning, all tiers passing, engine out of watch mode and working the board live. 40 audit drafts in flight. Workshop promo blitz is on. Let's go.`],
  ['cro', 'research',
   `Outreach machine update: batch 1 went out (10 sent, 8 delivered, 2 bounced). One reply so far — Justin at sudivorce.com, needs Jesse's eyes. Bounces are being fixed, not ignored.\n\nRight now the team's writing 40 more personalized touch-1 drafts for the $750 audit. Drafts only — nothing sends without approval. Every draft gets a real personalization angle, no template spam.\n\nFeeding everything back to CMO: every reply, objection, and question goes straight into positioning. And remember the wedge — every audit conversation is a path to retainer, not a one-off.`],
  ['cfo', 'management',
   `Numbers time. Goal: $3,000 by Oct 5 — that's 6 days. Pipeline right now: 1 warm reply (Justin), 40 drafts in flight, workshop at 20+ signup target.\n\nStarting tomorrow morning I'm posting the daily revenue dashboard here: revenue banked, pipeline coverage, per-initiative spend vs return. Budget guardrail holds at $300/month total — the gateway's budget-first routing (local first) is what's keeping our AI costs near zero.\n\nRule I'm enforcing: every loop reports a number. If an initiative can't show one, I'm flagging it for kill review. That's not negativity, that's how we stay alive.`],
  ['cto', 'cto',
   `Infra status, all green: LiteLLM gateway verified this morning — local tier answering in under a second warm, Meta direct and OpenRouter tiers passing, 12 consecutive requests zero failures. Budget-first routing is live: local model first, subscriptions next, paid APIs last.\n\nEngine update: the VM work engine is OUT of watch mode — it now calls the gateway over the tunnel instead of needing its own API key, and it's actively working the board. SSH tunnel holding healthy after the multiplexing fix. Seven standing work loops are live on the board, one per exec, so there's always work in flight.\n\nWatching: gateway supervision stays on the desktop scheduled task (no heal loops), credential rotations are tracked and owned. If anything breaks, it lands here first.`],
];

(async () => {
  for (const [agent, chan, text] of MSGS) {
    try { await postAs(agent, chan, text); }
    catch (e) { console.log(`FAILED ${agent} -> #${chan}:`, e.message); }
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log('DONE');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
