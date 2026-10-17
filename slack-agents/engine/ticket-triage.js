#!/usr/bin/env node
// engine/ticket-triage.js — Auto-assign new Vikunja tickets by urgency and type.
//
// Jesse's law (Oct 10, 2026): "Why isn't there a process monitoring for new
// tickets and assigning to the exec pm to bring up in sprint planning meetings
// or assign immediately (for urgent tasks)? All of this should be built into
// the MACF."
//
// This runs every 15 minutes (via schedule). It finds unassigned tasks and:
// - URGENT tasks: assigned immediately to the appropriate agent
// - NORMAL tasks: assigned to execPM for sprint planning triage
//
// Urgency detection: keywords in title/description (urgent, asap, deadline,
// critical, blocker, emergency, EOD, COB).
//
// Type-to-agent mapping:
// - legal, agreement, contract, lawsuit → lawyer
// - resume, apply, job, interview, career → jobcoach
// - reply, draft, message, linkedin, email → cco
// - strategy, pricing, wix, proposal → cco
// - promo, campaign, ads, marketing, seo → cmo
// - research, brief, analysis → cro
// - budget, finance, revenue, invoice → cfo
// - tech, deploy, bug, code, api → cto
// - default → execpm
//
// Usage: node engine/ticket-triage.js [--dry-run]
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const VIKUNJA_URL = process.env.VIKUNJA_URL || 'http://127.0.0.1:3456';
const TOKEN = process.env.VIKUNJA_TOKEN;
const PROJECTS = [2, 16]; // MACF, Revenue Sprint

// NEVER touch these task IDs — system locks, not real work.
const PROTECTED_TASKS = [64]; // 64 = ENGINE LOCK (heartbeat lock)

// User ID map (from Vikunja)
const USER_IDS = {
  execpm: 2, cmo: 3, cco: 4, cuxo: 5, cro: 7, cfo: 8,
  cto: 9, lawyer: 10, jobcoach: 11, facebook: 12,
};

const URGENT_KEYWORDS = [
  'urgent', 'asap', 'deadline', 'critical', 'blocker', 'blocking',
  'emergency', 'eod', 'cob', 'immediately', 'time-sensitive',
];

const TYPE_MAP = [
  { keywords: ['legal', 'agreement', 'contract', 'lawsuit', 'attorney'], agent: 'lawyer' },
  { keywords: ['resume', 'apply', 'job', 'interview', 'career', 'hiring'], agent: 'jobcoach' },
  { keywords: ['reply', 'draft', 'message', 'linkedin', 'email'], agent: 'cco' },
  { keywords: ['strategy', 'pricing', 'wix', 'proposal', 'quote'], agent: 'cco' },
  { keywords: ['promo', 'campaign', 'ads', 'marketing', 'seo', 'content'], agent: 'cmo' },
  { keywords: ['research', 'brief', 'analysis', 'report'], agent: 'cro' },
  { keywords: ['budget', 'finance', 'revenue', 'invoice', 'payment'], agent: 'cfo' },
  { keywords: ['tech', 'deploy', 'bug', 'code', 'api', 'server'], agent: 'cto' },
  { keywords: ['facebook', 'instagram', 'social'], agent: 'facebook' },
];

function isUrgent(task) {
  const text = ((task.title || '') + ' ' + (task.description || '')).toLowerCase();
  return URGENT_KEYWORDS.some(kw => text.includes(kw));
}

function classifyAgent(task) {
  const text = ((task.title || '') + ' ' + (task.description || '')).toLowerCase();
  for (const { keywords, agent } of TYPE_MAP) {
    if (keywords.some(kw => text.includes(kw))) {
      return agent;
    }
  }
  return 'execpm'; // Default: execPM triages in sprint planning
}

async function api(method, path, body) {
  const url = VIKUNJA_URL + '/api/v1' + path;
  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + TOKEN,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    throw new Error(`API ${method} ${path}: ${res.status}`);
  }
  return res.json();
}

async function getUnassignedTasks() {
  const unassigned = [];
  for (const projectId of PROJECTS) {
    const tasks = await api('GET', `/projects/${projectId}/tasks?filter=done%3Dfalse&per_page=100`);
    for (const task of (Array.isArray(tasks) ? tasks : [])) {
      const assignees = task.assignees || [];
      if (assignees.length === 0) {
        unassigned.push(task);
      }
    }
  }
  return unassigned;
}

