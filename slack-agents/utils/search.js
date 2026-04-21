// utils/search.js — Web search for agents needing live data
//
// Priority order (uses whichever is configured):
//   1. Local relay (Desktop/Chrome MCP) — richest results, no extra API cost
//   2. Google Custom Search API  — GOOGLE_API_KEY + GOOGLE_SEARCH_CX in env
//   3. Brave Search API          — BRAVE_SEARCH_API_KEY in env
//   4. Returns null              — agent falls back to its static knowledge
//
// Agents should call search() for any task needing current information.
// Never throw — always return null on failure so agents degrade gracefully.

const relay = require('./local-relay');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const BRAVE_API_KEY   = process.env.BRAVE_SEARCH_API_KEY || null;
const GOOGLE_API_KEY  = process.env.GOOGLE_API_KEY || null;
const GOOGLE_SEARCH_CX = process.env.GOOGLE_SEARCH_CX || null;

/**
 * Search the web. Returns array of { title, url, snippet } or null.
 * @param {string} query
 * @param {number} [limit=5]
 * @returns {Promise<Array|null>}
 */
async function search(query, limit = 5) {
  // 1. Try local relay first (Chrome MCP = best results, no cost)
  if (relay.isAvailable()) {
    const result = await relay.search(query, { limit });
    if (result && result.results && result.results.length > 0) {
      return result.results;
    }
  }

  // 2. Google Custom Search API
  if (GOOGLE_API_KEY && GOOGLE_SEARCH_CX) {
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(query)}&num=${Math.min(limit, 10)}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) {
        console.warn(`[search] Google API error: ${res.status}`);
      } else {
        const data = await res.json();
        const results = (data.items || []).map(r => ({
          title: r.title,
          url: r.link,
          snippet: r.snippet || '',
        }));
        if (results.length > 0) return results;
      }
    } catch (err) {
      console.warn('[search] Google search failed:', err.message);
    }
  }

  // 3. Brave Search API
  if (BRAVE_API_KEY) {
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': BRAVE_API_KEY,
        },
      });
      if (!res.ok) {
        console.warn(`[search] Brave API error: ${res.status}`);
        return null;
      }
      const data = await res.json();
      const results = (data.web?.results || []).map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.description || '',
      }));
      return results.length > 0 ? results : null;
    } catch (err) {
      console.warn('[search] Brave search failed:', err.message);
    }
  }

  // 3. No search available
  return null;
}

/**
 * Browse a URL for its content (text extraction).
 * Uses local relay (Chrome MCP) if available, falls back to basic fetch.
 * @param {string} url
 * @returns {Promise<string|null>} page text, or null
 */
async function browse(url) {
  // 1. Try relay (Chrome MCP — respects JS, full DOM)
  if (relay.isAvailable()) {
    const result = await relay.browse(url);
    if (result && result.text) return result.text;
  }

  // 2. Basic fetch fallback (no JS rendering, but works for static content)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MACF-Agent/1.0)' },
      timeout: 8000,
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Strip HTML, normalize whitespace
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);
    return text || null;
  } catch (err) {
    console.warn(`[search] Browse failed for ${url}: ${err.message}`);
    return null;
  }
}

/**
 * Format search results into a compact string for agent context.
 * @param {Array} results
 * @returns {string}
 */
function formatResults(results) {
  if (!results || results.length === 0) return '(no search results available)';
  return results
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
    .join('\n\n');
}

module.exports = { search, browse, formatResults };
