#!/usr/bin/env node
/**
 * MACF Sprint — 12-hour sprint planning + review/retrospective.
 *
 * Jesse (Oct 10, 2026): "Sprints are to be twice a day, every 12 hours."
 *
 * Follows Alistair Cockburn's Crystal Clear:
 * - Frequent delivery: every sprint produces verifiable deliverables
 * - Reflective improvement: retro feeds the improvement loop
 * - Focus: max 3 sprint priorities (WIP limit)
 * - Easy access to expert users: sprint review demos go to Jesse
 *
 * Sprint cycle (every 12 hours):
 * 1. PLANNING: review completed work, prioritize Vikunja backlog, set sprint goal
 * 2. EXECUTION: (happens via normal engine operation between sprints)
 * 3. REVIEW: demo completed work to Jesse
 * 4. RETROSPECTIVE: what worked, what didn't → improvement loop
 *
 * State tracked in .sprint-state.json
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const CONFIG_PATH = path.join(__dirname, 'scrum-config.json');
const SPRINT_STATE = path.join(__dirname, '.sprint-state.json');

// Newborn-sprint guard: never review a sprint younger than this, so a
// coincident sprint-review run can't kill the sprint the planner just opened
// (both jobs fire on the same 12h phase). Oct 11, 2026.
const MIN_SPRINT_AGE_MS = 60 * 60 * 1000;

/**
 * Fetch the prioritized Vikunja backlog (all projects, open tasks only).
 * Wired Oct 11, 2026 — replaces the empty stub (plan used to plan 0 priorities).
 */
async function fetchBacklog() {
  const url = process.env.VIKUNJA_URL || 'http://127.0.0.1:3456';
  const token = process.env.VIKUNJA_TOKEN;
  if (!token) { console.log('[sprint] VIKUNJA_TOKEN missing — planning with empty backlog'); return []; }
  try {
    const pr = await fetch(`${url}/api/v2/projects?per_page=100`, { headers: { Authorization: `Bearer ${token}` } });
    if (!pr.ok) { console.log('[sprint] backlog fetch failed:', pr.status); return []; }
    const projects = ((await pr.json()).items) || [];
    const out = [];
    for (const p of projects) {
      const tr = await fetch(`${url}/api/v2/projects/${p.id}/tasks?per_page=300`, { headers: { Authorization: `Bearer ${token}` } });
      if (!tr.ok) continue;
      const tasks = ((await tr.json()).items) || [];
      for (const t of tasks) {
        if (t.done) continue;
        out.push({
          id: t.id,
          title: t.title,
          priority: t.priority,
          done: false,
          project: p.title,
          due: t.due_date,
          assignees: (t.assignees || []).map(a => a.username).join(','),
        });
      }
    }
    return out;
  } catch (e) {
    console.log('[sprint] backlog fetch error:', e.message);
    return [];
  }
}

/**
 * Tasks completed since the sprint started (for an honest review).
 */
async function fetchCompletedSince(sinceISO) {
  const url = process.env.VIKUNJA_URL || 'http://127.0.0.1:3456';
  const token = process.env.VIKUNJA_TOKEN;
  if (!token) return [];
  try {
    const pr = await fetch(`${url}/api/v2/projects?per_page=100`, { headers: { Authorization: `Bearer ${token}` } });
    if (!pr.ok) return [];
    const projects = ((await pr.json()).items) || [];
    const since = new Date(sinceISO).getTime();
    const done = [];
    for (const p of projects) {
      const tr = await fetch(`${url}/api/v2/projects/${p.id}/tasks?per_page=300`, { headers: { Authorization: `Bearer ${token}` } });
      if (!tr.ok) continue;
      const tasks = ((await tr.json()).items) || [];
      for (const t of tasks) {
        if (t.done && t.updated && new Date(t.updated).getTime() >= since) {
          done.push({ id: t.id, title: t.title, updated: t.updated });
        }
      }
    }
    return done;
  } catch (e) {
    console.log('[sprint] completed-fetch error:', e.message);
    return [];
  }
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { sprint: { enabled: true, length_hours: 12 } };
  }
}

function loadSprintState() {
  try {
    return JSON.parse(fs.readFileSync(SPRINT_STATE, 'utf8'));
  } catch {
    return { currentSprint: null, history: [] };
  }
}

function saveSprintState(state) {
  fs.writeFileSync(SPRINT_STATE, JSON.stringify(state, null, 2));
}

/**
 * Start a new sprint: set goal, select top 3 priorities from backlog.
 * In production, this queries Vikunja for the prioritized backlog.
 */
function planSprint(backlog, config) {
  const priorities = (backlog || [])
    .filter(t => !t.done)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(0, config.wip_limits?.sprint_priorities || 3);

  const sprint = {
    id: `sprint-${Date.now()}`,
    startedAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + (config.sprint.length_hours * 3600 * 1000)).toISOString(),
    goal: priorities.length > 0
      ? `Complete top ${priorities.length} priorities`
      : 'Clear backlog and improve engine',
    priorities: priorities.map(t => ({ id: t.id, title: t.title })),
    completed: [],
    // Burndown: track remaining work over time
    burndown: [{ timestamp: new Date().toISOString(), remaining: priorities.length }],
    // Rotating facilitator (Cockburn: team owns improvement)
    facilitator: getNextFacilitator(config),
  };

  return sprint;

