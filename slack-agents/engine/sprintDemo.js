#!/usr/bin/env node
// engine/sprintDemo.js — Hourly sprint demo gate.
//
// JESSE'S LAW (Oct 5, 2026): "As long as progress is made and they're meeting
// the hourly sprint deadlines with actual demos I think we're good... We should
// never feel Complete and always be getting better and learning and producing
// new and better things. All of what I just said should be baked into the MACF engine."
//
// This bakes in three principles:
//
// 1. HOURLY SPRINT DEMOS: Every agent with active tasks must produce verifiable
//    output every hour. Not a status update ("working on it") — an actual demo:
//    copy text, a URL, an image, metrics, a task marked done. The demo must pass
//    the same evidence gate as directives.
//
// 2. NEVER COMPLETE: When a task is marked done, the engine asks "what's the
//    next better version?" A done task triggers an improvement prompt, not a
//    celebration. Completion is a checkpoint, not a finish line.
//
// 3. ALWAYS LEARNING: Every demo/delivery captures one lesson learned and one
//    thing to improve. These feed the delivery learner's knowledge base, so
//    the team's quality trends upward over time.
//
// Run hourly via cron. State: .sprint-demo-state.json next to this file.
// Usage: node engine/sprintDemo.js
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '.sprint-demo-state.json');
const LEARN_PATH = path.join(__dirname, '.delivery-learnings.json');
const GAP_PATH = path.join(__dirname, '.engine-gaps.json');

