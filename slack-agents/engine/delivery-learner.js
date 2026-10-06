#!/usr/bin/env node
// delivery-learner.js — Delivery quality scoring based on VERIFIED BEHAVIOR.
//
// ARCHITECTURAL REBUILD (Oct 4, 2026):
//
// The old learner scored TEXT APPEARANCE: does the message contain a URL?
// a 19-digit number? the word "delivered"? This measured the appearance
// of work, not work itself. Worse, it PUNISHED correct architectural
// behavior:
//
//   - CFO correctly failing closed ("I could not verify the real numbers")
//     scored 0 — the learner punished honesty about money.
//   - Facebook Expert correctly reporting ROADBLOCK (no API tools available)
//     scored 0.33 — the learner punished following the escalation protocol.
//   - "Working #154 now" scored +1 just for mentioning a task number.
//
// The new learner scores VERIFIED BEHAVIOR:
//
//   +5  Externally verified delivery (claimed artifact confirmed in external system)
//   -5  False delivery claim (claimed artifact FAILED external verification)
//   +2  Correct roadblock (ROADBLOCK format with NEED/TRIED/BLOCKED BY)
//   +2  Correct fail-closed (refused to guess: "UNVERIFIED", "could not verify")
//   +2  Capability escalation (routed to execPM per protocol)
//   +1  Honest status update (working on task, no false claims)
//   +0.5 Appearance-only evidence (URL mentioned but not externally verified)
//   -2  Ack-only ("on it", "got it" with no substance)
//
// The learner reads .directive-verify-state.json to correlate delivery claims
// with actual external verification outcomes. A URL that was verified live
// earns full credit. A URL that was never checked earns almost nothing.
// A claimed delivery that FAILED verification earns negative score.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ENGINE_DIR = path.join(process.env.HOME, 'workspace/macf/slack-agents');
const LEARN_FILE = path.join(ENGINE_DIR, 'engine/.delivery-learnings.json');
const VERIFY_FILE = path.join(ENGINE_DIR, 'engine/.directive-verify-state.json');

// New behavior-based scoring rubric
const SCORING = {
  verifiedDelivery: 5,    // Claimed artifact confirmed in external system
  falseClaim: -5,         // Claimed artifact FAILED external verification
  correctRoadblock: 2,    // ROADBLOCK with NEED/TRIED/BLOCKED BY
  correctFailClosed: 2,    // Refused to guess ("UNVERIFIED", "could not verify")
  capabilityEscalation: 2,// Routed to execPM per protocol
  honestStatus: 1,        // Working on task, no false claims
  appearanceOnly: 0.5,    // URL/ID mentioned but not verified
  ackOnly: -2,            // "on it" / "got it" with no substance
};

function loadLearnings() {
  try {
    return JSON.parse(fs.readFileSync(LEARN_FILE, 'utf8'));
  } catch {
    return {
      version: 2,  // Bumped: new behavior-based scoring
      deliveries: [],
      patterns: {},
      lastAudit: null,
      totalAudits: 0,
    };
  }
}

function saveLearnings(data) {
  fs.writeFileSync(LEARN_FILE, JSON.stringify(data, null, 2));
}

function loadVerifyState() {
  try {
    return JSON.parse(fs.readFileSync(VERIFY_FILE, 'utf8'));
  } catch {
    return { pending: [], verified: [], failed: [] };
  }
}

