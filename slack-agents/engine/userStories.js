#!/usr/bin/env node
/**
 * MACF User Stories — with BDD + TDD test attachments.
 *
 * Jesse (Oct 10, 2026): "user stories with scores and acceptance criteria should
 * fit into these, each attached to automated bdd tests followed by automated TDD tests."
 *
 * Follows Alistair Cockburn's principles:
 * - Frequent delivery: stories are small, completable within a sprint
 * - Technical environment: BDD tests define behavior BEFORE code (TDD follows)
 * - Reflective improvement: story completion feeds velocity tracking
 *
 * User Story format:
 * {
 *   id: "US-001",
 *   title: "As a [role], I want [feature] so that [benefit]",
 *   story_points: 5,           // Fibonacci: 1,2,3,5,8,13
 *   acceptance_criteria: [     // Given/When/Then format
 *     "Given... When... Then...",
 *   ],
 *   bdd_tests: ["path/to.feature"],   // Run FIRST (behavior specification)
 *   tdd_tests: ["path/to.test.js"],   // Run AFTER BDD (implementation verification)
 *   status: "backlog|sprint|in-progress|done",
 *   sprint_id: null,
 *   definition_of_done: { ... }  // From scrum-config.json
 * }
 *
 * Workflow (Cockburn: BDD before TDD):
 * 1. Write user story with acceptance criteria
 * 2. Write BDD feature file (describes behavior, may fail initially)
 * 3. Write TDD unit tests (verify implementation details)
 * 4. Implement until BDD passes, then TDD passes
 * 5. Check Definition of Done
 * 6. Mark done → feeds velocity
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'scrum-config.json');
const STORIES_PATH = path.join(__dirname, '.user-stories.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { user_stories: { enabled: true } };
  }
}

function loadStories() {
  try {
    return JSON.parse(fs.readFileSync(STORIES_PATH, 'utf8'));
  } catch {
    return { stories: [], nextId: 1 };
  }
}

function saveStories(data) {
  fs.writeFileSync(STORIES_PATH, JSON.stringify(data, null, 2));
}

/**
 * Create a new user story with validation.
 */
function createStory({ title, story_points, acceptance_criteria, bdd_tests, tdd_tests }) {
  const config = loadConfig();
  const usConfig = config.user_stories || {};

  // Validate per config
  if (usConfig.require_acceptance_criteria && (!acceptance_criteria || acceptance_criteria.length === 0)) {
    throw new Error('User story requires acceptance criteria');
  }
  if (usConfig.require_bdd_tests && (!bdd_tests || bdd_tests.length === 0)) {
    throw new Error('User story requires BDD tests');
  }
  if (usConfig.require_tdd_tests && (!tdd_tests || tdd_tests.length === 0)) {
    throw new Error('User story requires TDD tests');
  }

  const validPoints = usConfig.story_point_scale || [1, 2, 3, 5, 8, 13];
  if (!validPoints.includes(story_points)) {
    throw new Error(`Story points must be one of: ${validPoints.join(', ')}`);
  }

  const data = loadStories();
  const story = {
    id: `US-${String(data.nextId).padStart(3, '0')}`,
    title,
    story_points,
    acceptance_criteria,
    bdd_tests,
    tdd_tests,
    status: 'backlog',
    sprint_id: null,
    created_at: new Date().toISOString(),
    definition_of_done: config.definition_of_done || {},
  };

  data.stories.push(story);
  data.nextId++;
  saveStories(data);

  return story;
}

/**
 * Check Definition of Done for a story.
 * Returns { done: bool, checklist: [...] }
 */
function checkDefinitionOfDone(story, verification = {}) {
  const config = loadConfig();
  const dod = config.definition_of_done || {};
  const checklist = [];

  for (const [key, description] of Object.entries(dod)) {
    const passed = verification[key] === true;
    checklist.push({ criterion: key, description, passed });
  }

  return {
    done: checklist.every(c => c.passed),
    checklist,
  };
}

/**
 * Get stories for sprint planning, sorted by priority (story points + status).
 */
function getSprintCandidates(maxPoints) {
  const data = loadStories();
  const backlog = data.stories.filter(s => s.status === 'backlog');
  // Sort by story points ascending (smaller first = quicker wins)
  backlog.sort((a, b) => a.story_points - b.story_points);

  const selected = [];
  let totalPoints = 0;
  for (const story of backlog) {
    if (totalPoints + story.story_points <= maxPoints) {
      selected.push(story);
      totalPoints += story.story_points;
    }
  }

  return { selected, totalPoints };
}

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'list') {
    const data = loadStories();
    console.log(`User stories: ${data.stories.length}`);
    for (const s of data.stories) {
      console.log(`  ${s.id} [${s.story_points}pts] [${s.status}] ${s.title.slice(0, 60)}`);
    }
  } else {
    console.log('Usage: node userStories.js list');
    console.log('  Use the module API to create stories programmatically.');
  }
}

module.exports = { createStory, checkDefinitionOfDone, getSprintCandidates, loadStories, saveStories };
