#!/usr/bin/env node
// engine/improvementLoop.js — Turn "never complete" into action.
//
// JESSE'S LAW (Oct 5, 2026): "We should never feel Complete and always be
// getting better and learning and producing new and better things."
//
// The delivery learner records improvement prompts for every verified delivery
// ("What's the next better version?"). This loop turns those prompts into
// real follow-up directives:
//
// 1. Reads pending improvement prompts from .delivery-learnings.json
// 2. For each, posts a [from: CEO → Agent] directive in Slack asking for
//    the next better version
// 3. Creates a "next better version" Vikunja task so it's tracked
// 4. Marks the prompt as dispatched (won't re-issue)
//
// Run hourly via cron (after sprintDemo.js). State lives in the learnings file.
// Usage: node engine/improvementLoop.js
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { WebClient } = require('@slack/web-api');
const { resolveSlackToken } = require('./slackToken');

const LEARN_PATH = path.join(__dirname, '.delivery-learnings.json');

// Map agent IDs to their Slack channels for directives
const AGENT_CHANNELS = {
  cmo: 'C0ASH4TF604',      // #management
  cco: 'C0ASH4TF604',
  cuxo: 'C0ASH4TF604',
  cfo: 'C0ASH4TF604',
  cro: 'C0ASH4TF604',
  cto: 'C0ASH4TF604',
  execpm: 'C0ASH4TF604',
  jobcoach: 'C0ASH4TF604',
  lawyer: 'C0ASH4TF604',
  facebook: 'C0ASDH1HC1Y', // #marketing
  hr: 'C0ASH4TF604',
};

const AGENT_NAMES = {
  cmo: 'CMO', cco: 'CCO', cuxo: 'CUXO', cfo: 'CFO', cro: 'CRO',
  cto: 'CTO', execpm: 'Exec PM', jobcoach: 'Job Coach',
  lawyer: 'Lawyer', facebook: 'Facebook Expert', hr: 'HR',
};

async function createImprovementTask(agentId, originalPreview) {
  const TOKEN = (process.env.VIKUNJA_TOKEN || '').split('\n')[0].trim();
  if (!TOKEN) return null;

  try {
    const res = await fetch('http://127.0.0.1:3456/api/v1/projects/2/tasks', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `[${AGENT_NAMES[agentId] || agentId}] Next better version: ${originalPreview.slice(0, 80)}`,
        description: `NEVER COMPLETE (Jesse's law): This is the follow-up to a verified delivery.\n\nOriginal delivery: ${originalPreview.slice(0, 500)}\n\nTask: Produce the next better version. What's one thing that could be improved? Make it better and demo the improvement.`,
        priority: 2, // Medium priority
      }),
    });
    if (!res.ok) {
      console.error(`[improvementLoop] Task creation failed: ${res.status}`);
      return null;
    }
    const task = await res.json();
    console.log(`[improvementLoop] Created task #${task.id} for ${agentId} improvement`);

    // Assign to the agent
    try {
      await fetch(`http://127.0.0.1:3456/api/v1/tasks/${task.id}/assignees`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: agentId }),
      });
    } catch (e) {
      console.error(`[improvementLoop] Assignee failed for #${task.id}:`, e.message);
    }

    return task.id;
  } catch (e) {
    console.error('[improvementLoop] Task creation error:', e.message);
    return null;
  }
}

async function main() {
  console.log('[improvementLoop] === Improvement Loop ===');
  console.log('[improvementLoop] ' + new Date().toISOString());

  let learnings;
  try {
    learnings = JSON.parse(fs.readFileSync(LEARN_PATH, 'utf8'));
  } catch (e) {
    console.log('[improvementLoop] No learnings file yet — nothing to improve');
    return;
  }

  const pending = (learnings.improvements || []).filter(i => i.status === 'pending_improvement');
  if (pending.length === 0) {
    console.log('[improvementLoop] No pending improvements — team is current');
    return;
  }

  console.log(`[improvementLoop] ${pending.length} pending improvement(s)`);

  const token = resolveSlackToken();
  if (!token) {
    console.error('[improvementLoop] no Slack token — cannot issue directives');
    return;
  }
  const client = new WebClient(token);

  let dispatched = 0;
  for (const imp of pending) {
    const agentId = (imp.agent || '').toLowerCase();
    const agentName = AGENT_NAMES[agentId];
    if (!agentName) {
      console.log(`[improvementLoop] Unknown agent "${imp.agent}" — skipping`);
      imp.status = 'skipped_unknown_agent';
      continue;
    }

    const channel = AGENT_CHANNELS[agentId] || 'C0ASH4TF604';

    // Create the Vikunja task first (tracked work)
    const taskId = await createImprovementTask(agentId, imp.preview);

    // Issue the directive in Slack
    const directive = `[from: CEO → ${agentName}] NEVER COMPLETE: You delivered this:\n"${imp.preview.slice(0, 300)}"\n\nWhat's the next better version? Pick ONE thing to improve and demo it. ${taskId ? `Tracked as task #${taskId}.` : ''} Don't just say you'll improve it — show the improved version.`;

    try {
      await client.chat.postMessage({
        channel: channel,
        text: directive,
        unfurl_links: false,
      });
      console.log(`[improvementLoop] ✅ Dispatched improvement directive to ${agentName} (task #${taskId})`);
      imp.status = 'dispatched';
      imp.dispatchedAt = new Date().toISOString();
      imp.taskId = taskId;
      dispatched++;
    } catch (e) {
      console.error(`[improvementLoop] Slack post failed for ${agentName}:`, e.message);
      imp.status = 'dispatch_failed';
    }

    // Rate limit: don't flood Slack with improvement directives
    if (dispatched >= 5) {
      console.log('[improvementLoop] Rate limit: 5 directives per run, remaining will go next hour');
      break;
    }
  }

  // Save updated statuses
  try {
    fs.writeFileSync(LEARN_PATH, JSON.stringify(learnings, null, 2));
    console.log(`[improvementLoop] Dispatched ${dispatched} improvement directive(s)`);
  } catch (e) {
    console.error('[improvementLoop] Save failed:', e.message);
  }

  console.log('[improvementLoop] done');
}

main().then(() => process.exit(0))
  .catch(e => { console.error('[improvementLoop] fatal:', e.message); process.exit(1); });
