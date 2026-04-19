// utils/state.js — Per-agent isolated memory system
//
// MACF principle: Agents cannot read each other's minds.
// Each agent has its own memory file. To share information,
// agents must communicate via Slack messages.
//
// Memory files: /data/memory-{agentId}.json (Railway volume)
// Falls back to /tmp/memory-{agentId}.json for local dev.

const fs = require('fs');
const path = require('path');

const STATE_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/tmp';

// ─── Per-agent default state shapes ──────────────────────────────────────────
const DEFAULT_STATE = {
  execPM: {
    lastHealthCheck: null,
    lastMorningBriefing: null,
    trackedChannels: {},     // channelName → lastActivityISO
    knownCommitSha: null,    // last GitHub commit this agent saw
    knownDonationAmount: 0,  // last GoFundMe amount this agent saw
  },
  cmo: {
    lastWeeklyCalendar: null,
    lastGoFundMeAlert: null,
    knownDonationAmount: 0,
    activeCampaigns: [],
    delegationLog: [],       // [{to, request, timestamp}]
  },
  cco: {
    pendingApprovals: [],    // [{id, platform, draft, suggestedAt}]
    lastSuggestedDate: null,
    approvedContent: [],
    delegationLog: [],
  },
  jobcoach: {
    seenPostingIds: [],
    lastSearched: null,
    lastWeeklyReport: null,
    activeOpportunities: [], // [{title, company, url, stage}]
    delegationLog: [],
  },
  cuxo: {
    activeDesignProjects: [],
    lastUXReview: null,
    designFeedbackLog: [],
    delegationLog: [],
  },
  cro: {
    lastProactivePost: null,
    seenTopics: [],
    researchLog: [],         // [{topic, findings, timestamp}]
    delegationLog: [],
  },
  lawyer: {
    openRisks: [],           // [{description, severity, identified}]
    reviewedContracts: [],
    complianceChecklist: {},
    delegationLog: [],
  },
  cfo: {
    trackedMetrics: {},      // {mrr, churn, cac, ltv}
    budgetNotes: [],
    taxAlerts: [],
    delegationLog: [],
  },
};

// In-memory cache: agentId → state object
const _cache = {};

// ─── File path for an agent's memory ─────────────────────────────────────────
function stateFilePath(agentId) {
  return path.join(STATE_DIR, `memory-${agentId}.json`);
}

// ─── Load an agent's state (lazy, cached in memory) ──────────────────────────
function loadAgentState(agentId) {
  if (_cache[agentId]) return _cache[agentId];

  const defaults = DEFAULT_STATE[agentId] || {};
  const filePath = stateFilePath(agentId);

  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const saved = JSON.parse(raw);
      // Deep merge: defaults provide fallback structure, saved data wins
      _cache[agentId] = deepMerge(defaults, saved);
    } else {
      _cache[agentId] = { ...defaults };
    }
  } catch (err) {
    console.error(`[state] Failed to load memory for ${agentId}:`, err.message);
    _cache[agentId] = { ...defaults };
  }

  return _cache[agentId];
}

// ─── Save an agent's state to disk ───────────────────────────────────────────
function saveAgentState(agentId) {
  const state = _cache[agentId];
  if (!state) return;

  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(stateFilePath(agentId), JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error(`[state] Failed to save memory for ${agentId}:`, err.message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get a value from an agent's isolated memory.
 * @param {string} agentId   e.g. 'execPM', 'cmo'
 * @param {string} keyPath   dot-notation path e.g. 'knownDonationAmount'
 */
function get(agentId, keyPath) {
  const state = loadAgentState(agentId);
  return deepGet(state, keyPath);
}

/**
 * Set a value in an agent's isolated memory (writes to disk immediately).
 * @param {string} agentId
 * @param {string} keyPath
 * @param {*}      value
 */
function set(agentId, keyPath, value) {
  const state = loadAgentState(agentId);
  deepSet(state, keyPath, value);
  saveAgentState(agentId);
}

/**
 * Push a value to an array in an agent's memory.
 * @param {string} agentId
 * @param {string} keyPath
 * @param {*}      value
 * @param {number} [maxLength=200]  cap array length to prevent unbounded growth
 */
function push(agentId, keyPath, value, maxLength = 200) {
  const state = loadAgentState(agentId);
  const arr = deepGet(state, keyPath) || [];
  arr.push(value);
  // Trim oldest entries if over limit
  if (arr.length > maxLength) arr.splice(0, arr.length - maxLength);
  deepSet(state, keyPath, arr);
  saveAgentState(agentId);
}

/**
 * Get all state for an agent (for debugging and health checks).
 */
function dump(agentId) {
  return loadAgentState(agentId);
}

/**
 * Pre-load all agents' state at startup.
 */
function loadAll() {
  for (const agentId of Object.keys(DEFAULT_STATE)) {
    loadAgentState(agentId);
  }
  console.log('[state] Memory loaded for all agents:', Object.keys(DEFAULT_STATE).join(', '));
}

// ─── Shared channel activity tracker (cross-agent) ───────────────────────────
// This is the ONE shared state — channel timestamps for idle detection by Exec PM.
// All agents can update this; only Exec PM reads it for health checks.
const SHARED_STATE_FILE = path.join(STATE_DIR, 'shared-channel-activity.json');
let _sharedState = null;

function loadSharedState() {
  if (_sharedState) return _sharedState;
  try {
    if (fs.existsSync(SHARED_STATE_FILE)) {
      _sharedState = JSON.parse(fs.readFileSync(SHARED_STATE_FILE, 'utf8'));
    } else {
      _sharedState = {};
    }
  } catch {
    _sharedState = {};
  }
  return _sharedState;
}

function saveSharedState() {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(SHARED_STATE_FILE, JSON.stringify(_sharedState, null, 2), 'utf8');
  } catch (err) {
    console.error('[state] Failed to save shared state:', err.message);
  }
}

function updateChannelActivity(channelName) {
  loadSharedState();
  _sharedState[channelName] = new Date().toISOString();
  saveSharedState();
}

function getChannelIdleMinutes(channelName) {
  const shared = loadSharedState();
  const last = shared[channelName];
  if (!last) return Infinity;
  return (Date.now() - new Date(last).getTime()) / 60000;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
function deepGet(obj, path) {
  if (!path) return obj;
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function deepSet(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function deepMerge(defaults, saved) {
  const result = { ...defaults };
  for (const key of Object.keys(saved)) {
    if (
      saved[key] !== null &&
      typeof saved[key] === 'object' &&
      !Array.isArray(saved[key]) &&
      typeof defaults[key] === 'object' &&
      !Array.isArray(defaults[key])
    ) {
      result[key] = deepMerge(defaults[key] || {}, saved[key]);
    } else {
      result[key] = saved[key];
    }
  }
  return result;
}

module.exports = {
  get,
  set,
  push,
  dump,
  loadAll,
  updateChannelActivity,
  getChannelIdleMinutes,
  // Expose for testing
  _stateFilePath: stateFilePath,
};
