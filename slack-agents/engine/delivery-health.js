#!/usr/bin/env node
// delivery-health.js — Detect ack-without-delivery pattern in Slack
// Run by engine-watchdog.sh after process checks pass.
// If agents are posting "on it" but nothing is shipping, that's a delivery
// failure even when processes are "healthy".
//
// Exit 0: delivery health OK (or check skipped)
// Exit 1: delivery health FAILED — agents talking but not shipping

const { execFileSync } = require('child_process');
const path = require('path');

const ENGINE_DIR = path.join(process.env.HOME, 'workspace/macf/slack-agents');

async function main() {
  let WebClient;
  try {
    WebClient = require(path.join(ENGINE_DIR, 'node_modules/@slack/web-api')).WebClient;
  } catch (e) {
    console.log('[delivery-health] Slack client not available, skipping check');
    process.exit(0);
  }

  // Get token via surrogate (same pattern as other engine scripts)
  let token;
  try {
    const fetch = `import sys
import os as _os
for _p in ('/opt/hatch/skills/skill-creator/bin', '/opt/muse/skills/custom-connector-setup/bin', '/opt/hatch/workflow-skills/custom-connector-setup/bin'):
    if _os.path.exists(_p + '/dynamic_credentials.py'):
        sys.path.insert(0, _p)
        break
from dynamic_credentials import dynamic_credential_entry
entry = dynamic_credential_entry('custom.slack')
sys.stdout.write(entry['surrogate'])`;
    token = execFileSync('python3', ['-c', fetch], { encoding: 'utf8', timeout: 15000 }).trim();
  } catch (e) {
    console.log('[delivery-health] Token fetch failed, skipping check');
    process.exit(0);
  }

  const client = new WebClient(token);
  const channels = [
    { id: 'C0ASH4TF604', name: '#management' },
    { id: 'C0ASDH1HC1Y', name: '#marketing' },
    { id: 'C0ASA532BGD', name: '#content' },
  ];

  const oneHourAgo = Date.now() / 1000 - 3600;
  let totalAcks = 0;
  let totalDeliveries = 0;

  const ackPattern = /\b(on it|got it|working on it|looking into|digging in|will do|acknowledged)\b/i;
  // Delivery = verifiable external evidence: URLs, post IDs, specific metrics
  const deliveryPattern = /(https?:\/\/[^\s]+|\b\d{15,20}\b|shipped|deployed|published to|live at)/i;

  for (const ch of channels) {
    try {
      const hist = await client.conversations.history({ channel: ch.id, limit: 30 });
      const recent = (hist.messages || []).filter(m => parseFloat(m.ts) > oneHourAgo);
      for (const m of recent) {
        const text = m.text || '';
        // Skip bot directives and the engine's own delegation posts
        // (those are inputs/work posts, not agent acks). The engine's
        // "[work engine → X]" posts quote "Got it" etc., which would
        // otherwise false-positive as acks. (Fixed Oct 8, 2026.)
        if (text.includes('[from: CEO')) continue;
        if (text.includes('[work engine →')) continue;
        if (ackPattern.test(text)) totalAcks++;
        if (deliveryPattern.test(text)) totalDeliveries++;
      }
    } catch (e) {
      console.log(`[delivery-health] Channel ${ch.name} read failed: ${e.message}`);
    }
  }

  console.log(`[delivery-health] Last hour: ${totalAcks} acks, ${totalDeliveries} delivery-signals`);

  // Heuristic: if 5+ acks with 0 deliveries in an hour, team is talking not shipping
  if (totalAcks >= 5 && totalDeliveries === 0) {
    console.log('[delivery-health] FAIL: ack-without-delivery pattern detected');
    console.log(`[delivery-health] ${totalAcks} acknowledgments, 0 verifiable deliveries in last hour`);
    process.exit(1);
  }

  // Also fail if ack:delivery ratio exceeds 5:1 with meaningful volume
  if (totalAcks >= 10 && totalDeliveries > 0 && totalAcks / totalDeliveries > 5) {
    console.log(`[delivery-health] FAIL: ack/delivery ratio ${(totalAcks/totalDeliveries).toFixed(1)}:1 exceeds 5:1 threshold`);
    process.exit(1);
  }

  console.log('[delivery-health] OK: delivery health within thresholds');
  process.exit(0);
}

main().catch(e => {
  console.log(`[delivery-health] Check error (non-fatal): ${e.message}`);
  process.exit(0); // Don't fail watchdog on check errors
});