async function assignTask(taskId, agent) {
  const userId = USER_IDS[agent];
  if (!userId) {
    console.error(`[triage] Unknown agent: ${agent}`);
    return false;
  }
  await api('PUT', `/tasks/${taskId}/assignees`, { user_id: userId });
  return true;
}

// Bridge the Vikunja → Slack handoff gap (Oct 11, 2026 — root-caused from #675).
// Agents only work from Slack [from: CEO → Role] directives; a Vikunja assignment
// alone never reaches them. After every assignment, post the directive so the
// agent actually gets the work.
async function dispatchDirective(agent, task, urgent) {
  try {
    const { WebClient } = require('@slack/web-api');
    const { execFileSync } = require('child_process');
    const fetchToken = `import sys
import os as _os
for _p in ('/opt/hatch/skills/skill-creator/bin', '/opt/muse/skills/custom-connector-setup/bin', '/opt/hatch/workflow-skills/custom-connector-setup/bin'):
    if _os.path.exists(_p + '/dynamic_credentials.py'):
        sys.path.insert(0, _p)
        break
from dynamic_credentials import dynamic_credential_entry
entry = dynamic_credential_entry('custom.slack')
sys.stdout.write(entry['surrogate'])`;
    const token = execFileSync('python3', ['-c', fetchToken], { timeout: 15000 }).toString().trim();
    const client = new WebClient(token);
    const role = agent.toUpperCase();
    const action = urgent
      ? `Start work immediately — this is URGENT.`
      : `Triage for sprint planning — review and schedule or reassign.`;
    const text = `[from: CEO → ${agent}] Vikunja #${task.id}: ${(task.title || '').slice(0, 120)}\n${action}\nDetails: ${(task.description || 'No description').slice(0, 500)}`;
    await client.chat.postMessage({ channel: 'C0ASH4TF604', text });
    console.log(`[triage] Directive dispatched to ${agent} for #${task.id}`);
    return true;
  } catch (e) {
    console.error(`[triage] Directive dispatch failed for #${task.id}: ${e.message}`);
    return false;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[triage] ${new Date().toISOString()} — checking for unassigned tasks`);

  let tasks;
  try {
    tasks = await getUnassignedTasks();
  } catch (e) {
    console.error(`[triage] Failed to fetch tasks: ${e.message}`);
    process.exit(1);
  }

  console.log(`[triage] Found ${tasks.length} unassigned tasks`);

  let urgentCount = 0;
  let normalCount = 0;

  for (const task of tasks) {
    if (PROTECTED_TASKS.includes(task.id)) {
      console.log(`[triage] #${task.id} \"${task.title.slice(0,40)}\" → SKIPPED (protected task)`);
      continue;
    }
    const urgent = isUrgent(task);
    // Jesse's policy (Oct 10, 2026): URGENT → matching functional agent immediately;
    // NORMAL → execPM for sprint planning triage. classifyAgent is only for urgent.
    const agent = urgent ? classifyAgent(task) : 'execpm';

    if (dryRun) {
      console.log(`[triage] [DRY-RUN] #${task.id} "${task.title.slice(0,50)}" → ${agent} ${urgent ? '(URGENT)' : ''}`);
      continue;
    }

    try {
      await assignTask(task.id, agent);
      // Close the handoff gap: notify the agent in Slack so work actually starts
      await dispatchDirective(agent, task, urgent);
      if (urgent) {
        urgentCount++;
        console.log(`[triage] #${task.id} → ${agent} (URGENT, assigned immediately)`);
      } else {
        normalCount++;
        console.log(`[triage] #${task.id} → ${agent} (normal, sprint planning triage)`);
      }
    } catch (e) {
      console.error(`[triage] Failed to assign #${task.id}: ${e.message}`);
    }
  }

  console.log(`[triage] Done: ${urgentCount} urgent, ${normalCount} normal, ${tasks.length} total`);
}

if (require.main === module) {
  main().catch(e => {
    console.error('[triage] FATAL:', e.message);
    process.exit(1);
  });
}

module.exports = { isUrgent, classifyAgent, USER_IDS, URGENT_KEYWORDS, TYPE_MAP };