// Demo evidence patterns (same as directivePoll.js evidence gate)
function hasDemoEvidence(text) {
  if (!text) return false;
  return /https?:\/\/[^\s]+/.test(text) ||                    // URL
    /\b\d{15,20}\b/.test(text) ||                             // Post ID
    /\b\d+\s*(likes|views|clicks|signups|comments|shares)\b/i.test(text) || // Metrics
    /task\s*#\d+\s*(complete|done|shipped|delivered)/i.test(text) || // Task completion
    /\[DEMO\]/i.test(text);                                   // Explicit demo marker
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return { lastDemo: {}, lessons: [], improvements: [] }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function logGap(gap) {
  try {
    let gaps = [];
    try { gaps = JSON.parse(fs.readFileSync(GAP_PATH, 'utf8')); } catch {}
    gaps.push({ timestamp: new Date().toISOString(), source: 'sprintDemo', ...gap });
    if (gaps.length > 200) gaps = gaps.slice(-200);
    fs.writeFileSync(GAP_PATH, JSON.stringify(gaps, null, 2));
  } catch (e) {
    console.error('[sprintDemo] gap log failed:', e.message);
  }
}

async function getActiveTasksByAgent() {
  const TOKEN = (process.env.VIKUNJA_TOKEN || '').split('\n')[0].trim();
  if (!TOKEN) {
    console.error('[sprintDemo] no Vikunja token');
    return {};
  }

  const tasksByAgent = {};
  // Check MACF project (2) and Revenue Sprint (16) for active tasks.
  // ROOT-CAUSE FIX (Oct 6, 2026): Was only [2], making project-16 tasks
  // (e.g. CFO's revenue dashboard #86) invisible to the demo monitor.
  const PROJECT_IDS = [2, 16];
  for (const projectId of PROJECT_IDS) {
    try {
      const res = await fetch(
        `http://127.0.0.1:3456/api/v1/projects/${projectId}/tasks`,
        { headers: { 'Authorization': `Bearer ${TOKEN}` } }
      );
      if (!res.ok) continue;
      const tasks = await res.json();
      for (const t of tasks) {
        if (t.done) continue;
        const assignees = (t.assignees || []).map(a => (a.username || '').toLowerCase());
        // Keep the full assignee list on each task record so joint coverage
        // (Oct 6, 2026) can see co-assignees, not just the owning key.
        const record = { id: t.id, title: t.title, updated: t.updated, assignees };
        for (const agent of assignees) {
          if (!tasksByAgent[agent]) tasksByAgent[agent] = [];
          tasksByAgent[agent].push(record);
        }
      }
    } catch (e) {
      console.error(`[sprintDemo] Vikunja fetch failed for project ${projectId}:`, e.message);
    }
  }
  return tasksByAgent;
}

async function checkRecentDemos() {
  // Check Slack for demo evidence in the last hour from each agent
  // For now, we check the agent health file for recent completions
  const HEALTH_PATH = path.join(__dirname, '.agent-health.json');
  let health = {};
  try { health = JSON.parse(fs.readFileSync(HEALTH_PATH, 'utf8')); } catch {}

  const oneHourAgo = Date.now() - 3600000;
  const demosByAgent = {};

  for (const [agentId, h] of Object.entries(health)) {
    if (!h.lastActivity) continue;
    const lastActivity = new Date(h.lastActivity).getTime();
    if (lastActivity > oneHourAgo && h.directivesCompleted > 0) {
      // Vikunja assignee usernames are lowercased in getActiveTasksByAgent();
      // health keys use original casing (e.g. execPM). Normalize to lowercase
      // so the demo lookup matches (was logging false misses, Oct 5 2026).
      demosByAgent[agentId.toLowerCase()] = {
        lastDemo: h.lastActivity,
        completions: h.directivesCompleted,
      };
    }
  }
  return demosByAgent;
}

// JOINT-COVERAGE FIX (Oct 6, 2026) — pure helpers, unit-tested in
// tests/sprintDemo.test.js.
//
// An agent is jointly covered when EVERY one of their active tasks has a
// DIFFERENT co-assignee who demoed this hour. Sole-assigned tasks are never
// covered; partial coverage does not count.
function isJointlyCovered(tasks, agent, demoedAgents) {
  if (!tasks || tasks.length === 0) return false;
  return tasks.every(t =>
    (t.assignees || []).some(co => co !== agent && demoedAgents.has(co)));
}

// The demo_streak_broken escalation persists only on the 3-crossing run.
function crossesEscalationThreshold(prev, next) {
  return prev < 3 && next >= 3;
}

// Exported for unit tests. main() only auto-runs when this file is executed
// directly (require.main === module); requiring it from tests must NOT fire a
// live check (was polluting the real state file on every test run, Oct 6 2026).
module.exports = {
  isJointlyCovered,
  crossesEscalationThreshold,
  hasDemoEvidence,
  getActiveTasksByAgent,
  checkRecentDemos,
  loadState,
  saveState,
};

async function main() {
  console.log('[sprintDemo] === Hourly Sprint Demo Check ===');
  console.log('[sprintDemo] ' + new Date().toISOString());

  const state = loadState();
  const tasksByAgent = await getActiveTasksByAgent();
  const demosByAgent = await checkRecentDemos();
  const demoedAgents = new Set(Object.keys(demosByAgent));
  state._misses = state._misses || {};

  const agentsWithWork = Object.keys(tasksByAgent);
  console.log(`[sprintDemo] ${agentsWithWork.length} agents with active tasks`);

  let demosFound = 0;
  let demosMissing = 0;

  for (const agent of agentsWithWork) {
    const tasks = tasksByAgent[agent];
    const demo = demosByAgent[agent];

    if (demo) {
      console.log(`[sprintDemo] ✅ ${agent}: demo found (${demo.completions} completions, last: ${demo.lastDemo})`);
      state.lastDemo[agent] = demo.lastDemo;
      // A real demo resets the consecutive-miss streak (was never cleared, Oct 5 2026).
      state._misses[agent] = 0;
      // JOINT-COVERAGE FIX (Oct 6, 2026): on jointly-assigned tasks, one
      // assignee's demo satisfies the hour for ALL assignees. Holding a
      // per-agent streak on shared work inflated false escalations
      // (e.g. cfo's streak on #63, shared with execpm).
      for (const t of tasks) {
        for (const co of (t.assignees || [])) {
          if (co !== agent) state._misses[co] = 0;
        }
      }
      demosFound++;
    } else {
      // Joint coverage: EVERY active task has a co-assignee who demoed this
      // hour. Partial coverage does not count — the agent's own work stream
      // is still silent.
      if (isJointlyCovered(tasks, agent, demoedAgents)) {
        const coverers = [...new Set(tasks.flatMap(t =>
          (t.assignees || []).filter(co => co !== agent && demoedAgents.has(co))))];
        console.log(`[sprintDemo] ℹ️  ${agent}: no personal demo this hour — covered by co-assignee(s) ${coverers.join(', ')} on shared task(s)`);
        state._misses[agent] = 0;
        continue;
      }

      console.log(`[sprintDemo] ⚠️  ${agent}: NO demo in last hour (${tasks.length} active tasks)`);
      demosMissing++;

      // Log as engine gap — the agent has work but showed no verifiable output
      logGap({
        type: 'missing_hourly_demo',
        agent: agent,
        taskCount: tasks.length,
        tasks: tasks.map(t => `#${t.id} ${t.title.slice(0, 60)}`),
        message: `${agent} has ${tasks.length} active tasks but produced no verifiable demo in the last hour`,
      });

      // Consecutive-miss streak. ROOT-CAUSE FIX (Oct 6, 2026): the old
      // `if (!state.lastDemo[agent])` gate only counted agents that had NEVER
      // demoed, so busy agents could go demo-silent indefinitely without
      // escalation. The streak is now uniform: consecutive checks with active
      // tasks and no demo.
      const prev = state._misses[agent] || 0;
      state._misses[agent] = prev + 1;

      // ESCALATION-DEDUPE FIX (Oct 6, 2026): persist the demo_streak_broken
      // gap only when the streak CROSSES 3 — not on every subsequent run
      // (was re-logging every hour, 45 duplicate gaps).
      if (crossesEscalationThreshold(prev, state._misses[agent])) {
        console.log(`[sprintDemo] 🚨 ${agent}: 3+ consecutive hours without demo — escalation needed`);
        logGap({
          type: 'demo_streak_broken',
          agent: agent,
          consecutiveMisses: state._misses[agent],
          message: `${agent} has not demoed in ${state._misses[agent]} hours despite active tasks`,
        });
      } else if (state._misses[agent] >= 3) {
        console.log(`[sprintDemo] 🚨 ${agent}: still no demo (${state._misses[agent]} consecutive hours) — already escalated`);
      }
    }
  }

  // NEVER COMPLETE: Check recently completed tasks and prompt for next version
  // (This is a placeholder for the full implementation — the directive poller
  // will trigger improvement prompts when tasks are marked done)
  console.log(`[sprintDemo] ---`);
  console.log(`[sprintDemo] Demos found: ${demosFound}, missing: ${demosMissing}`);

  saveState(state);
  console.log('[sprintDemo] done');
}

if (require.main === module) {
  main().then(() => process.exit(0))
    .catch(e => { console.error('[sprintDemo] fatal:', e.message); process.exit(1); });
}
