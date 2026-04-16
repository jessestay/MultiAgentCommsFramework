// lib/state.js — Persistent state via GitHub API (jessestay/jesse-ops repo)

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'jessestay';
const REPO_NAME = 'jesse-ops';
const STATE_PATH = 'state/agent_state.json';
const GITHUB_API = 'https://api.github.com';

const DEFAULT_STATE = {
  projects: {
    gofundme: {
      name: "Louis's Powered Wheelchair",
      url: 'https://www.gofundme.com/f/his-walker-throws-him-insurance-says-he-doesnt-need-one',
      goal: 3000,
      raised: 0,
      status: 'active',
      last_updated: null,
    },
    transkrybe: {
      name: 'Transkrybe SaaS',
      url: 'https://transkrybe.com',
      github: 'jessestay/transkrybe',
      status: 'active',
      open_issues: [],
      last_deploy: null,
      last_updated: null,
    },
    job_search: {
      status: 'active',
      target_role: 'Director+ remote',
      top_targets: ['Sprout Social', 'You.com', 'Wpromote', 'TLDR'],
      applications: [],
      last_updated: null,
    },
    content_calendar: {
      status: 'active',
      platforms: ['Facebook', 'Twitter', 'LinkedIn', 'TikTok', 'YouTube'],
      scheduled_posts: [],
      last_updated: null,
    },
    slack_agents: {
      name: 'Multi-Agent Slack System',
      status: 'active',
      agents_deployed: ['exec-pm', 'marketing', 'transkrybe', 'content', 'jobs', 'research'],
      last_updated: null,
    },
  },
  tasks: {
    'exec-pm': [],
    marketing: [],
    transkrybe: [],
    content: [],
    jobs: [],
    research: [],
  },
  last_run: {
    morning_briefing: null,
    weekly_content: null,
    weekly_jobs: null,
    weekly_transkrybe: null,
  },
  pending_approvals: [],
  agent_memory: {
    'exec-pm': {},
    marketing: {},
    transkrybe: {},
    content: {},
    jobs: {},
    research: {},
  },
};

/**
 * Read state from GitHub
 */
async function getState() {
  if (!GITHUB_TOKEN) {
    console.warn('GITHUB_TOKEN not set, using default state');
    return { ...DEFAULT_STATE };
  }

  try {
    const response = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${STATE_PATH}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (response.status === 404) {
      // File doesn't exist yet — initialize it
      await setState(DEFAULT_STATE);
      return { ...DEFAULT_STATE };
    }

    const data = await response.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    const state = JSON.parse(content);

    // Merge with defaults to handle new fields
    return deepMerge(DEFAULT_STATE, state);
  } catch (err) {
    console.error('Error reading state from GitHub:', err);
    return { ...DEFAULT_STATE };
  }
}

/**
 * Write state to GitHub
 */
async function setState(newState) {
  if (!GITHUB_TOKEN) {
    console.warn('GITHUB_TOKEN not set, skipping state save');
    return;
  }

  try {
    // Get current SHA for update
    let sha = null;
    const getResponse = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${STATE_PATH}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (getResponse.ok) {
      const existing = await getResponse.json();
      sha = existing.sha;
    }

    const content = Buffer.from(JSON.stringify(newState, null, 2)).toString('base64');
    const body = {
      message: `Update agent state [${new Date().toISOString()}]`,
      content,
      ...(sha ? { sha } : {}),
    };

    const putResponse = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${STATE_PATH}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!putResponse.ok) {
      const err = await putResponse.json();
      console.error('Error writing state to GitHub:', err);
    }
  } catch (err) {
    console.error('Error writing state to GitHub:', err);
  }
}

/**
 * Update a specific path in state
 */
async function updateState(path, value) {
  const state = await getState();
  setNestedValue(state, path, value);
  await setState(state);
  return state;
}

/**
 * Add a task for an agent
 */
async function addTask(agentKey, task) {
  const state = await getState();
  if (!state.tasks[agentKey]) state.tasks[agentKey] = [];
  state.tasks[agentKey].push({
    id: Date.now().toString(),
    task,
    created: new Date().toISOString(),
    status: 'pending',
  });
  await setState(state);
  return state;
}

/**
 * Complete a task for an agent
 */
async function completeTask(agentKey, taskId) {
  const state = await getState();
  if (state.tasks[agentKey]) {
    const task = state.tasks[agentKey].find((t) => t.id === taskId);
    if (task) {
      task.status = 'completed';
      task.completed = new Date().toISOString();
    }
  }
  await setState(state);
  return state;
}

/**
 * Record a cron run timestamp
 */
async function recordCronRun(cronName) {
  return updateState(`last_run.${cronName}`, new Date().toISOString());
}

/**
 * Add a pending approval
 */
async function addPendingApproval(approval) {
  const state = await getState();
  state.pending_approvals = state.pending_approvals || [];
  state.pending_approvals.push({
    ...approval,
    id: Date.now().toString(),
    created: new Date().toISOString(),
  });
  await setState(state);
  return state;
}

// --- Helpers ---

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

function deepMerge(defaults, overrides) {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (
      overrides[key] !== null &&
      typeof overrides[key] === 'object' &&
      !Array.isArray(overrides[key]) &&
      typeof defaults[key] === 'object' &&
      !Array.isArray(defaults[key])
    ) {
      result[key] = deepMerge(defaults[key] || {}, overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

module.exports = {
  getState,
  setState,
  updateState,
  addTask,
  completeTask,
  recordCronRun,
  addPendingApproval,
  DEFAULT_STATE,
};

