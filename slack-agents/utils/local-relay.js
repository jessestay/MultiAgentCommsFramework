// utils/local-relay.js — Optional bridge to Claude Desktop / Cowork local tools
//
// When Jesse's Claude Desktop (Cowork) is running locally and has the MACF
// relay service active, Railway agents can call it for capabilities that only
// exist on his machine: real web browsing via Chrome MCP, Figma/design access,
// richer AI context from the desktop subscription, file system access, etc.
//
// SETUP (for local Desktop enhancement):
//   1. Run `node utils/local-relay-server.js` on your machine (or via Claude Code)
//   2. Expose it publicly: `ngrok http 3456` or use a Tailscale/Cloudflare Tunnel
//   3. Set MACF_LOCAL_RELAY_URL=https://your-tunnel-url in Railway env vars
//
// When MACF_LOCAL_RELAY_URL is not set, all methods silently return null and
// agents fall back to their standard API-only behavior. Zero breaking changes.
//
// When it IS set, agents gain:
//   - browse(url)         — real Chrome browsing via Claude in Chrome MCP
//   - search(query)       — live web search with full page content
//   - design(prompt)      — Figma/Canva design generation
//   - desktop(prompt)     — Full Claude Desktop reasoning with desktop context
//   - screenshot()        — Current screen state for context

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const RELAY_URL     = process.env.MACF_LOCAL_RELAY_URL || null;
const RELAY_SECRET  = process.env.MACF_LOCAL_RELAY_SECRET || null;
const RELAY_TIMEOUT = parseInt(process.env.MACF_RELAY_TIMEOUT_MS || '8000', 10);

/**
 * Returns true if the local relay is configured and (optionally) reachable.
 */
function isAvailable() {
  return !!RELAY_URL;
}

/**
 * Call a capability on the local relay.
 * @param {string} capability  — 'browse' | 'search' | 'design' | 'desktop' | 'screenshot'
 * @param {object} payload     — capability-specific args
 * @returns {Promise<any|null>} — result or null on failure/unavailable
 */
async function call(capability, payload = {}) {
  if (!RELAY_URL) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RELAY_TIMEOUT);

    const headers = { 'Content-Type': 'application/json' };
    if (RELAY_SECRET) headers['X-Relay-Secret'] = RELAY_SECRET;

    const res = await fetch(`${RELAY_URL}/api/${capability}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[relay] ${capability} returned ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn(`[relay] ${capability} timed out after ${RELAY_TIMEOUT}ms — falling back to API-only`);
    } else {
      console.warn(`[relay] ${capability} failed: ${err.message} — falling back to API-only`);
    }
    return null;
  }
}

/**
 * Browse a URL with Chrome MCP (returns page text + title).
 * Falls back to null if relay unavailable.
 */
async function browse(url) {
  return call('browse', { url });
}

/**
 * Live web search using Desktop's connected search tools.
 * Falls back to null; caller should then use GoFundMe/GitHub direct APIs or skip.
 */
async function search(query, options = {}) {
  return call('search', { query, ...options });
}

/**
 * Ask the local Desktop Claude for a more context-rich response.
 * Use for tasks that benefit from desktop subscription's larger context/capabilities.
 * Falls back to null — caller uses normal generateReport() instead.
 */
async function desktop(prompt, systemContext = '') {
  return call('desktop', { prompt, systemContext });
}

/**
 * Trigger a design generation via Figma/Canva MCP on the desktop.
 */
async function design(prompt, options = {}) {
  return call('design', { prompt, ...options });
}

/**
 * Get a screenshot of the current desktop for visual context.
 */
async function screenshot() {
  return call('screenshot', {});
}

module.exports = { isAvailable, browse, search, desktop, design, screenshot };
