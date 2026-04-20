// core/memory/filesystem.js — Filesystem memory backend
// This is the default backend. Stores agent state as JSON files in STATE_DIR.
// Works great for single-process deployments (Railway, local dev).
// For cross-platform shared memory (Slack + Cursor on separate machines),
// switch to the upstash backend.

const fs   = require('fs');
const path = require('path');

const STATE_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/tmp';

// Re-export the full implementation from the original state.js
// This lets existing code continue working with zero changes while the
// new core architecture is built around it.
const state = require('../../slack-agents/utils/state');

module.exports = {
  get:                   state.get,
  set:                   state.set,
  push:                  state.push,
  dump:                  state.dump,
  loadAll:               state.loadAll,
  updateChannelActivity: state.updateChannelActivity,
  getChannelIdleMinutes: state.getChannelIdleMinutes,
};
