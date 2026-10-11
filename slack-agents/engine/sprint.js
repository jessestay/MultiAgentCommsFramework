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

const CONFIG_PATH = path.join(__dirname, 'scrum-config.json');
const SPRINT_STATE = path.join(__dirname, '.sprint-state.json');

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
    // In production: fetch backlog from Vikunja here
    const sprint = planSprint([], config);
    state.currentSprint = sprint;
    saveSprintState(state);
    console.log('[SPRINT-PLAN]');
    console.log(formatPlanning(sprint));
  } else if (mode === 'review') {
    if (!state.currentSprint) {
      console.log('[sprint] No active sprint to review');
      return;
    }
    const review = reviewSprint(state.currentSprint, []);
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

module.exports = { planSprint, reviewSprint, formatPlanning, formatReview, loadConfig };
