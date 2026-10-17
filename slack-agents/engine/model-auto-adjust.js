#!/usr/bin/env node
/**
 * Auto-adjust LLM gateway models when OpenRouter models disappear.
 * 
 * Problem: OpenRouter periodically removes :free models. When the gateway
 * config references dead models, all delegations fail.
 * 
 * Solution: This script checks available free models, tests them with
 * agent-sized prompts, and updates the gateway config automatically.
 * 
 * Runs via cron every 6 hours. Also runs on-demand when delegations fail.
 * 
 * Usage: node engine/model-auto-adjust.js [--check-only] [--force]
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execSync } = require('child_process');

// Config paths (desktop)
const GATEWAY_CONFIG = 'C:\\Users\\stay\\claude_proxy\\litellm_config.yaml';
const GATEWAY_ENV = 'C:\\Users\\stay\\claude_proxy\\macf_gateway.env';

// Test prompt size (matches agent systemPrompts)
const TEST_PROMPT_SIZE = 11000;
const TEST_TIMEOUT = 30000;

async function getOpenRouterKey() {
  // Read from desktop via SSH, or from local env for testing
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  // In production, this runs on the desktop via SSH
  throw new Error('OPENROUTER_API_KEY not available');
}

async function listFreeModels(apiKey) {
  const r = await axios.get('https://openrouter.ai/api/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    timeout: 20000,
  });
  return r.data.data
    .filter(m => m.id.endsWith(':free'))
    .map(m => m.id);
}

async function testModel(apiKey, modelId) {
  const bigPrompt = 'You are a test agent. ' + 'This is context. '.repeat(600);
  const t0 = Date.now();
  try {
    await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: modelId,
      messages: [
        { role: 'system', content: bigPrompt.slice(0, TEST_PROMPT_SIZE) },
        { role: 'user', content: 'Say HELLO' }
      ],
      max_tokens: 20,
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: TEST_TIMEOUT,
    });
    const ms = Date.now() - t0;
    return { modelId, ok: true, ms };
  } catch (e) {
    return { modelId, ok: false, error: e.message.slice(0, 100) };
  }
}

async function getCurrentGatewayModels() {
  // Parse the gateway config to find current macf-smart-free models
  // Returns array of model IDs like ['openrouter/nvidia/nemotron-3.5-lightning:free', ...]
  // Implementation depends on SSH access to desktop
  // For now, return the known models
  return [
    'openrouter/nvidia/nemotron-3.5-lightning:free',
    'openrouter/liquid/lfm-2.5-2.6b:free',
  ];
}

async function main() {
  const checkOnly = process.argv.includes('--check-only');
  const force = process.argv.includes('--force');
  
  console.log('[model-auto-adjust] Starting check...');
  
  try {
    const apiKey = await getOpenRouterKey();
    const freeModels = await listFreeModels(apiKey);
    console.log(`[model-auto-adjust] Found ${freeModels.length} free models`);
    
    const currentModels = await getCurrentGatewayModels();
    const currentIds = currentModels.map(m => m.replace('openrouter/', ''));
    
    // Check if current models still exist
    const dead = currentIds.filter(id => !freeModels.includes(id));
    if (dead.length > 0) {
      console.log(`[model-auto-adjust] DEAD MODELS: ${dead.join(', ')}`);
    } else {
      console.log('[model-auto-adjust] All current models still available');
      if (!force) {
        console.log('[model-auto-adjust] No action needed');
        return;
      }
    }
    
    if (checkOnly) {
      console.log('[model-auto-adjust] Check-only mode, not updating');
      return;
    }
    
    // Test available models and pick the best 2
    console.log('[model-auto-adjust] Testing candidate models...');
    const candidates = freeModels.slice(0, 10); // Test top 10
    const results = [];
    for (const m of candidates) {
      const r = await testModel(apiKey, m);
      results.push(r);
      console.log(`[model-auto-adjust] ${m}: ${r.ok ? `OK (${r.ms}ms)` : 'FAIL'}`);
    }
    
    const working = results.filter(r => r.ok).sort((a, b) => a.ms - b.ms);
    if (working.length < 2) {
      console.error('[model-auto-adjust] ERROR: Fewer than 2 working models found!');
      process.exit(1);
    }
    
    const best2 = working.slice(0, 2).map(r => `openrouter/${r.modelId}`);
    console.log(`[model-auto-adjust] Best 2: ${best2.join(', ')}`);
    
    // TODO: Update gateway config via SSH and restart
    // This requires desktop SSH access which the cron worker has
    console.log('[model-auto-adjust] Update gateway config manually or via desktop script');
    
  } catch (e) {
    console.error('[model-auto-adjust] FATAL:', e.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { listFreeModels, testModel };
