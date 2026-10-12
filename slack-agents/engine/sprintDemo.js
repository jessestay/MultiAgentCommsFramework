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

/**
 * Validate Jesse's clickable demo format (Oct 9, 2026).
 * Returns {valid: boolean, missing: string[]} — missing lists absent elements.
 * Required: action label, artifact link, task reference.
 */
function validateDemoFormat(text) {
  const missing = [];
  if (!text) return { valid: false, missing: ['label', 'artifact-link', 'task-ref'] };

  // Action label: [Needs Approval], [Needs Feedback], or [FYI] (case-insensitive)
  if (!/\[(needs approval|needs feedback|fyi)\]/i.test(text)) {
    missing.push('label');
  }
  // Artifact link: must contain a URL
  if (!/https?:\/\/[^\s]+/.test(text)) {
    missing.push('artifact-link');
  }
  // Task reference: task #N or similar
  if (!/task\s*#\d+/i.test(text)) {
    missing.push('task-ref');
  }

  return { valid: missing.length === 0, missing };
}

const DEMO_ACTION_LABELS = ['[Needs Approval]', '[Needs Feedback]', '[FYI]'];

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
        // P1.6 (Oct 12, 2026): parked tasks (WIP cap) are not active work —
        // same dormant rule as the work engine.
        const haystack = `${t.title || ''} ${t.description || ''}`;
        if (/hold-001|on hold|\bparked\b|guardrail/i.test(haystack)) continue;
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
  // P0.2 (Oct 12, 2026): a demo is TASK-LINKED OUTPUT with evidence — a
  // deliverable the work engine posted for a real Vikunja task. The old code
  // read .agent-health.json (lastActivity + lifetime completions), which the
  // hourly autonomous pulse-runner bumps every hour — so every check reported
  // "all agents demoed" while zero real work shipped. Health heartbeats no
  // longer count as demo evidence.
  const state = require('../utils/state');
  const windowAgo = Date.now() - 2 * 3600 * 1000; // 2h window: engine does ~1 task/30min
  const demosByAgent = {};

  const agents = ['cfo', 'cmo', 'cro', 'execpm', 'facebook', 'cto', 'lawyer', 'jobcoach', 'cco', 'cuxo', 'hr'];
  for (const agentId of agents) {
    const lastDemo = state.get('workEngine', `lastDemo.${agentId}`);
    if (lastDemo && new Date(lastDemo).getTime() > windowAgo) {
      demosByAgent[agentId] = {
        lastDemo,
        taskId: state.get('workEngine', `lastDemoTask.${agentId}`) || null,
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
  validateDemoFormat,
  DEMO_ACTION_LABELS,
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
      console.log(`[sprintDemo] ✅ ${agent}: demo found (task #${demo.taskId || '?'}, at: ${demo.lastDemo})`);
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

      console.log(`[sprintDemo] ⚠️  ${agent}: NO demo in last 2h (${tasks.length} active tasks)`);
      demosMissing++;

      // P0.2 (Oct 12, 2026): per-agent hourly gaps were noise (11 gaps/hour
      // once demos meant real output). The signal is engine-wide drought —
      // tracked below. Keep the streak for display; escalate only on drought.
      const prev = state._misses[agent] || 0;
      state._misses[agent] = prev + 1;
    }
  }

  // NEVER COMPLETE: Check recently completed tasks and prompt for next version
  // (This is a placeholder for the full implementation — the directive poller
  // will trigger improvement prompts when tasks are marked done)
  console.log(`[sprintDemo] ---`);
  console.log(`[sprintDemo] Demos found: ${demosFound}, missing: ${demosMissing}`);

  // P0.2 (Oct 12, 2026): escalate on ENGINE-WIDE drought, not per-agent
  // noise. Zero task-linked deliverables for 3 consecutive hourly checks
  // means the work engine is stalled — that is the real gap.
  state._engineDrought = demosFound > 0 ? 0 : (state._engineDrought || 0) + 1;
  if (crossesEscalationThreshold(state._engineDrought - 1, state._engineDrought)) {
    console.log(`[sprintDemo] 🚨 ENGINE DROUGHT: zero task-linked deliverables for ${state._engineDrought} consecutive hourly checks`);
    logGap({
      type: 'engine_demo_drought',
      consecutiveChecks: state._engineDrought,
      message: `Work engine produced zero task-linked deliverables for ${state._engineDrought} consecutive hourly checks`,
    });
  } else if (state._engineDrought > 3) {
    console.log(`[sprintDemo] 🚨 ENGINE DROUGHT continues (${state._engineDrought} checks) — already escalated`);
  }

  // P0.3 (Oct 12, 2026): drain the work engine's relay queue — REAL
  // task-linked deliverables, surfaced to Jesse with content inline.
  // (The Slack-scan relay below stays as the agent-direct path.)
  // QUALITY FILTER (Oct 12, 2026): only relay items meeting Jesse's demo
  // standard (label + artifact link + task ref + substance). Substandard
  // items are dropped with a logged reason — they never reach Jesse.
  // Previously the drain relayed everything, including narration-of-intent
  // ("Let me check...") with no evidence.
  try {
    const we = require('./workEngine');
    const { qualifiesAsDemo } = require('./demoRelay');
    const queued = we.drainRelayQueue();
    if (queued.length > 0) {
      console.log(`[sprintDemo] 📤 ${queued.length} work-engine deliverable(s) for relay to Jesse:`);
      for (const q of queued) {
        const checkText = `[work engine → ${q.agent}] Task #${q.taskId} ${q.title}\n\n${q.deliverable || ''}`;
        const verdict = qualifiesAsDemo(checkText);
        if (!verdict.qualifies) {
          console.log(`[sprintDemo] ⏭️ relay skipped (task #${q.taskId}): ${verdict.reason}`);
          continue;
        }
        console.log(`[RELAY-DELIVERY] [${q.done ? 'Done' : 'FYI'}] | ${q.agent} | task #${q.taskId} ${q.title}`);
        console.log(`[RELAY-DELIVERY] Content:`);
        console.log((q.deliverable || '').slice(0, 2000));
        console.log(`[RELAY-DELIVERY] --- end (at ${q.ts}) ---`);
      }
    }
  } catch (e) {
    console.log(`[sprintDemo] Relay queue drain failed: ${e.message}`);
  }

  // DEMO RELAY (Oct 9, 2026 — Jesse: "pass the demos they give in slack to me"):
  // Scan Slack for agent demos meeting Jesse's standard and output them
  // for relay. The cron worker picks these up and surfaces to Jesse.
  try {
    const { scanForDemos } = require('./demoRelay');
    const relayDemos = await scanForDemos();
    if (relayDemos.length > 0) {
      console.log(`[sprintDemo] 📤 ${relayDemos.length} demo(s) qualifying for relay to Jesse:`);
      for (const d of relayDemos) {
        console.log(`[RELAY-DEMO] ${d.label} | ${d.agent} | ${d.task} | ${d.title}`);
        if (d.artifactLink) {
          console.log(`[RELAY-DEMO] Link: ${d.artifactLink}`);
        }
        if (d.fullText) {
          console.log(`[RELAY-DEMO] Content:`);
          console.log(d.fullText);
          console.log(`[RELAY-DEMO] --- end content ---`);
        }
      }
    } else {
      console.log(`[sprintDemo] No demos qualifying for relay (standard: label + link + task ref)`);
    }
  } catch (e) {
    console.log(`[sprintDemo] Demo relay scan failed: ${e.message}`);
  }

  saveState(state);
  console.log('[sprintDemo] done');
}

if (require.main === module) {
  main().then(() => process.exit(0))
    .catch(e => { console.error('[sprintDemo] fatal:', e.message); process.exit(1); });
}

