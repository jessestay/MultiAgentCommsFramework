#!/usr/bin/env node
// engine/autonomousRunner.js — Hourly autonomous agent driver.
//
// JESSE'S LAW: Every agent with active tasks must produce verifiable output
// every hour. Agents were passive — they only responded to Slack directives.
// This runner calls each agent's runAutonomous() hourly, independent of Slack,
// generating verifiable artifacts that the sprint demo check counts as demos.
//
// Run hourly via cron. Each agent's runAutonomous() is idempotent and fast
// (no LLM calls — just artifact generation with current status).
//
// Usage: node engine/autonomousRunner.js
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const AGENTS = ['cfo', 'cmo', 'cro'];

async function main() {
  console.log('[autonomousRunner] === Hourly Autonomous Run ===');
  console.log('[autonomousRunner] ' + new Date().toISOString());

  let succeeded = 0;
  let failed = 0;

  for (const agentId of AGENTS) {
    try {
      const agent = require(`../agents/${agentId}`);
      if (typeof agent.runAutonomous !== 'function') {
        console.log(`[autonomousRunner] ${agentId}: no runAutonomous — skipping`);
        continue;
      }
      const result = await agent.runAutonomous();
      console.log(`[autonomousRunner] ✅ ${agentId}: ${result.artifactPath}`);
      succeeded++;
    } catch (err) {
      console.error(`[autonomousRunner] ❌ ${agentId}: ${err.message}`);
      failed++;
    }
  }

  console.log(`[autonomousRunner] ---`);
  console.log(`[autonomousRunner] Succeeded: ${succeeded}, failed: ${failed}`);
  console.log('[autonomousRunner] done');
}

main().then(() => process.exit(0))
  .catch(e => { console.error('[autonomousRunner] fatal:', e.message); process.exit(1); });
