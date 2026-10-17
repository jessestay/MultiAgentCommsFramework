// lib/state.js — Persistent state via GitHub API (jessestay/jesse-ops repo)

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'jessestay';
const REPO_NAME = 'jesse-ops';
const STATE_PATH = 'state/agent_state.json';
const GITHUB_API = 'https://api.github.com';

const DEFAULT_STATE = {
  projects: {
    gofundme: {
      name: "Louis's Powered Wheelchair GoFundMe",
      url: 'https://www.gofundme.com/f/help-louis-stay-get-a-wheelchair',
      youtube: 'https://youtu.be/owmjuEs9EIM',
      goal: 2800,
      raised: 350,
      status: 'active',
      conditions: 'ME/CFS and hEDS (not cerebral palsy)',
      last_updated: null,
    },
    transkrybe: {
      name: 'Transkrybe SaaS — sheet music transposition',
      url: 'https://transkrybe.com',
      github: 'jessestay/transkrybe',
      description: 'Transposes uploaded sheet music into a different musical key. NOT audio transcription.',
      status: 'active',
      pending: 'Modal deploy',
      open_issues: [],
      last_deploy: null,
      last_updated: null,
    },
    job_search: {
      status: 'active',
      target_role: 'Director+ remote',
      top_targets: [
        'Sprout Social — VP Revenue Marketing',
        'You.com — Brand Director',
        'TLDR — VP Marketing',
      ],
      applications: [],
      last_updated: null,
    },
    ai_ceo_linkedin: {
      name: 'AI CEO LinkedIn Series',
      description: 'Semiweekly posts about running ops from iPhone with AI',
      status: 'active',
      posts_completed: 2,
      posts_due: ['Post 3 (Apr 21)', 'Post 4 (Apr 24)'],
      last_updated: null,
    },
    canvassador: {
      name: 'Canvassador',
      description: 'Affiliate marketing plan — details in GitHub jesse-ops repo',
      status: 'active',
      last_updated: null,
    },
    staynalive_blog: {
      name: 'staynalive.com Blog',
      url: 'https://staynalive.com',
      description: "Jesse's personal blog — Content Agent handles posts",
      status: 'active',
      last_updated: null,
    },
    content_calendar: {
      status: 'active',
      platforms: ['Facebook', 'Twitter/X', 'LinkedIn', 'TikTok', 'YouTube'],
      scheduled_posts: [],
      last_updated: null,
    },
    slack_agents: {
      name: 'Multi-Agent Slack System (MACF)',
      url: 'https://jesse-slack-agents.vercel.app',
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

async function getState() {
  if (!GITHUB_TOKEN) {
    console.warn('GITHUB_TOKEN not set, using default state');
    return { ...DEFAULT_STATE };
  }
  try {
    const response = await fetch(
      GITHUB_API + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + STATE_PATH,
      { headers: { Authorization: 'Bearer ' + GITHUB_TOKEN, Accept: 'application/vnd.github.v3+json' } }
    );
    if (response.status === 404) { await setState(DEFAULT_STATE); return { ...DEFAULT_STATE }; }
    const data = await response.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    const state = JSON.parse(content);
    return deepMerge(DEFAULT_STATE, state);
  } catch (err) {
    console.error('Error reading state from GitHub:', err);
    return { ...DEFAULT_STATE };
  }
}

async function setState(newState) {
  if (!GITHUB_TOKEN) { console.warn('GITHUB_TOKEN not set, skipping state save'); return; }
  try {
    let sha = null;
    const getResponse = await fetch(
      GITHUB_API + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + STATE_PATH,
      { headers: { Authorization: 'Bearer ' + GITHUB_TOKEN, Accept: 'application/vnd.github.v3+json' } }
    );
    if (getResponse.ok) { const existing = await getResponse.json(); sha = existing.sha; }
    const content = Buffer.from(JSON.stringify(newState, null, 2)).toString('base64');
    const body = { message: 'Update agent state [' + new Date().toISOString() + ']', content, ...(sha ? { sha } : {}) };
    const putResponse = await fetch(
      GITHUB_API + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + STATE_PATH,
      { method: 'PUT', headers: { Authorization: 'Bearer ' + GITHUB_TOKEN, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!putResponse.ok) { const err = await putResponse.json(); console.error('Error writing state to GitHub:', err); }
  } catch (err) { console.error('Error writing state to GitHub:', err); }
}

async function updateState(path, value) {
  const state = await getState();
  setNestedValue(state, path, value);
  await setState(state);
  return state;
}

async function addTask(agentKey, task) {
  const state = await getState();
  if (!state.tasks[agentKey]) state.tasks[agentKey] = [];
  state.tasks[agentKey].push({ id: Date.now().toString(), task, created: new Date().toISOString(), status: 'pending' });
  await setState(state);
  return state;
}

async function completeTask(agentKey, taskId) {
  const state = await getState();
  if (state.tasks[agentKey]) {
    const task = state.tasks[agentKey].find((t) => t.id === taskId);
    if (task) { task.status = 'completed'; task.completed = new Date().toISOString(); }
  }
  await setState(state);
  return state;
}

async function recordCronRun(cronName) {
  return updateState('last_run.' + cronName, new Date().toISOString());
}

async function addPendingApproval(approval) {
  const state = await getState();
  state.pending_approvals = state.pending_approvals || [];
  state.pending_approvals.push({ ...approval, id: Date.now().toString(), created: new Date().toISOString() });
  await setState(state);
  return state;
}

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
    if (overrides[key] !== null && typeof overrides[key] === 'object' && !Array.isArray(overrides[key]) && typeof defaults[key] === 'object' && !Array.isArray(defaults[key])) {
      result[key] = deepMerge(defaults[key] || {}, overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

module.exports = { getState, setState, updateState, addTask, completeTask, recordCronRun, addPendingApproval, DEFAULT_STATE };
