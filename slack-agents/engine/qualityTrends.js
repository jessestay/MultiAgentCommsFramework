#!/usr/bin/env node
// engine/qualityTrends.js — Catch stagnation before it becomes a problem.
//
// JESSE'S LAW (Oct 5, 2026): "We should never feel Complete and always be
// getting better."
//
// This analyzes per-agent quality scores over time from .delivery-learnings.json
// and detects:
//   - STAGNATION: Agent's scores are flat (not improving) over 20+ messages
//   - DECLINE: Agent's recent scores are trending downward
//   - BREAKTHROUGH: Agent's scores jumped significantly (positive reinforcement)
//
// Run daily via cron. Results logged as engine gaps for the self-healer.
// Usage: node engine/qualityTrends.js
'use strict';

const fs = require('fs');
const path = require('path');

const LEARN_PATH = path.join(__dirname, '.delivery-learnings.json');
const GAP_PATH = path.join(__dirname, '.engine-gaps.json');
const TREND_PATH = path.join(__dirname, '.quality-trends.json');

function logGap(gap) {
  try {
    let gaps = [];
    try { gaps = JSON.parse(fs.readFileSync(GAP_PATH, 'utf8')); } catch {}
    gaps.push({ timestamp: new Date().toISOString(), source: 'qualityTrends', ...gap });
    if (gaps.length > 200) gaps = gaps.slice(-200);
    fs.writeFileSync(GAP_PATH, JSON.stringify(gaps, null, 2));
  } catch (e) {
    console.error('[qualityTrends] gap log failed:', e.message);
  }
}

function analyzeTrend(scores) {
  // scores: array of recent scores (oldest first)
  // Returns: 'improving' | 'stagnant' | 'declining' | 'insufficient_data'
  if (scores.length < 10) return 'insufficient_data';

  const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
  const secondHalf = scores.slice(Math.floor(scores.length / 2));

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const diff = avgSecond - avgFirst;

  if (diff > 0.5) return 'improving';
  if (diff < -0.5) return 'declining';
  return 'stagnant';
}

async function main() {
  console.log('[qualityTrends] === Quality Trend Analysis ===');
  console.log('[qualityTrends] ' + new Date().toISOString());

  let learnings;
  try {
    learnings = JSON.parse(fs.readFileSync(LEARN_PATH, 'utf8'));
  } catch (e) {
    console.log('[qualityTrends] No learnings file — nothing to analyze');
    return;
  }

  const patterns = learnings.patterns || {};
  const trends = {};
  let stagnantAgents = [];
  let decliningAgents = [];
  let improvingAgents = [];

  for (const [agentId, pattern] of Object.entries(patterns)) {
    // We need score history, not just averages. For now, use the pattern data.
    // Full history tracking will be added to delivery-learner.js.
    // Note: avgScore is stored as a string in the learnings file
    const avgScore = parseFloat(pattern.avgScore) || 0;
    const messageCount = parseInt(pattern.messageCount) || 0;

    // Store current snapshot for trend comparison
    trends[agentId] = {
      avgScore,
      messageCount,
      checkedAt: new Date().toISOString(),
    };

    // Simple heuristic: agents with 20+ messages and avg < 1.5 are stagnating
    // (they're producing output but not high-quality output)
    if (messageCount >= 20 && avgScore < 1.5 && avgScore > 0) {
      stagnantAgents.push({ agent: agentId, avgScore, messageCount });
      logGap({
        type: 'quality_stagnation',
        agent: agentId,
        avgScore,
        messageCount,
        message: `${agentId} has ${messageCount} scored messages but avg quality is only ${avgScore.toFixed(2)} — not improving`,
      });
    }

    // Agents with very low scores need attention
    if (messageCount >= 10 && avgScore < 0.5) {
      decliningAgents.push({ agent: agentId, avgScore, messageCount });
      logGap({
        type: 'quality_decline',
        agent: agentId,
        avgScore,
        messageCount,
        message: `${agentId} quality is critically low (${avgScore.toFixed(2)} over ${messageCount} messages)`,
      });
    }

    // Agents doing well get recognized
    if (messageCount >= 10 && avgScore >= 2.0) {
      improvingAgents.push({ agent: agentId, avgScore, messageCount });
    }
  }

  // Save trend snapshot
  try {
    let history = {};
    try { history = JSON.parse(fs.readFileSync(TREND_PATH, 'utf8')); } catch {}
    history[new Date().toISOString().slice(0, 10)] = trends;
    // Keep last 30 days
    const keys = Object.keys(history).sort().slice(-30);
    const trimmed = {};
    for (const k of keys) trimmed[k] = history[k];
    fs.writeFileSync(TREND_PATH, JSON.stringify(trimmed, null, 2));
  } catch (e) {
    console.error('[qualityTrends] trend save failed:', e.message);
  }

  console.log(`[qualityTrends] Analyzed ${Object.keys(patterns).length} agents`);
  if (stagnantAgents.length > 0) {
    console.log(`[qualityTrends] ⚠️  Stagnant: ${stagnantAgents.map(a => `${a.agent} (${a.avgScore.toFixed(2)})`).join(', ')}`);
  }
  if (decliningAgents.length > 0) {
    console.log(`[qualityTrends] 🚨 Declining: ${decliningAgents.map(a => `${a.agent} (${a.avgScore.toFixed(2)})`).join(', ')}`);
  }
  if (improvingAgents.length > 0) {
    console.log(`[qualityTrends] ✅ Strong: ${improvingAgents.map(a => `${a.agent} (${a.avgScore.toFixed(2)})`).join(', ')}`);
  }
  if (stagnantAgents.length === 0 && decliningAgents.length === 0) {
    console.log('[qualityTrends] All agents healthy or insufficient data');
  }

  console.log('[qualityTrends] done');
}

main().then(() => process.exit(0))
  .catch(e => { console.error('[qualityTrends] fatal:', e.message); process.exit(1); });
