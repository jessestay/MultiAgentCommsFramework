#!/usr/bin/env node
// engine/directiveVerify.js — Real external outcome verification.
//
// ARCHITECTURAL REBUILD (Oct 4, 2026):
// The old verifier checked Slack messages for evidence keywords. That's
// theater — it verified the appearance of work, not work itself.
//
// The new verifier checks EXTERNAL SYSTEMS:
//   - URLs: HTTP request to verify the URL actually resolves
//   - X post IDs: Verify via X API that the post exists
//   - Vikunja task IDs: Verify via API that the task was substantively updated
//
// If the claimed artifact doesn't exist externally, the delivery FAILED —
// regardless of what the Slack message said.
//
// Usage: node engine/directiveVerify.js
// Run every 15 min via cron, after directivePoll.js
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');

const VERIFY_PATH = path.join(__dirname, '.directive-verify-state.json');
const HEALTH_PATH = path.join(__dirname, '.agent-health.json');

// Verification timeout: how long after a claim before we verify it
const VERIFY_AFTER_MIN = 10;
// Max age: don't verify claims older than this (stale)
const MAX_CLAIM_AGE_HOURS = 24;

function loadVerifyState() {
  try {
    const s = JSON.parse(fs.readFileSync(VERIFY_PATH, 'utf8'));
    // Ensure all arrays exist (old state files may lack them)
    if (!Array.isArray(s.pending)) s.pending = [];
    if (!Array.isArray(s.verified)) s.verified = [];
    if (!Array.isArray(s.failed)) s.failed = [];
    if (!Array.isArray(s.unverifiable)) s.unverifiable = [];
    return s;
  }
  catch { return { pending: [], verified: [], failed: [], unverifiable: [] }; }
}

function saveVerifyState(s) {
  fs.writeFileSync(VERIFY_PATH, JSON.stringify(s, null, 2));
}

// A claim with no externally checkable artifact can never be verified by
// this verifier. Length and advisory keywords describe prose, not an
// outcome in an external system. The neutral terminal disposition is
// "unverifiable": no health credit and no health blame.
function dispositionForArtifactlessClaim(_responseText) {
  return 'unverifiable';
}

function updateHealthForVerification(agentId, verified) {
  try {
    let health = {};
    try { health = JSON.parse(fs.readFileSync(HEALTH_PATH, 'utf8')); } catch {}
    if (!health[agentId]) return;
    const h = health[agentId];
    if (verified) {
      h.verifiedDeliveries = (h.verifiedDeliveries || 0) + 1;
    } else {
      h.failedVerifications = (h.failedVerifications || 0) + 1;
      h.consecutiveFailures = (h.consecutiveFailures || 0) + 1;
      if (h.consecutiveFailures >= 3) h.status = 'failing';
    }
    h.lastVerified = new Date().toISOString();
    fs.writeFileSync(HEALTH_PATH, JSON.stringify(health, null, 2));
  } catch (e) {
    console.error(`[verify] Health update failed:`, e.message);
  }
}

