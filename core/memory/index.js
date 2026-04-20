// core/memory/index.js — Memory backend abstraction
//
// Agents call memory.get/set/push. The backend is swappable:
//   - filesystem  (default, local JSON files — works for single-process)
//   - upstash     (Upstash Redis via HTTP — works across Railway + Cursor + any runtime)
//   - sqlite      (SQLite via better-sqlite3 — great for local dev)
//
// Set MEMORY_BACKEND=filesystem|upstash|sqlite in .env.
// All backends implement the same interface so agent code never changes.
//
// For cross-platform shared memory (same team in Slack AND Cursor),
// use the upstash backend with UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.

function createMemoryBackend(backendName) {
  const name = backendName || process.env.MEMORY_BACKEND || 'filesystem';
  switch (name) {
    case 'filesystem':
      return require('./filesystem');
    case 'upstash':
      return require('./upstash');
    case 'sqlite':
      return require('./sqlite');
    default:
      console.warn(`[memory] Unknown backend "${name}", falling back to filesystem`);
      return require('./filesystem');
  }
}

const backend = createMemoryBackend();

module.exports = {
  get:                    (agentId, key)           => backend.get(agentId, key),
  set:                    (agentId, key, value)    => backend.set(agentId, key, value),
  push:                   (agentId, key, value, maxLen) => backend.push(agentId, key, value, maxLen),
  dump:                   (agentId)                => backend.dump(agentId),
  loadAll:                ()                       => backend.loadAll?.(),
  updateChannelActivity:  (channelName)            => backend.updateChannelActivity(channelName),
  getChannelIdleMinutes:  (channelName)            => backend.getChannelIdleMinutes(channelName),

  // Expose for testing / migration
  _backend: backend,
  createMemoryBackend,
};
