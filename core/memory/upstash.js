// core/memory/upstash.js — Upstash Redis memory backend
//
// Use this for TRUE cross-platform shared memory: the same agent team
// running in Railway (Slack) and in your local Cursor/MCP session
// will read/write the same state.
//
// Setup:
//   1. Create a free Redis database at https://upstash.com
//   2. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your .env
//
// Key schema: macf:{agentId}:{keyPath}
// Channel activity: macf:shared:channel:{channelName}

const REST_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function upstash(command, ...args) {
  if (!REST_URL || !REST_TOKEN) {
    throw new Error('[memory/upstash] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
  }
  const res = await fetch(`${REST_URL}/${[command, ...args].map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${REST_TOKEN}` },
  });
  if (!res.ok) throw new Error(`[memory/upstash] HTTP ${res.status}`);
  const data = await res.json();
  return data.result;
}

function agentKey(agentId, keyPath) {
  return `macf:${agentId}:${keyPath}`;
}

async function get(agentId, keyPath) {
  try {
    const raw = await upstash('GET', agentKey(agentId, keyPath));
    if (raw === null || raw === undefined) return undefined;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[memory/upstash] get error:`, err.message);
    return undefined;
  }
}

async function set(agentId, keyPath, value) {
  try {
    await upstash('SET', agentKey(agentId, keyPath), JSON.stringify(value));
  } catch (err) {
    console.error(`[memory/upstash] set error:`, err.message);
  }
}

async function push(agentId, keyPath, value, maxLength = 200) {
  const key = agentKey(agentId, keyPath);
  try {
    // Use a Redis list: RPUSH then LTRIM to cap length
    await upstash('RPUSH', key, JSON.stringify(value));
    await upstash('LTRIM', key, -maxLength, -1);
  } catch (err) {
    console.error(`[memory/upstash] push error:`, err.message);
  }
}

async function dump(agentId) {
  // Returns a flat object of all keys for this agent (for debugging)
  // In Upstash, we'd need to SCAN — not efficient for large keyspaces.
  // For now, return a stub. Agents should use specific keys.
  console.warn('[memory/upstash] dump() is not efficient — use specific get() calls');
  return {};
}

function loadAll() {
  // No-op for Upstash — no local cache to warm
  console.log('[memory/upstash] Using Upstash Redis — no local load needed');
}

async function updateChannelActivity(channelName) {
  try {
    await upstash('SET', `macf:shared:channel:${channelName}`, Date.now().toString());
  } catch (err) {
    console.error(`[memory/upstash] updateChannelActivity error:`, err.message);
  }
}

async function getChannelIdleMinutes(channelName) {
  try {
    const ts = await upstash('GET', `macf:shared:channel:${channelName}`);
    if (!ts) return Infinity;
    return (Date.now() - parseInt(ts, 10)) / 60000;
  } catch {
    return Infinity;
  }
}

module.exports = { get, set, push, dump, loadAll, updateChannelActivity, getChannelIdleMinutes };