// Extract verifiable artifacts from a directive result
function extractArtifacts(result, directiveText) {
  const artifacts = [];
  const text = `${result?.response || ''} ${result?.evidence || ''} ${directiveText || ''}`;

  // URLs (excluding common non-delivery URLs)
  const urlRegex = /https?:\/\/[^\s<>"']+/g;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0].replace(/[.,;!?)]+$/, ''); // trim trailing punctuation
    // Skip Slack, Vikunja internal, and example URLs
    if (/slack\.com|127\.0\.0\.1|localhost|example\.com/i.test(url)) continue;
    artifacts.push({ type: 'url', value: url });
  }

  // X/Twitter post IDs (15-20 digit numbers)
  const idRegex = /\b(\d{15,20})\b/g;
  while ((match = idRegex.exec(text)) !== null) {
    artifacts.push({ type: 'x_post_id', value: match[1] });
  }

  // Vikunja task references (#123)
  const taskRegex = /#(\d{2,5})\b/g;
  while ((match = taskRegex.exec(text)) !== null) {
    const taskId = parseInt(match[1]);
    if (taskId > 10) artifacts.push({ type: 'vikunja_task', value: taskId });
  }

  // Deduplicate
  const seen = new Set();
  return artifacts.filter(a => {
    const key = `${a.type}:${a.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function verifyUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'MACF-verify/1.0' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    // 2xx or 3xx = exists. 4xx/5xx = broken.
    const ok = res.status < 400;
    return { ok, detail: `HTTP ${res.status}` };
  } catch (e) {
    // HEAD failed, try GET (some servers block HEAD)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'MACF-verify/1.0' },
        redirect: 'follow',
      });
      clearTimeout(timeout);
      const ok = res.status < 400;
      // Don't download the body
      if (res.body) res.body.cancel().catch(() => {});
      return { ok, detail: `HTTP ${res.status} (GET fallback)` };
    } catch (e2) {
      return { ok: false, detail: `Unreachable: ${e2.message.slice(0, 80)}` };
    }
  }
}

async function verifyXPostId(postId) {
  // Try X API v2 (needs bearer token)
  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) {
    return { ok: null, detail: 'No X API token — cannot verify (skipped)' };
  }
  try {
    const res = await fetch(`https://api.x.com/2/tweets/${postId}`, {
      headers: { 'Authorization': `Bearer ${bearer}` },
    });
    if (res.status === 200) {
      return { ok: true, detail: 'Post exists via X API' };
    } else if (res.status === 404) {
      return { ok: false, detail: 'Post NOT FOUND via X API' };
    } else {
      return { ok: null, detail: `X API returned ${res.status} — inconclusive` };
    }
  } catch (e) {
    return { ok: null, detail: `X API error: ${e.message.slice(0, 60)}` };
  }
}

