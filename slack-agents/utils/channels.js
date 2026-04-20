// utils/channels.js — Shared channel resolution utility
// Uses hardcoded IDs to avoid needing channels:read scope.
// Falls back to conversations.list only if a name isn't in the static map.
'use strict';

const { CHANNEL_IDS } = require('../config');

/**
 * Resolve a channel name → channel ID.
 * Checks the static CHANNEL_IDS map first; falls back to conversations.list.
 * @param {object} client - Slack WebClient (app.client)
 * @param {string} name   - channel name without #
 * @returns {string|null}
 */
async function resolveChannel(client, name) {
  // Fast path: static lookup (no API call needed)
  if (CHANNEL_IDS[name]) return CHANNEL_IDS[name];

  // Slow path: runtime lookup (requires channels:read scope)
  try {
    const result = await client.conversations.list({
      types: 'public_channel,private_channel',
      limit: 200,
    });
    for (const ch of result.channels) {
      if (ch.name === name) return ch.id;
    }
    return null;
  } catch (err) {
    console.error(`[channels] Could not resolve #${name}:`, err.message);
    return null;
  }
}

module.exports = { resolveChannel };
