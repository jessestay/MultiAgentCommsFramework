#!/usr/bin/env node
/**
 * MACF Scrum Enhancements — the 5 architectural improvements.
 *
 * Jesse (Oct 10, 2026): "Please implement all of this."
 *
 * 1. Story Splitting Coach — suggests how to break down 8+ point stories
 * 2. BDD Living Documentation — generates readable specs from .feature files
 * 3. Sprint Goal Firewall — locks sprint scope; new work goes to backlog
 * 4. Release Notes Auto-generation — compiles completed stories per release
 * 5. Tech Debt Cap — limits tech-debt stories to 20% of sprint capacity
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'scrum-config.json');
const SPRINT_STATE = path.join(__dirname, '.sprint-state.json');

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// ─── 1. Story Splitting Coach ──────────────────────────────────────────────

/**
 * If a story is >= split threshold, suggest how to break it down.
 * Returns { needsSplit: bool, suggestions: [...] }
 */
function suggestSplit(story) {
  const config = loadConfig();
  const threshold = config.story_splitting?.split_threshold || 8;

  if (story.story_points < threshold) {
    return { needsSplit: false, suggestions: [] };
  }

  const techniques = config.story_splitting?.suggest_split_techniques || [];
  const suggestions = techniques.map((technique, i) => ({
    technique,
    example: `Split "${story.title.slice(0, 50)}..." using: ${technique}`,
  }));

  // Auto-suggest split by acceptance criteria
  const criteria = story.acceptance_criteria || [];
  if (criteria.length > 1) {
    suggestions.unshift({
      technique: 'Split by acceptance criteria',
      example: `This story has ${criteria.length} criteria — each could be its own story:`,
      proposedStories: criteria.map((c, i) => ({
        title: `${story.title} (part ${i + 1}: ${c.slice(0, 60)})`,
        suggestedPoints: Math.max(1, Math.ceil(story.story_points / criteria.length)),
      })),
    });
  }

  return { needsSplit: true, suggestions };
}

// ─── 2. BDD Living Documentation ───────────────────────────────────────────

/**
 * Scan .feature files and generate human-readable spec docs.
 */
function generateBddDocs() {
  const config = loadConfig();
  const sourceDir = path.join(__dirname, config.bdd_docs?.source_dir || 'tests');
  const outputPath = path.join(__dirname, '..', config.bdd_docs?.output || 'docs/bdd-specs.md');

  let docs = '# MACF Behavior Specifications\n\n';
  docs += '_Auto-generated from BDD feature files. ';
  docs += 'This is what the system does, in plain English._\n\n';
  docs += `_Generated: ${new Date().toISOString()}_\n\n`;

  let featureCount = 0;
  try {
    const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.feature'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(sourceDir, file), 'utf8');
      docs += `## ${file}\n\n`;
      docs += '```gherkin\n' + content.slice(0, 2000) + '\n```\n\n';
      featureCount++;
    }
  } catch (e) {
    docs += `_No feature files found in ${sourceDir}_\n`;
  }

  docs += `\n---\n_Total features documented: ${featureCount}_\n`;

  // Ensure docs dir exists
  const docsDir = path.dirname(outputPath);
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(outputPath, docs);

  return { outputPath, featureCount };
}

// ─── 3. Sprint Goal Firewall ───────────────────────────────────────────────

/**
 * Check if new work can be added to the active sprint.
 * Returns { allowed: bool, reason: string }
 */
function checkFirewall(taskTitle) {
  const config = loadConfig();
  const fw = config.sprint_firewall || {};

  if (!fw.enabled || !fw.lock_sprint_on_start) {
    return { allowed: true, reason: 'firewall disabled' };
  }

  let sprintState;
  try {
    sprintState = JSON.parse(fs.readFileSync(SPRINT_STATE, 'utf8'));
  } catch {
    return { allowed: true, reason: 'no active sprint' };
  }

  if (!sprintState.currentSprint) {
    return { allowed: true, reason: 'no active sprint' };
  }

  return {
    allowed: false,
    reason: `Sprint ${sprintState.currentSprint.id} is locked. "${taskTitle}" goes to backlog. Only ${fw.product_owner || 'jesse'} can override.`,
    redirectTo: 'backlog',
  };
}

// ─── 4. Release Notes Auto-generation ──────────────────────────────────────

/**
 * Generate release notes from completed stories in a release.
 */
function generateReleaseNotes(releaseId) {
  const config = loadConfig();

  const releaseState = JSON.parse(
    fs.readFileSync(path.join(__dirname, '.release-state.json'), 'utf8')
  );
  const release = (releaseState.history || []).find(r => r.id === releaseId)
    || releaseState.currentRelease;

  if (!release) throw new Error(`Release ${releaseId} not found`);

  const { loadStories } = require('./userStories');
  const stories = loadStories().stories.filter(s =>
    (release.userStories || []).includes(s.id) && s.status === 'done'
  );

  let notes = `# Release Notes: ${release.id}\n\n`;
  notes += `**Goal:** ${release.goal}\n\n`;
  notes += `**Completed:** ${stories.length}/${(release.userStories || []).length} stories\n\n`;

  if (config.release_notes?.include_velocity && release.velocityAtPlan) {
    notes += `**Velocity at planning:** ${release.velocityAtPlan.avgCompletionRate}% (${release.velocityAtPlan.trend})\n\n`;
  }

  notes += `## What's New\n\n`;
  for (const s of stories) {
    notes += `### ${s.title}\n`;
    notes += `- Story points: ${s.story_points}\n`;
    if (s.acceptance_criteria?.length) {
      notes += `- Acceptance criteria met:\n`;
      for (const ac of s.acceptance_criteria) notes += `  - [x] ${ac.slice(0, 100)}\n`;
    }
    notes += `\n`;
  }

  if (config.release_notes?.require_jesse_approval) {
    notes += `\n---\n_**Requires Jesse's approval before publishing**_\n`;
  }

  return { notes, storyCount: stories.length, requiresApproval: true };
}

// ─── 5. Tech Debt Cap ──────────────────────────────────────────────────────

/**
 * Check if adding a tech-debt story would exceed the 20% cap.
 * Returns { allowed: bool, currentPercent, reason }
 */
function checkTechDebtCap(sprintStories, newStory) {
  const config = loadConfig();
  const maxPercent = config.tech_debt?.max_percent_of_sprint || 20;
  const tag = config.tech_debt?.tag || 'tech-debt';

  if (!newStory.tags?.includes(tag)) {
    return { allowed: true, currentPercent: 0, reason: 'not tech debt' };
  }

  const totalPoints = sprintStories.reduce((sum, s) => sum + (s.story_points || 0), 0);
  const debtPoints = sprintStories
    .filter(s => s.tags?.includes(tag))
    .reduce((sum, s) => sum + (s.story_points || 0), 0);

  const newDebtTotal = debtPoints + (newStory.story_points || 0);
  const newTotal = totalPoints + (newStory.story_points || 0);
  const newPercent = newTotal > 0 ? Math.round((newDebtTotal / newTotal) * 100) : 0;

  if (newPercent > maxPercent) {
    return {
      allowed: false,
      currentPercent: newPercent,
      reason: `Tech debt would be ${newPercent}%, exceeds ${maxPercent}% cap. Move to next sprint.`,
    };
  }

  return { allowed: true, currentPercent: newPercent, reason: 'within cap' };
}

module.exports = {
  suggestSplit,
  generateBddDocs,
  checkFirewall,
  generateReleaseNotes,
  checkTechDebtCap,
};