async function verifyVikunjaTask(taskId) {
  const token = process.env.VIKUNJA_TOKEN;
  const base = process.env.VIKUNJA_URL || 'http://127.0.0.1:3456';
  if (!token) {
    return { ok: null, detail: 'No Vikunja token — cannot verify (skipped)' };
  }
  try {
    const res = await fetch(`${base}/api/v1/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      return { ok: false, detail: `Task #${taskId} not found (HTTP ${res.status})` };
    }
    const task = await res.json();
    // Check for substantive update (not just auto-touch comments)
    // A task with only "Directive:" comments and no real progress = not delivered
    const commentsRes = await fetch(`${base}/api/v1/tasks/${taskId}/comments`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    let hasSubstantiveUpdate = false;
    if (commentsRes.ok) {
      const comments = await commentsRes.json();
      hasSubstantiveUpdate = comments.some(c => {
        const text = (c.comment || '').toLowerCase();
        // Substantive = mentions completion, evidence, or specific outcome
        // Not substantive = just "Directive:" log or "auto-linked"
        return /completed|delivered|shipped|published|done|verified|http/i.test(text) &&
               !/^(\[directive|\[self-healer)/i.test(text.trim());
      });
    }
    return {
      ok: task.done || hasSubstantiveUpdate,
      detail: task.done
        ? `Task #${taskId} marked done`
        : hasSubstantiveUpdate
          ? `Task #${taskId} has substantive progress comments`
          : `Task #${taskId} exists but no substantive progress`,
    };
  } catch (e) {
    return { ok: null, detail: `Vikunja API error: ${e.message.slice(0, 60)}` };
  }
}

async function verifyArtifact(artifact) {
  switch (artifact.type) {
    case 'url': return verifyUrl(artifact.value);
    case 'x_post_id': return verifyXPostId(artifact.value);
    case 'vikunja_task': return verifyVikunjaTask(artifact.value);
    default: return { ok: null, detail: 'Unknown artifact type' };
  }
}

async function main() {
  console.log('[verify] Starting external outcome verification...');
  const state = loadVerifyState();
  const now = Date.now();

  // Clean up stale claims
  const maxAgeMs = MAX_CLAIM_AGE_HOURS * 3600 * 1000;
  state.pending = state.pending.filter(p => (now - p.timestamp) < maxAgeMs);

  let verifiedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  const stillPending = [];
  for (const claim of state.pending) {
    const ageMin = (now - claim.timestamp) / 60000;

    // Not yet due for verification
    if (ageMin < VERIFY_AFTER_MIN) {
      stillPending.push(claim);
      continue;
    }

    console.log(`[verify] Checking claim: ${claim.verifier || 'direct'} (${claim.agentId})`);

    // Extract artifacts from the claim
    const artifacts = extractArtifacts(
      { response: claim.response, evidence: claim.evidence },
      claim.directive
    );

    if (artifacts.length === 0) {
      // No external artifacts means there is nothing this verifier can
      // check. Advisory prose may be the deliverable, but its word count
      // and keywords do not verify an external outcome. Record a neutral
      // terminal disposition instead of manufacturing a verification.
      const responseText = `${claim.response || ''} ${claim.evidence || ''}`.trim();
      const disposition = dispositionForArtifactlessClaim(responseText);
      console.log(`[verify] No verifiable artifacts in claim — marking as ${disposition}`);
      state.unverifiable.push({
        ...claim,
        verifiedAt: new Date().toISOString(),
        reason: 'no_verifiable_artifacts',
        detail: 'Agent provided no URLs, post IDs, task refs, or other externally checkable artifacts',
      });
      skippedCount++;
      continue;
    }

    // Verify each artifact
    let allOk = true;
    let anyConclusive = false;
    const results = [];
    for (const artifact of artifacts.slice(0, 5)) { // Max 5 per claim
      const result = await verifyArtifact(artifact);
      results.push({ artifact, ...result });
      if (result.ok === true) anyConclusive = true;
      if (result.ok === false) { allOk = false; anyConclusive = true; }
      console.log(`[verify]   ${artifact.type}:${String(artifact.value).slice(0, 40)} → ${result.ok === true ? '✅' : result.ok === false ? '❌' : '⏭️'} ${result.detail}`);
    }

    if (!anyConclusive) {
      console.log(`[verify] All artifacts inconclusive — keeping pending for next cycle`);
      stillPending.push(claim);
      skippedCount++;
      continue;
    }

    if (allOk) {
      console.log(`[verify] ✅ VERIFIED: ${claim.agentId} delivery confirmed externally`);
      state.verified.push({
        ...claim,
        verifiedAt: new Date().toISOString(),
        artifacts: results,
      });
      updateHealthForVerification(claim.agentId, true);
      verifiedCount++;
    } else {
      console.log(`[verify] ❌ FAILED: ${claim.agentId} claimed artifacts do not exist externally`);
      state.failed.push({
        ...claim,
        verifiedAt: new Date().toISOString(),
        artifacts: results,
        reason: 'artifact_verification_failed',
      });
      updateHealthForVerification(claim.agentId, false);
      failedCount++;
    }
  }

  state.pending = stillPending;

  // Keep history bounded
  if (state.verified.length > 100) state.verified = state.verified.slice(-100);
  if (state.failed.length > 100) state.failed = state.failed.slice(-100);
  if (state.unverifiable.length > 100) state.unverifiable = state.unverifiable.slice(-100);

  saveVerifyState(state);
  console.log(`[verify] Done: ${verifiedCount} verified, ${failedCount} failed, ${skippedCount} inconclusive, ${stillPending.length} still pending`);
}

module.exports = { dispositionForArtifactlessClaim };

if (require.main === module) {
  main().then(() => process.exit(0))
    .catch(e => { console.error('[verify] Fatal:', e.message); process.exit(1); });
}
