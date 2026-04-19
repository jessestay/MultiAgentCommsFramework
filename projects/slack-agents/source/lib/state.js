// lib/state.js — Persistent state via GitHub API (jessestay/jesse-ops repo)
//
// v2: Added task queue helpers, memory scoping, and conflict-safe writes.
// State shape is backward compatible with v1.

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'jessestay';
const REPO_NAME = 'jesse-ops';
const STATE_PATH = 'state/agent_state.json';
const GITHUB_API = 'https://api.github.com';

// In-memory cache to reduce GitHub API round-trips within a single invocation
let _stateCache = null;
let _stateCacheTs = 0;
const CACHE_TTL_MS = 10_000; // 10s — safe for serverless

const DEFAULT_STATE = {
  version: 2,
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
      name: 'Multi-Agent Slack System (MACF)',
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
    process_queues: null,
  },
  pending_approvals: [],
  // Agent memory: persistent facts each agent accumulates over time.
  // Agents can read/write their own section. Keys are free-form.
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
async function getState(useCache = true) {
  // Return cached copy if fresh
  if (useCache && _stateCache && Date.now() - _stateCacheTs < CACHE_TTL_MS) {
    return _stateCache;
  }

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
      await setState(DEFAULT_STATE);
      return { ...DEFAULT_STATE };
    }

    const data = await response.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    const state = JSON.parse(content);
    // Cache the SHA for next write
    _lastSha = data.sha;

    const merged = deepMerge(DEFAULT_STATE, state);
    _stateCache = merged;
    _stateCacheTs = Date.now();
    return merged;
  } catch (err) {
    console.error('Error reading state from GitHub:', err);
    return { ...DEFAULT_STATE };
  }
}

// Cached SHA to avoid extra API call on writes
let _lastSha = null;

/**
 * Write state to GitHub with optimistic SHA caching
 */
async function setState(newState) {
  if (!GITHUB_TOKEN) {
    console.warn('GITHUB_TOKEN not set, skipping state save');
    return;
  }

  // Invalidate cache on write
  _stateCache = newState;
  _stateCacheTs = Date.now();

  try {
    // Use cached SHA if available, otherwise fetch it
    let sha = _lastSha;
    if (!sha) {
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
        _lastSha = sha;
      }
    }

    const content = Buffer.from(JSON.stringify(newState, null, 2)).toString('base64');
    const body = {
      message: `chore: agent state update [${new Date().toISOString()}]`,
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

    if (putResponse.ok) {
      const result = await putResponse.json();
      // Update SHA cache from response
      _lastSha = result.content?.sha || null;
    } else {
      const err = await putResponse.json();
      console.error('Error writing state to GitHub:', err);
      // If 409 conflict (SHA mismatch), clear SHA cache so next write fetches fresh
      if (putResponse.status === 409) {
        _lastSha = null;
      }
    }
  } catch (err) {
    console.error('Error writing state to GitHub:', err);
  }
}

/**
 * Update a specific nested path in state
 */
async function updateState(path, value) {
  const state = await getState();
  setNestedValue(state, path, value);
  await setState(state);
  return state;
}

/**
 * Add a task to an agent's queue
 * @param {string} agentKey - target agent
 * @param {string} task - task description (what the agent should do)
 * @param {object} meta - optional metadata (priority, source agent, deadline)
 */
async function addTask(agentKey, task, meta = {}) {
  const state = await getState();
  if (!state.tasks[agentKey]) state.tasks[agentKey] = [];
  const newTask = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    task,
    created: new Date().toISOString(),
    status: 'pending',
    priority: meta.priority || 'normal',
    source: meta.source || null,
    deadline: meta.deadline || null,
  };
  state.tasks[agentKey].push(newTask);
  await setState(state);
  console.log(`[state] Task added to ${agentKey}: ${task.slice(0, 60)}`);
  return newTask;
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
 * Get pending tasks for an agent
 */
async function getPendingTasks(agentKey) {
  const state = await getState();
  return (state.tasks[agentKey] || []).filter(t => t.status === 'pending');
}

/**
 * Update an agent's persistent memory
 * @param {string} agentKey - which agent
 * @param {object} facts - key-value pairs to merge into agent's memory
 */
async function updateAgentMemory(agentKey, facts) {
  const state = await getState();
  if (!state.agent_memory[agentKey]) state.agent_memory[agentKey] = {};
  Object.assign(state.agent_memory[agentKey], facts);
  await setState(state);
  return state.agent_memory[agentKey];
}

/**
 * Get an agent's persistent memory
 */
async function getAgentMemory(agentKey) {
  const state = await getState();
  return state.agent_memory?.[agentKey] || {};
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
      defaults[key] !== null &&
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
  getPendingTasks,
  updateAgentMemory,
  getAgentMemory,
  recordCronRun,
  addPendingApproval,
  DEFAULT_STATE,
};
