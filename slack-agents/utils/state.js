// utils/state.js — Persistent state management using a local JSON file
// Railway provides persistent disk at /data (configure volume in Railway dashboard)
// Falls back to /tmp for local dev

const fs = require('fs');
const path = require('path');

const STATE_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/tmp';
const STATE_FILE = path.join(STATE_DIR, 'jesse-agents-state.json');

// Default state shape
const DEFAULT_STATE = {
  // GoFundMe
  gofundme: {
    lastAmount: 0,
    lastChecked: null,
  },

  // GitHub (transkrybe repo)
  github: {
    lastCommitSha: null,
    lastPRNumber: null,
    lastChecked: null,
  },

  // Per-channel last activity timestamps (for idle detection)
  channelActivity: {
    'exec-pm': null,
    marketing: null,
    it: null,
    content: null,
    jobs: null,
    research: null,
  },

  // Content tracking — what's been suggested vs approved
  content: {
    pendingApprovals: [],   // { id, platform, draft, suggestedAt }
    lastSuggestedDate: null,
  },

  // Jobs — track postings we've already seen
  jobs: {
    seenPostingIds: [],
    lastSearched: null,
    lastWeeklyReport: null,
  },

  // Research — track when we last posted proactive research
  research: {
    lastProactivePost: null,
    seenTopics: [],
  },

  // Marketing
  marketing: {
    lastWeeklyCalendar: null,
  },

  // Exec PM
  execPM: {
    lastHealthCheck: null,
    lastMorningBriefing: null,
  },
};

let _state = null;

function loadState() {
  if (_state) return _state;
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      _state = { ...DEFAULT_STATE, ...JSON.parse(raw) };
      // Deep merge nested objects
      for (const key of Object.keys(DEFAULT_STATE)) {
        if (typeof DEFAULT_STATE[key] === 'object' && DEFAULT_STATE[key] !== null) {
          _state[key] = { ...DEFAULT_STATE[key], ..._state[key] };
        }
      }
    } else {
      _state = { ...DEFAULT_STATE };
    }
  } catch (err) {
    console.error('[state] Failed to load state, using defaults:', err.message);
    _state = { ...DEFAULT_STATE };
  }
  return _state;
}

function saveState() {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(_state, null, 2), 'utf8');
  } catch (err) {
    console.error('[state] Failed to save state:', err.message);
  }
}

function get(path) {
  const state = loadState();
  const parts = path.split('.');
  let current = state;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function set(path, value) {
  const state = loadState();
  const parts = path.split('.');
  let current = state;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] == null) current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
  saveState();
}

function push(path, value) {
  const arr = get(path) || [];
  arr.push(value);
  set(path, arr);
}

function updateChannelActivity(channel) {
  set(`channelActivity.${channel}`, new Date().toISOString());
}

function getChannelIdleMinutes(channel) {
  const last = get(`channelActivity.${channel}`);
  if (!last) return Infinity;
  return (Date.now() - new Date(last).getTime()) / 60000;
}

module.exports = { get, set, push, updateChannelActivity, getChannelIdleMinutes, loadState };
