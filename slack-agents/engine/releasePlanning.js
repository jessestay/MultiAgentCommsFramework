#!/usr/bin/env node
/**
 * MACF Release Planning — every 4 sprints (48 hours).
 *
 * Jesse (Oct 10, 2026): "Somewhere we should fit in release planning meetings
 * and user stories with scores and acceptance criteria."
 *
 * Follows Alistair Cockburn's principles:
 * - Frequent delivery: releases every 4 sprints = working software every 48h
 * - Reflective improvement: release retro reviews velocity trends
 * - Focus: release goal limits scope; WIP limits prevent overload
 * - Easy access to expert users: release demos go to Jesse for approval
 *
 * Release cycle:
 * 1. PLANNING: review velocity, prioritize user stories, set release goal
 * 2. SPRINTS: 4 x 12h sprints execute the stories
 * 3. REVIEW: demo all completed stories to Jesse
 * 4. RETROSPECTIVE: velocity analysis, process improvements → improvement loop
 *
 * State tracked in .release-state.json
 */

const fs = require('fs');
const path = require('path');
const { getSprintCandidates, loadStories } = require('./userStories');

const CONFIG_PATH = path.join(__dirname, 'scrum-config.json');
const RELEASE_STATE = path.join(__dirname, '.release-state.json');
const SPRINT_STATE = path.join(__dirname, '.sprint-state.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { release: { enabled: true, sprints_per_release: 4 } };
  }
}

function loadReleaseState() {
  try {
    return JSON.parse(fs.readFileSync(RELEASE_STATE, 'utf8'));
  } catch {
    return { currentRelease: null, history: [], velocityHistory: [] };
  }
}

function saveReleaseState(state) {
  fs.writeFileSync(RELEASE_STATE, JSON.stringify(state, null, 2));
}

function loadSprintState() {
  try {
    return JSON.parse(fs.readFileSync(SPRINT_STATE, 'utf8'));
  } catch {
    return { history: [] };
  }
}

/**
 * Calculate velocity from recent sprint history.
 * Returns { avgCompletionRate, avgPoints, trend }
 */
function calculateVelocity(sprintHistory, numSprints = 5) {
  const recent = sprintHistory.slice(-numSprints);
  if (recent.length === 0) {
    return { avgCompletionRate: 0, avgPoints: 0, trend: 'insufficient-data', sprints: 0 };
  }

  const rates = recent.map(s => s.completionRate || 0);
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;

  // Trend: compare last 2 vs previous
  let trend = 'stable';
  if (recent.length >= 4) {
    const lastTwo = (rates.slice(-2).reduce((a, b) => a + b, 0)) / 2;
    const prevTwo = (rates.slice(-4, -2).reduce((a, b) => a + b, 0)) / 2;
    if (lastTwo > prevTwo + 10) trend = 'improving';
    else if (lastTwo < prevTwo - 10) trend = 'declining';
  }

  return {
    avgCompletionRate: Math.round(avg),
    avgPoints: 0, // TODO: track story points per sprint
    trend,
    sprints: recent.length,
  };
}

/**
 * Plan a release: select user stories based on velocity.
 */
function planRelease(config, velocity) {
  const sprintsPerRelease = config.release.sprints_per_release || 4;

  // Estimate capacity: use velocity or default to 20 points per sprint
  const pointsPerSprint = velocity.avgPoints > 0 ? velocity.avgPoints : 20;
  const totalCapacity = pointsPerSprint * sprintsPerRelease;

  const { selected, totalPoints } = getSprintCandidates(totalCapacity);

  const release = {
    id: `release-${Date.now()}`,
    plannedAt: new Date().toISOString(),
    sprintsPlanned: sprintsPerRelease,
    goal: selected.length > 0
      ? `Deliver ${selected.length} user stories (${totalPoints} pts)`
      : 'Stabilize engine and clear technical debt',
    userStories: selected.map(s => s.id),
    totalPoints,
    estimatedCapacity: totalCapacity,
    velocityAtPlan: velocity,
    status: 'planned',
  };

  return release;
}

/**
 * Format release planning for Slack.
 */
function formatReleasePlanning(release, velocity) {
  const lines = [];
  lines.push(':rocket: *Release Planning* — new release cycle starting');
  lines.push(`*Release:* ${release.id}`);
  lines.push(`*Goal:* ${release.goal}`);
  lines.push(`*Sprints:* ${release.sprintsPlanned} x 12h`);
  lines.push('');
  lines.push('*Velocity (last ' + velocity.sprints + ' sprints):*');
  lines.push(`  Completion rate: ${velocity.avgCompletionRate}% (${velocity.trend})`);
  lines.push('');
  lines.push('*User stories in this release:*');
  const stories = loadStories().stories.filter(s => release.userStories.includes(s.id));
  stories.forEach((s, i) => {
    lines.push(`  ${i + 1}. ${s.id} [${s.story_points}pts]: ${s.title.slice(0, 70)}`);
  });
  return lines.join('\n');
}

async function main() {
  const config = loadConfig();
  if (!config.release || !config.release.enabled) {
    console.log('[release] Disabled in scrum-config.json');
    return;
  }

  const sprintState = loadSprintState();
  const velocity = calculateVelocity(sprintState.history);
  const release = planRelease(config, velocity);

  const state = loadReleaseState();
  state.currentRelease = release;
  saveReleaseState(state);

  console.log('[RELEASE-PLAN]');
  console.log(formatReleasePlanning(release, velocity));
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { planRelease, calculateVelocity, formatReleasePlanning, loadReleaseState };