// Check if a message's claimed artifacts were externally verified
function checkVerificationStatus(text, verifyState) {
  // Extract URLs from the message
  const urls = (text.match(/https?:\/\/[^\s<>"']+/g) || [])
    .map(u => u.replace(/[.,;!?)]+$/, ''))
    .filter(u => !/slack\.com|127\.0\.0\.1|localhost|example\.com/i.test(u));

  if (urls.length === 0) return { status: 'no-claims', detail: 'No verifiable artifacts claimed' };

  // Check each URL against verified and failed lists
  let verifiedCount = 0;
  let failedCount = 0;

  for (const url of urls) {
    // Check verified list
    const wasVerified = (verifyState.verified || []).some(v =>
      (v.artifacts || []).some(a => a.value === url && a.ok === true)
    );
    // Check failed list
    const wasFailed = (verifyState.failed || []).some(f =>
      (f.artifacts || []).some(a => a.value === url && a.ok === false)
    );

    if (wasVerified) verifiedCount++;
    else if (wasFailed) failedCount++;
  }

  if (verifiedCount > 0 && failedCount === 0) {
    return { status: 'verified', detail: `${verifiedCount} artifact(s) confirmed externally` };
  }
  if (failedCount > 0) {
    return { status: 'failed', detail: `${failedCount} artifact(s) FAILED external verification` };
  }
  return { status: 'unverified', detail: `${urls.length} artifact(s) claimed but not yet verified` };
}

function scoreMessage(text, verifyState) {
  let score = 0;
  const signals = [];
  const lower = text.toLowerCase();

  // === HIGHEST: Verified delivery ===
  const verification = checkVerificationStatus(text, verifyState);
  if (verification.status === 'verified') {
    score += SCORING.verifiedDelivery;
    signals.push('verified-delivery');
    return { score, signals, verification: verification.detail };
  }

  // === LOWEST: False delivery claim ===
  if (verification.status === 'failed') {
    score += SCORING.falseClaim;
    signals.push('false-claim');
    return { score, signals, verification: verification.detail };
  }

  // === CORRECT: Roadblock per protocol ===
  // [ROADBLOCK: Agent] NEED: <need> | TRIED: <attempts> | BLOCKED BY: <obstacle>
  if (/\[roadblock:/i.test(text) &&
      /need:/i.test(text) &&
      /tried:/i.test(text) &&
      /blocked by:/i.test(text)) {
    score += SCORING.correctRoadblock;
    signals.push('correct-roadblock');
    return { score, signals, verification: 'Roadblock follows escalation protocol' };
  }

  // === CORRECT: Fail-closed (refused to guess) ===
  // Especially important for money/finance — never punish honesty
  if (/could not verify|will not guess|unverified|fail.?closed|refus.*to (guess|hallucinate|fabricate)/i.test(text) &&
      !/delivered|published|shipped|completed/i.test(text)) {
    score += SCORING.correctFailClosed;
    signals.push('correct-fail-closed');
    return { score, signals, verification: 'Correctly refused to guess without verification' };
  }

  // === CORRECT: Capability escalation ===
  if (/\[capability request/i.test(text) ||
      /escalat.*to (ceo|execpm)|rout.*to execpm/i.test(text)) {
    score += SCORING.capabilityEscalation;
    signals.push('capability-escalation');
    return { score, signals, verification: 'Followed capability escalation chain' };
  }

  // === BAD: Ack-only (no substance) ===
  // Pure acks with no commitment get -2. But a message that commits to a
  // specific action ("I'll reply in-thread with what I find") is honest
  // status, not empty — it names the next step.
  const isPureAck = /^\s*\[.*?\]\s*(on it|got it|working on it|looking into it|acknowledged)[\s.]*$/i.test(text);
  const isShortVagueAck = /\b(on it|got it|working on it|looking into it)\b/i.test(text) &&
       !/#\d+/.test(text) && !/https?:\/\//.test(text) &&
       !/i'll |i will |checking |working the/i.test(text) &&
       text.length < 100;
  if (isPureAck || isShortVagueAck) {
    score += SCORING.ackOnly;
    signals.push('ack-only');
    return { score, signals, verification: 'Acknowledgment with no substance' };
  }

  // === NEUTRAL+: Substantive contribution ===
  // An agent writing substantive analysis (>80 chars, not an ack) is doing
  // its job even if the message doesn't match a specific pattern. Don't
  // punish expertise for not containing a URL.
  if (text.length > 80 && signals.length === 0) {
    score += SCORING.honestStatus;
    signals.push('honest-status');
    return { score, signals, verification: 'Substantive agent contribution' };
  }

  // === NEUTRAL: Honest status update ===
  // Has task ref, describes work, makes no false delivery claims
  if (/#\d+/.test(text) &&
      !/delivered|published|shipped|completed|deployed|live at/i.test(text)) {
    score += SCORING.honestStatus;
    signals.push('honest-status');
    // Small bonus if it mentions unverified URLs (appearance, not proof)
    if (verification.status === 'unverified') {
      score += SCORING.appearanceOnly;
      signals.push('appearance-only');
    }
    return { score, signals, verification: verification.detail };
  }

  // === WEAK: Claims delivery language but no verifiable artifacts ===
  if (/delivered|published|shipped|completed|deployed/i.test(text)) {
    if (verification.status === 'no-claims') {
      // Claims delivery but provides nothing checkable — suspicious
      score += 0;  // Neutral: can't verify, can't punish
      signals.push('unverifiable-claim');
      return { score, signals, verification: 'Delivery claimed but no artifacts to verify' };
    }
    if (verification.status === 'unverified') {
      score += SCORING.appearanceOnly;
      signals.push('appearance-only');
      return { score, signals, verification: verification.detail };
    }
  }

  // === DEFAULT: No scorable content ===
  return { score: 0, signals: ['no-signal'], verification: 'No scorable behavior detected' };
}

async function audit() {
  const learnings = loadLearnings();
  const verifyState = loadVerifyState();

  let WebClient;
  try {
    WebClient = require(path.join(ENGINE_DIR, 'node_modules/@slack/web-api')).WebClient;
  } catch (e) {
    console.log('[learner] Slack client unavailable, skipping');
    return;
  }

  let token;
  try {
    const fetch = `import sys
sys.path.insert(0, '/opt/hatch/skills/skill-creator/bin')
from dynamic_credentials import dynamic_credential_entry
entry = dynamic_credential_entry('custom.slack')
sys.stdout.write(entry['surrogate'])`;
    token = execFileSync('python3', ['-c', fetch], { encoding: 'utf8', timeout: 15000 }).trim();
  } catch (e) {
    console.log('[learner] Token fetch failed, skipping');
    return;
  }

  const client = new WebClient(token);
  const channels = ['C0ASH4TF604', 'C0ASDH1HC1Y', 'C0ASA532BGD'];
  const twoHoursAgo = Date.now() / 1000 - 7200;

  const scored = [];
  for (const channelId of channels) {
    try {
      const hist = await client.conversations.history({ channel: channelId, limit: 50 });
      const recent = (hist.messages || []).filter(m => parseFloat(m.ts) > twoHoursAgo);
      for (const m of recent) {
        const text = m.text || '';
        if (text.includes('[from: CEO')) continue; // Skip directives (inputs)
        if (!text.includes('[from:') && !text.includes('[work engine')) continue;

        const { score, signals, verification } = scoreMessage(text, verifyState);
        const agentMatch = text.match(/\[from:\s*(\w+)/) || text.match(/\[work engine →\s*(\w+)/);
        const agent = agentMatch ? agentMatch[1].toLowerCase().replace(/\s+/g, '') : 'unknown';

        scored.push({
          ts: m.ts,
          agent,
          score,
          signals,
          verification,
          preview: text.substring(0, 120),
          time: new Date(parseFloat(m.ts) * 1000).toISOString(),
          scoringVersion: 2,
        });
      }
    } catch (e) {
      console.log(`[learner] Channel ${channelId} error: ${e.message}`);
    }
  }

  // Update learnings
  learnings.totalAudits++;
  learnings.lastAudit = new Date().toISOString();
  learnings.version = 2;

  // Add new scored deliveries (dedupe by ts)
  const existingTs = new Set(learnings.deliveries.map(d => d.ts));
  const newOnes = scored.filter(s => !existingTs.has(s.ts));
  learnings.deliveries.push(...newOnes);

  // Keep only last 500
  if (learnings.deliveries.length > 500) {
    learnings.deliveries = learnings.deliveries.slice(-500);
  }

  // Learn patterns: per-agent average score (v2 scoring only)
  const byAgent = {};
  learnings.deliveries
    .filter(d => d.scoringVersion === 2)  // Only use new rubric
    .forEach(d => {
      if (!byAgent[d.agent]) byAgent[d.agent] = { total: 0, count: 0, best: null, signals: {} };
      byAgent[d.agent].total += d.score;
      byAgent[d.agent].count++;
      d.signals.forEach(s => {
        byAgent[d.agent].signals[s] = (byAgent[d.agent].signals[s] || 0) + 1;
      });
      if (!byAgent[d.agent].best || d.score > byAgent[d.agent].best.score) {
        byAgent[d.agent].best = d;
      }
    });

  for (const [agent, stats] of Object.entries(byAgent)) {
    learnings.patterns[agent] = {
      avgScore: stats.count > 0 ? (stats.total / stats.count).toFixed(2) : '0.00',
      messageCount: stats.count,
      signalBreakdown: stats.signals,
      scoringVersion: 2,
      bestDelivery: stats.best ? {
        score: stats.best.score,
        signals: stats.best.signals,
        verification: stats.best.verification,
        preview: stats.best.preview,
      } : null,
    };
  }

  saveLearnings(learnings);

  // Report
  const avgScore = scored.length > 0
    ? (scored.reduce((s, d) => s + d.score, 0) / scored.length).toFixed(2)
    : 'N/A';

  console.log(`[learner] Audit #${learnings.totalAudits} (v2 behavior scoring): ${scored.length} agent messages scored, avg quality: ${avgScore}`);

  const falseClaims = scored.filter(s => s.signals.includes('false-claim'));
  const verifiedDeliveries = scored.filter(s => s.signals.includes('verified-delivery'));
  const correctBehaviors = scored.filter(s =>
    s.signals.includes('correct-roadblock') ||
    s.signals.includes('correct-fail-closed') ||
    s.signals.includes('capability-escalation')
  );

  console.log(`[learner] ${verifiedDeliveries.length} verified deliveries, ${falseClaims.length} false claims, ${correctBehaviors.length} correct architectural behaviors`);

  if (falseClaims.length > 0) {
    console.log(`[learner] WARNING: ${falseClaims.length} false delivery claims detected`);
    falseClaims.forEach(f => console.log(`[learner]   [${f.agent}] ${f.preview.substring(0, 80)}`));
  }

  // NEVER COMPLETE (Jesse, Oct 5, 2026): Every verified delivery triggers
  // an improvement prompt. Completion is a checkpoint, not a finish line.
  // The team must always ask "what's the next better version?"
  if (verifiedDeliveries.length > 0) {
    console.log(`[learner] NEVER COMPLETE: ${verifiedDeliveries.length} deliveries trigger improvement prompts`);
    for (const d of verifiedDeliveries) {
      // Record the delivery as a baseline for the next better version
      if (!learnings.improvements) learnings.improvements = [];
      learnings.improvements.push({
        agent: d.agent,
        deliveredAt: new Date().toISOString(),
        preview: d.preview.substring(0, 200),
        prompt: `What's the next better version of this? How can it be improved?`,
        status: 'pending_improvement',
      });
      // Keep bounded
      if (learnings.improvements.length > 100) {
        learnings.improvements = learnings.improvements.slice(-100);
      }
    }
    // Save the updated learnings with improvement prompts
    try {
      fs.writeFileSync(LEARN_FILE, JSON.stringify(learnings, null, 2));
      console.log(`[learner] Improvement prompts recorded for ${verifiedDeliveries.length} deliveries`);
    } catch (e) {
      console.error('[learner] Failed to save improvement prompts:', e.message);
    }
  }

  // Show per-agent patterns (v2 only)
  for (const [agent, p] of Object.entries(learnings.patterns)) {
    if (p.messageCount >= 2) {
      console.log(`[learner] ${agent}: avg ${p.avgScore} over ${p.messageCount} messages (v2)`);
    }
  }

  return { scored: scored.length, avgScore, learnings };
}

audit().catch(e => {
  console.error('[learner] Audit failed:', e.message);
  process.exit(1);
});
