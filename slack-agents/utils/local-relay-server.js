#!/usr/bin/env node
// utils/local-relay-server.js — Run on Jesse's local machine to bridge
// Railway MACF agents to Claude Desktop / Cowork MCP tools.
//
// USAGE:
//   node utils/local-relay-server.js
//
// Then expose it publicly and set MACF_LOCAL_RELAY_URL in Railway env vars:
//   Option A (ngrok):         ngrok http 3456
//   Option B (Cloudflare):    cloudflared tunnel --url http://localhost:3456
//   Option C (Tailscale):     already accessible via Tailscale IP
//
// CAPABILITIES THIS EXPOSES TO RAILWAY AGENTS:
//   POST /api/browse   { url }           — Chrome MCP page fetch
//   POST /api/search   { query }         — Web search via Desktop tools
//   POST /api/desktop  { prompt, systemContext } — Local Claude Desktop reasoning
//   POST /api/design   { prompt }        — Figma/Canva via connected MCPs
//   POST /api/screenshot {}              — Screen capture for visual context
//   GET  /api/health                     — Liveness check
//
// SECURITY: Set MACF_LOCAL_RELAY_SECRET env var on both ends to require
// a shared secret header. Without it, anyone who knows the URL can call it.

require('dotenv').config();
const http = require('http');

const PORT    = parseInt(process.env.MACF_RELAY_PORT || '3456', 10);
const SECRET  = process.env.MACF_LOCAL_RELAY_SECRET || null;

// ─── Request auth check ───────────────────────────────────────────────────────
function isAuthorized(req) {
  if (!SECRET) return true; // No secret = open (only do this on a private tunnel)
  return req.headers['x-relay-secret'] === SECRET;
}

// ─── Read request body ────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ─── Capability handlers ──────────────────────────────────────────────────────
// Each handler receives the parsed request body and returns a JSON-serializable
// result. These are stubs — replace with real MCP calls when Claude Desktop is
// running. You can import MCP clients here or call the Desktop IPC directly.

async function handleBrowse({ url }) {
  // TODO: Replace with real Chrome MCP call when available
  // Example: const { mcp__Claude_in_Chrome__get_page_text } = require('./mcp-client');
  // return mcp__Claude_in_Chrome__get_page_text({ tabId: ..., url });
  //
  // For now, uses node-fetch as a fallback
  try {
    const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
    const res = await (await fetch(url)).text();
    // Strip HTML tags for a plain text approximation
    const text = res.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 5000);
    return { url, text, source: 'fetch-fallback' };
  } catch (err) {
    return { error: err.message };
  }
}

async function handleSearch({ query, limit = 5 }) {
  // TODO: Replace with Brave Search API, Serper, or Desktop search MCP
  // For now returns a placeholder so agents know the relay is alive
  console.log(`[relay] Search: "${query}"`);
  return {
    query,
    results: [],
    note: 'Connect a search API (Brave/Serper) or hook up the Desktop search MCP to get real results',
    source: 'stub',
  };
}

async function handleDesktop({ prompt, systemContext = '' }) {
  // TODO: Replace with actual Claude Desktop IPC or Claude Code SDK call
  // The Claude Code SDK (@anthropic-ai/claude-code) can be used here when
  // running inside a Claude Code session on the desktop.
  console.log(`[relay] Desktop request: "${prompt.slice(0, 60)}"`);
  return {
    response: null,
    note: 'Wire up Claude Code SDK or Desktop IPC to enable desktop-enhanced reasoning',
    source: 'stub',
  };
}

async function handleDesign({ prompt }) {
  // TODO: Replace with Figma/Canva MCP calls via Desktop
  console.log(`[relay] Design request: "${prompt.slice(0, 60)}"`);
  return {
    result: null,
    note: 'Connect Figma/Canva MCP in Claude Desktop to enable design generation',
    source: 'stub',
  };
}

async function handleScreenshot() {
  // TODO: Replace with computer-use screenshot MCP when Desktop is active
  return { screenshot: null, source: 'stub' };
}

// ─── Route table ─────────────────────────────────────────────────────────────
const ROUTES = {
  'POST /api/browse':      handleBrowse,
  'POST /api/search':      handleSearch,
  'POST /api/desktop':     handleDesktop,
  'POST /api/design':      handleDesign,
  'POST /api/screenshot':  handleScreenshot,
};

// ─── HTTP server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const routeKey = `${req.method} ${req.url.split('?')[0]}`;

  // Health check — no auth required
  if (routeKey === 'GET /api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', capabilities: Object.keys(ROUTES).map(k => k.split(' ')[1]) }));
    return;
  }

  // Auth check
  if (!isAuthorized(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  const handler = ROUTES[routeKey];
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown capability' }));
    return;
  }

  try {
    const body = await readBody(req);
    const result = await handler(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error(`[relay] Handler error for ${routeKey}:`, err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔗 MACF Local Relay Server — port ${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Exposing Desktop capabilities to Railway MACF agents.');
  console.log('');
  console.log('To make it publicly accessible for Railway:');
  console.log(`  ngrok:       ngrok http ${PORT}`);
  console.log(`  Cloudflare:  cloudflared tunnel --url http://localhost:${PORT}`);
  console.log('');
  console.log('Then set in Railway env vars:');
  console.log('  MACF_LOCAL_RELAY_URL=https://your-tunnel-url');
  if (SECRET) {
    console.log('  MACF_LOCAL_RELAY_SECRET=<same value as your local env>');
  } else {
    console.log('  ⚠️  No MACF_LOCAL_RELAY_SECRET set — relay is open to anyone with the URL');
  }
  console.log('');
  console.log('Capabilities:');
  Object.keys(ROUTES).forEach(r => console.log(`  ${r}`));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
