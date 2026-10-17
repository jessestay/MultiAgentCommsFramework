/**
 * Model Router — reads config/models.yaml, provides tier-based model selection
 * with automatic fallback.
 *
 * Usage:
 *   const { getModelForTier, getAllTiers } = require('./modelRouter');
 *   const modelId = getModelForTier('smart');  // Returns first available
 *
 * Switching models = editing config/models.yaml. No code changes.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

let config = null;

function loadConfig() {
  if (config) return config;
  const configPath = path.join(__dirname, '..', 'config', 'models.yaml');
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    config = yaml.load(raw);
    return config;
  } catch (e) {
    console.error(`[modelRouter] Failed to load models.yaml: ${e.message}`);
    // Fallback to hardcoded defaults if config is missing
    return {
      tiers: {
        quick: [{ id: 'macf-cheap', provider: 'litellm' }],
        smart: [{ id: 'macf-smart-free', provider: 'litellm' }],
        best: [{ id: 'macf-best', provider: 'litellm' }],
      },
      settings: { empty_response_retries: 2, model_timeout_ms: 60000 },
    };
  }
}

/**
 * Get the primary model ID for a tier.
 * @param {string} tier - 'quick', 'smart', or 'best'
 * @returns {string} model ID
 */
function getModelForTier(tier) {
  const cfg = loadConfig();
  const tierConfig = cfg.tiers[tier];
  if (!tierConfig || tierConfig.length === 0) {
    throw new Error(`[modelRouter] No models configured for tier: ${tier}`);
  }
  return tierConfig[0].id;
}

/**
 * Get all model IDs for a tier in priority order (for fallback).
 * @param {string} tier
 * @returns {string[]} model IDs
 */
function getFallbackChain(tier) {
  const cfg = loadConfig();
  const tierConfig = cfg.tiers[tier];
  if (!tierConfig) return [];
  return tierConfig.map(m => m.id);
}

/**
 * Get all configured tiers.
 */
function getAllTiers() {
  const cfg = loadConfig();
  return Object.keys(cfg.tiers);
}

/**
 * Get full model info by ID.
 */
function getModelInfo(modelId) {
  const cfg = loadConfig();
  for (const [tier, models] of Object.entries(cfg.tiers)) {
    const found = models.find(m => m.id === modelId);
    if (found) return { ...found, tier };
  }
  return null;
}

/**
 * Reload config from disk (for testing or hot-reload).
 */
function reloadConfig() {
  config = null;
  return loadConfig();
}

module.exports = {
  getModelForTier,
  getFallbackChain,
  getAllTiers,
  getModelInfo,
  reloadConfig,
  loadConfig,
};
