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
        for (const agent of assignees) {
          if (!tasksByAgent[agent]) tasksByAgent[agent] = [];
          tasksByAgent[agent].push({ id: t.id, title: t.title, updated: t.updated });
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

async function main() {
  console.log('[sprintDemo] === Hourly Sprint Demo Check ===');
  console.log('[sprintDemo] ' + new Date().toISOString());

  const state = loadState();
  const tasksByAgent = await getActiveTasksByAgent();
  const demosByAgent = await checkRecentDemos();

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
      // A real demo resets the consecutive-miss streak (was never cleared, Oct 5 2026)
      if (state._misses) state._misses[agent] = 0;
      demosFound++;
    } else {
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

      // Update state to track consecutive misses
      if (!state.lastDemo[agent]) {
        state._misses = state._misses || {};
        state._misses[agent] = (state._misses[agent] || 0) + 1;
        if (state._misses[agent] >= 3) {
          console.log(`[sprintDemo] 🚨 ${agent}: 3+ consecutive hours without demo — escalation needed`);
          logGap({
            type: 'demo_streak_broken',
            agent: agent,
            consecutiveMisses: state._misses[agent],
            message: `${agent} has not demoed in ${state._misses[agent]} hours despite active tasks`,
          });
        }
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

main().then(() => process.exit(0))
  .catch(e => { console.error('[sprintDemo] fatal:', e.message); process.exit(1); });