/**
 * Get next retrospective facilitator (rotates through team).
 */
function getNextFacilitator(config) {
  const rotation = config.retrospective?.facilitator_rotation || ['execpm'];
  const state = loadSprintState();
  const lastFacilitator = state.history.length > 0
    ? state.history[state.history.length - 1].facilitator
    : null;
  const lastIdx = rotation.indexOf(lastFacilitator);
  return rotation[(lastIdx + 1) % rotation.length];
}
}

/**
 * Close a sprint: record completed work, run retrospective.
 */
function reviewSprint(sprint, completedTasks) {
  const review = {
    sprintId: sprint.id,
    facilitator: sprint.facilitator || 'execpm',
    completedAt: new Date().toISOString(),
    planned: sprint.priorities.length,
    completed: (completedTasks || []).length,
    completionRate: sprint.priorities.length > 0
      ? Math.round(((completedTasks || []).length / sprint.priorities.length) * 100)
      : 0,
    // Burndown final state
    burndown: sprint.burndown || [],
    // Retrospective prompts (Cockburn: reflective improvement)
    retro: {
      whatWorked: [],      // Filled by scrum master from demo data
      whatDidnt: [],       // Filled from gaps/misses
      improvements: [],    // Fed to improvement loop
    },
  };

  return review;
}

/**
 * Format sprint planning for Slack.
 */
function formatPlanning(sprint) {
  const lines = [];
  lines.push(':dart: *Sprint Planning* — new 12-hour sprint starting');
  lines.push(`*Sprint:* ${sprint.id}`);
  lines.push(`*Goal:* ${sprint.goal}`);
  lines.push(`*Ends:* ${new Date(sprint.endsAt).toLocaleString('en-US', { timeZone: 'America/Denver' })}`);
  lines.push('');
  lines.push('*Top priorities:*');
  sprint.priorities.forEach((p, i) => {
    lines.push(`  ${i + 1}. #${p.id}: ${p.title.slice(0, 80)}`);
  });
  return lines.join('\n');
}

/**
 * Format sprint review for Slack.
 */
function formatReview(review) {
  const lines = [];
  lines.push(':tada: *Sprint Review* — 12-hour sprint complete');
  lines.push(`*Sprint:* ${review.sprintId}`);
  lines.push(`*Completed:* ${review.completed}/${review.planned} priorities (${review.completionRate}%)`);
  lines.push('');
  lines.push('*Retrospective:*');
  lines.push('  What worked: ' + (review.retro.whatWorked.join('; ') || 'pending scrum master input'));
  lines.push('  What didn\'t: ' + (review.retro.whatDidnt.join('; ') || 'pending scrum master input'));
  lines.push('  Improvements → fed to improvement loop');
  return lines.join('\n');
}

async function main() {
  const config = loadConfig();
  if (!config.sprint || !config.sprint.enabled) {
    console.log('[sprint] Disabled in scrum-config.json');
    return;
  }

  const mode = process.argv[2] || 'plan'; // 'plan' or 'review'
  const state = loadSprintState();

  if (mode === 'plan') {
    // Real backlog from Vikunja (wired Oct 11, 2026).
    const backlog = await fetchBacklog();
    // Never orphan an in-flight sprint: archive the previous one first.
    if (state.currentSprint) {
      const prevDone = await fetchCompletedSince(state.currentSprint.startedAt);
      state.history.push(reviewSprint(state.currentSprint, prevDone));
    }
    const sprint = planSprint(backlog, config);
    state.currentSprint = sprint;
    saveSprintState(state);
    console.log('[SPRINT-PLAN]');
    console.log(formatPlanning(sprint));
  } else if (mode === 'review') {
    if (!state.currentSprint) {
      console.log('[sprint] No active sprint to review');
      return;
    }
    const ageMs = Date.now() - new Date(state.currentSprint.startedAt).getTime();
    if (ageMs < MIN_SPRINT_AGE_MS) {
      // A coincident review run (same 12h phase as planning) must not
      // close a newborn sprint; it will be reviewed at the next cycle.
      console.log(`[sprint] Sprint ${state.currentSprint.id} is only ${Math.round(ageMs / 60000)} min old — skipping review (min age 60 min)`);
      return;
    }
    const completed = await fetchCompletedSince(state.currentSprint.startedAt);
    const review = reviewSprint(state.currentSprint, completed);
    state.history.push(review);
    state.currentSprint = null;
    saveSprintState(state);
    console.log('[SPRINT-REVIEW]');
    console.log(formatReview(review));
  }
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { planSprint, reviewSprint, formatPlanning, formatReview, loadConfig, fetchBacklog, fetchCompletedSince };
