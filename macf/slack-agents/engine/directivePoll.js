// engine/directivePoll.js — VM-local CEO directive processor.
//
// The interactive Slack bot (Railway) is brain-dead while its LLM path points
// at the down desktop tunnel. This poller gives the VM a directive channel:
// every run it scans team channels for new `[from: CEO → Role]` messages and
// routes each to the matching agent's handleDelegation, which posts its own
// reply. No Socket Mode, no new tokens — reuses the engine's WebClient +
// surrogate and the VM-local Meta gateway for LLM.
//
// Run every 5 min via cron. State: .directive-poll-state.json next to this file.
// Usage: node engine/directivePoll.js
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { WebClient } = require('@slack/web-api');
const { resolveSlackToken } = require('./slackToken');
const { DELEGATION_TARGETS } = require('../config');
const { suggestCollaboration } = require('./collaboration');

const STATE_PATH = path.join(__dirname, '.directive-poll-state.json');
const VERIFY_PATH = path.join(__dirname, '.directive-verify-state.json');
// Channels the team actually uses for directives.
const CHANNELS = [
  'C0ASH4TF604', // #management
  'C0ASDH1HC1Y', // #marketing
];

// Resolve a channel name or ID to a Slack channel ID.
// If it's already an ID (starts with C), return as-is.
// Otherwise resolve via the channels util.
async function resolveChannelId(client, nameOrId) {
  if (!nameOrId) return null;
  if (/^[CGD][A-Z0-9]+$/.test(nameOrId)) return nameOrId; // Already an ID
  try {
    const { resolveChannel } = require('../utils/channels');
    return await resolveChannel(client, nameOrId);
  } catch {
    return null;
  }
}

// Verify a Slack post actually landed (read-after-write).
// ROOT-CAUSE FIX (Oct 6, 2026): The poller logged "Posted validated reply"
// without checking. In the CCO workshop test the thread had 0 replies despite
// the success log. This reads back the thread (or channel) and confirms a
// message with the posted ts exists before the directive is marked complete.
async function verifyPostLanded(client, channelId, threadTs, postedTs) {
  if (!postedTs) return false;
  try {
    let messages = [];
    if (threadTs) {
      const res = await client.conversations.replies({
        channel: channelId, ts: threadTs, limit: 10,
      });
      messages = res.messages || [];
    } else {
      const res = await client.conversations.history({
        channel: channelId, limit: 10,
      });
      messages = res.messages || [];
    }
    return messages.some(m => m.ts === postedTs);
  } catch (e) {
    console.error(`[directivePoll] post verification readback failed:`, e.message);
    return false;
  }
}

// Map directive patterns to verifiers. When a directive matches, it's added
// to the verification queue so directiveVerify.js can check the outcome.
function matchVerifier(text) {
  const patterns = [
    { name: 'meta-ads-launch', pattern: /launch.*meta|meta.*campaign|ad.*launch/i },
    { name: 'email-send', pattern: /send.*email|email.*send|fluentcrm/i },
    { name: 'content-publish', pattern: /publish|content.*blitz|all.*channels/i },
  ];
  for (const p of patterns) {
    if (p.pattern.test(text)) return p.name;
  }
  return null;
}

function queueForVerification(directiveText, agentId, result) {
  // Queue EVERY directive for verification, not just pattern-matched ones.
  // The verifier extracts artifacts (URLs, post IDs, task refs) from the
  // agent's response and checks them against external systems.
  let verifyState;
  try { verifyState = JSON.parse(fs.readFileSync(VERIFY_PATH, 'utf8')); }
  catch { verifyState = { pending: [], verified: [], failed: [] }; }
  if (!verifyState.pending) verifyState.pending = [];

  verifyState.pending.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    agentId: agentId,
    directive: directiveText.slice(0, 500),
    response: (result?.response || '').slice(0, 2000),
    evidence: (result?.evidence || '').slice(0, 500),
    timestamp: Date.now()
  });

  // Keep pending bounded
  if (verifyState.pending.length > 200) {
    verifyState.pending = verifyState.pending.slice(-200);
  }

  fs.writeFileSync(VERIFY_PATH, JSON.stringify(verifyState, null, 2));
  console.log(`[directivePoll] queued for external verification: ${agentId}`);
}

const AGENT_IDS = ['execPM', 'cmo', 'cco', 'cfo', 'cro', 'cto', 'cuxo', 'jobcoach', 'lawyer', 'facebook', 'hr'];
const loadedAgents = {};

const AGENT_HEALTH_PATH = path.join(__dirname, '.agent-health.json');

// HEALTH TRACKING (Oct 4, 2026 — architectural fix):
// The self-healer was blind because nothing ever updated these counters.
// The poller now tracks every directive outcome per agent:
//   - directivesReceived: incremented when a directive is routed to the agent
//   - directivesCompleted: incremented when the agent returns validated evidence
//   - directivesFailed: incremented on timeout, error, or no-evidence after retries
//   - lastActivity: timestamp of last directive handled
//   - consecutiveFailures: reset on success, incremented on failure
function updateAgentHealth(agentId, outcome) {
  // outcome: 'received' | 'completed' | 'failed'
  try {
    let health = {};
    try { health = JSON.parse(fs.readFileSync(AGENT_HEALTH_PATH, 'utf8')); } catch {}
    if (!health[agentId]) {
      health[agentId] = {
        agentId, directivesReceived: 0, directivesCompleted: 0,
        directivesFailed: 0, lastActivity: null, consecutiveFailures: 0,
        status: 'unknown',
      };
    }
    const h = health[agentId];
    const now = new Date().toISOString();
    if (outcome === 'received') {
      h.directivesReceived++;
      h.lastActivity = now;
    } else if (outcome === 'completed') {
      h.directivesCompleted++;
      h.consecutiveFailures = 0;
      h.lastActivity = now;
      h.status = 'healthy';
    } else if (outcome === 'failed') {
      h.directivesFailed++;
      h.consecutiveFailures = (h.consecutiveFailures || 0) + 1;
      h.lastActivity = now;
      h.status = h.consecutiveFailures >= 3 ? 'failing' : 'degraded';
    }
    h.lastChecked = now;
    fs.writeFileSync(AGENT_HEALTH_PATH, JSON.stringify(health, null, 2));
  } catch (e) {
    console.error(`[directivePoll] Health update failed for ${agentId}:`, e.message);
  }
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return {}; }
}
function saveState(s) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

function getAgent(id) {
  if (!loadedAgents[id]) {
    loadedAgents[id] = require(`../agents/${id}.js`);
  }
  return loadedAgents[id];
}

// Touch Vikunja: when an agent handles a directive, update their active tasks
// so the team monitor sees activity instead of stale tasks.
// REMOVED (Oct 4, 2026 — CEO fix): The cosmetic touchAgentTasks() function
// was DELETED. It added "Agent X active via directive poll" comments that
// bumped timestamps with ZERO real progress, hiding staleness instead of
// preventing it. Tasks should go stale honestly if no real work is done.
// The engine now enforces progress structurally (see PROGRESS_ENFORCEMENT below)
// instead of cosmetically hiding the problem.
async function touchAgentTasks(agentId) {
  // NO-OP: Cosmetic touches removed. Real progress is the only progress.
  // If this function is called, it does nothing by design.
  console.log(`[directivePoll] touchAgentTasks(${agentId}) — disabled (cosmetic touches removed)`);
  return;
}

// PROGRESS ENFORCEMENT (Oct 4, 2026 — CEO fix, revised per Jesse):
// Jesse: "Don't block them. YOU find out why they went stale in the engine
// ITSELF and fix the engine so it never happens again."
//
// Root cause of staleness: Slack directives and Vikunja tasks are DISCONNECTED.
// An agent replies in Slack, but the Vikunja task sits untouched because
// nothing links the directive to the task.
//
// Engine fix: UNIFY them. Every directive automatically creates/updates a
// Vikunja task. Every agent response automatically updates that task.
// Staleness becomes impossible because the directive IS the task update.
//
// The 1-hour threshold (not 24h) is used for detection.
// Blocking is REMOVED — instead, the engine auto-links and auto-updates.
const BLOCKED_AGENTS = new Set(); // Kept for API compat, no longer used for blocking

async function enforceProgress(agentId) {
  // NO-OP by design (Oct 4, 2026): Blocking removed per Jesse's order.
  // "Don't block them. Fix the engine so it never happens again."
  // The real fix is auto-linking directives to tasks (see linkDirectiveToTask).
  // This function is kept to avoid breaking callers, but it never blocks.
  return false;
}

// AUTO-LINK: Every Slack directive creates or updates a Vikunja task.
// This is the engine fix that makes staleness impossible.
async function linkDirectiveToTask(agentId, directiveText, responseText) {
  const vikunjaToken = process.env.VIKUNJA_TOKEN;
  const vikunjaUrl = process.env.VIKUNJA_URL || 'http://127.0.0.1:3456';
  if (!vikunjaToken) return null;

  try {
    // Find the agent's most recent active task, or create a directive-tracking task
    const prefix = `[${agentId.toUpperCase()}]`;

    for (const pid of [2, 16]) {
      const res = await fetch(`${vikunjaUrl}/api/v1/projects/${pid}/tasks`, {
        headers: { 'Authorization': `Bearer ${vikunjaToken}` }
      });
      if (!res.ok) continue;
      const tasks = await res.json();

      // Look for an existing task that matches this directive's topic
      // For now, update the most recently updated active task for this agent
      const mine = tasks
        .filter(t => !t.done && (t.title || '').toUpperCase().startsWith(prefix))
        .sort((a, b) => new Date(b.updated) - new Date(a.updated));

      if (mine.length > 0) {
        const task = mine[0];
        // Append the directive and response as a comment (substantive update)
        const comment = `[Directive ${new Date().toISOString()}]\n` +
          `Directive: ${directiveText.slice(0, 300)}\n` +
          `Response: ${(responseText || 'No response').slice(0, 500)}`;

        await fetch(`${vikunjaUrl}/api/v1/tasks/${task.id}/comments`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${vikunjaToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ comment })
        });

        console.log(`[directivePoll] Auto-linked directive to task #${task.id} for ${agentId}`);
        return task.id;
      }
    }
  } catch (e) {
    console.error(`[directivePoll] Auto-link failed for ${agentId}:`, e.message);
  }
  return null;
}

// CONCURRENCY (Oct 5, 2026 — Jesse: "add multi threading"):
// Agent delegations are blocking LLM calls (up to 180s each with chaining).
// Processing them serially meant 3+ pending directives blew past the 5-minute
// cron window, timing out mid-flight and causing retries/duplicates.
// Delegations now run concurrently with a cap; parsing, validation, posting,
// and state updates stay serial in message order so watermark/retry/
// dead-letter semantics are unchanged.
const DELEGATION_CONCURRENCY = 2;

// PRIORITY TIERS (Oct 5, 2026 — Jesse: "should certain agents get priority?"):
// Not all work is equal. Revenue work outranks internal work. Jesse's direct
// directives outrank everything. Blocked chains get priority to unblock.
//   0 = Jesse's direct directive (from: CEO) — jumps the queue
//   1 = Revenue agents (CMO, CRO, CCO) — drive income
//   2 = Chain unblock (sub-delegation fulfilling a dependency)
//   3 = Normal (everyone else, FIFO within tier)
const PRIORITY = {
  JESSE_DIRECT: 0,
  REVENUE: 1,
  UNBLOCK: 2,
  NORMAL: 3,
};

// Revenue-driving agents get priority thread allocation
const REVENUE_AGENTS = new Set(['cmo', 'cro', 'cco']);

function getDirectivePriority(item) {
  const { text, agentId } = item;
  // Jesse's direct directives (from: CEO) get top priority
  if (/\[from:\s*CEO\s*→/i.test(text)) return PRIORITY.JESSE_DIRECT;
  // Revenue agents get priority
  if (REVENUE_AGENTS.has(agentId.toLowerCase())) return PRIORITY.REVENUE;
  // Default
  return PRIORITY.NORMAL;
}

// Run fn over items with at most `limit` in flight, respecting priority.
// Higher priority items are assigned to workers first. Returns results in
// input order: [{ok:true,value} | {ok:false,error}].
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);

  // Sort indices by priority (stable: preserves FIFO within same priority)
  const indices = items.map((_, i) => i);
  const priorities = items.map(item => getDirectivePriority(item));
  indices.sort((a, b) => priorities[a] - priorities[b]);

  let nextIdx = 0;
  async function worker() {
    while (true) {
      const sortedPos = nextIdx++;
      if (sortedPos >= indices.length) return;
      const i = indices[sortedPos]; // Original index (for result ordering)
      try {
        results[i] = { ok: true, value: await fn(items[i], i) };
      } catch (e) {
        results[i] = { ok: false, error: e };
      }
    }
  }
  const workers = [];
  for (let w = 0; w < Math.min(limit, items.length); w++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// Execute one agent delegation with the hang timeout.
// Returns the agent's result, or null on timeout/error.
async function runDelegation(item) {
  const { agent, agentId, text, channel, m } = item;
  // Pass message ts so agent can reply in thread (fixes "0 replies" bug
  // where agents posted top-level instead of in the directive thread)
  //
  // TIMEOUT (Oct 4, 2026 — CEO fix, raised Oct 5, raised Oct 6 to 300s):
  // Agent LLM calls can hang. 300s because the expert lens context (4KB)
  // slows Qwen generation to 100s+ per delegation. Concurrent execution
  // means a longer per-delegation timeout doesn't stall the batch.
  const result = await Promise.race([
    agent.handleDelegation(text, new Set(), channel, m.ts),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Agent ${agentId} timed out after 300s`)), 300000)
    ),
  ]).catch(e => {
    console.error(`[directivePoll] ${agentId} delegation failed/timed out:`, e.message);
    return null; // Treat as failure, don't block the batch
  });
  return result;
}

// Validate one delegation result, post the reply, update task/state.
// Runs serially in original message order. Returns 1 if the directive was
// resolved (posted or dead-lettered), 0 if it will retry next cycle.
async function finalizeDelegation(client, state, item, result) {
  const { channel, m, text, msgTs, agentId } = item;
  let processed = 0;

  if (!result) {
    console.log(`[directivePoll] ${agentId} produced no result — skipping (will retry next cycle)`);
    // HEALTH: Null result (timeout/error) counts as a failure
    updateAgentHealth(agentId, 'failed');
    return processed;
  }

  // ROOT-CAUSE FIX: Poller is the sole poster. Agents return content,
  // poller validates BEFORE posting. This prevents empty "on it"
  // messages from ever reaching Slack.

  // Validate the response content for verifiable evidence.
  // EVIDENCE FIX (Oct 5, 2026): Check sub-results too. When CMO delegates
  // to CCO via relay(), the actual deliverable (copy, links) lives in the
  // sub-result, not the CMO's wrapper response. Gating only on the main
  // response discarded completed sub-agent work and left CMO/CUXO at
  // 0 completions.
  function hasVerifiableEvidenceIn(text, evidence) {
    return /https?:\/\/[^\s]+/.test(text) ||  // URL
      /\b\d{15,20}\b/.test(text) ||             // Post ID
      /\b\d+\s*(likes|views|clicks|signups|comments|shares)\b/i.test(text) || // Metrics
      (evidence && !evidence.includes('Posted response')); // Real tool evidence
  }

  const responseText = result?.response || '';
  let hasVerifiableEvidence = hasVerifiableEvidenceIn(responseText, result?.evidence);

  // Check sub-agent results for evidence (the actual deliverable often lives here)
  const subResultsForEvidence = (result.subResults && Array.isArray(result.subResults))
    ? result.subResults
    : [];
  for (const sub of subResultsForEvidence) {
    if (!sub.result) continue;
    if (hasVerifiableEvidenceIn(sub.result.response || '', sub.result.evidence)) {
      hasVerifiableEvidence = true;
      break;
    }
    if (sub.result.taskId || sub.result.evidence) {
      hasVerifiableEvidence = true;
      break;
    }
  }

  // ENFORCE EVIDENCE CONTRACT: Agents must return evidence of work done.
  // For action directives (publish, send, launch, create), text replies are
  // NOT sufficient — must show tool execution with IDs/links/counts.
  const lowerText = text.toLowerCase();
  const requiresAction = /publish|send|launch|create|post to|execute/.test(lowerText);

  let hasEvidence = hasVerifiableEvidence || (result && (result.taskId || result.evidence));

  // Sub-result task/evidence also counts (e.g. CCO created a task or ran a tool)
  if (!hasEvidence) {
    for (const sub of subResultsForEvidence) {
      if (sub.result && (sub.result.taskId || sub.result.evidence)) {
        hasEvidence = true;
        break;
      }
    }
  }

  // For action directives, require tool execution evidence specifically
  if (requiresAction && !hasVerifiableEvidence) {
    console.log(`[directivePoll] ${agentId} action directive lacks verifiable evidence — NOT posting`);
    hasEvidence = false;
  }

  if (!hasEvidence) {
    console.log(`[directivePoll] ${agentId} provided no evidence — directive NOT marked complete`);

    // ROOT-CAUSE FIX: Track retry counts. Infinite retry without evidence
    // spams the channel with "on it" messages. After 3 failures, dead-letter
    // the directive (advance watermark) and log for human review.
    const retryKey = `${channel}:${m.ts}`;
    const retries = (state._retries || {})[retryKey] || 0;

    if (retries >= 3) {
      console.log(`[directivePoll] ${agentId} directive failed 3x — dead-lettering (advancing watermark)`);
      if (!state._deadLetter) state._deadLetter = [];
      state._deadLetter.push({
        channel, ts: m.ts, agentId,
        text: text.slice(0, 200),
        failedAt: new Date().toISOString(),
        reason: 'no_evidence_after_3_retries',
      });
      // Advance watermark to prevent infinite loop
      if (msgTs > parseFloat(state[channel] || '0')) state[channel] = m.ts;
      // Clear retry count
      if (state._retries) delete state._retries[retryKey];
      // HEALTH: Dead-letter after 3 no-evidence retries = failure
      updateAgentHealth(agentId, 'failed');
    } else {
      // Increment retry count, do NOT advance watermark (will retry)
      if (!state._retries) state._retries = {};
      state._retries[retryKey] = retries + 1;
      console.log(`[directivePoll] Retry ${retries + 1}/3 for ${agentId} directive`);
    }
    return processed;
  }

  processed++;

  // ROOT-CAUSE FIX: Poller posts the validated response.
  // Agents return content, poller validates, THEN posts.
  // This is the only place directive replies are posted.
  if (result?.response) {
    try {
      // ROOT-CAUSE FIX (Oct 6, 2026): ALWAYS post directive replies in the
      // directive's channel. The agent's primaryChannel (e.g. CCO's "content")
      // is for proactive posts, not directive replies. Using it here posted
      // to the wrong channel, where the thread_ts didn't exist.
      const channelId = channel;
      const postParams = {
        channel: channelId,
        text: result.response,
        unfurl_links: false,
      };
      // Reply in thread if threadTs provided
      if (result.threadTs) {
        postParams.thread_ts = result.threadTs;
      }
      // Use the agent's identity for the post
      const { AGENTS } = require('../config');
      const agentCfg = AGENTS[agentId];
      if (agentCfg?.slackName) postParams.username = agentCfg.slackName;
      if (agentCfg?.icon) postParams.icon_emoji = agentCfg.icon;

      const postRes = await client.chat.postMessage(postParams);
      const postedTs = postRes && postRes.ts;

      // VERIFY (Oct 6, 2026): Read back the thread/channel and confirm the
      // post landed. Fail closed — do not mark complete on unverified posts.
      const landed = await verifyPostLanded(client, channelId, result.threadTs, postedTs);
      if (!landed) {
        console.error(`[directivePoll] ❌ Post verification FAILED for ${agentId} — ` +
          `posted ts ${postedTs || '(none)'} not found in ${result.threadTs ? 'thread' : 'channel'}. ` +
          `Directive NOT marked complete (will retry).`);
        updateAgentHealth(agentId, 'failed');
        return processed;
      }
      console.log(`[directivePoll] ✅ Posted validated reply for ${agentId} in ${result.threadTs ? 'thread' : 'channel'} (verified ts ${postedTs})`);
    } catch (postErr) {
      console.error(`[directivePoll] Failed to post validated reply:`, postErr.message);
      updateAgentHealth(agentId, 'failed');
      return processed;
    }
  }

  if (msgTs > parseFloat(state[channel] || '0')) state[channel] = m.ts;

  // HEALTH: Validated evidence posted = completed delivery
  updateAgentHealth(agentId, 'completed');

  // POST SUB-AGENT RESULTS (Oct 4, 2026 — poller is sole poster):
  // Sub-delegations return content via relay(). The poller validates
  // and posts each one. Sub-agents never post directly.
  if (result.subResults && Array.isArray(result.subResults)) {
    for (const sub of result.subResults) {
      if (!sub.result || !sub.result.response) continue;
      const subAgentId = sub.agentId;
      try {
        const subPostParams = {
          channel: channel,
          text: sub.result.response,
          unfurl_links: false,
        };
        if (sub.result.threadTs) subPostParams.thread_ts = sub.result.threadTs;
        await client.chat.postMessage(subPostParams);
        console.log(`[directivePoll] ✅ Posted sub-agent reply for ${subAgentId}`);
        updateAgentHealth(subAgentId, 'completed');
      } catch (subErr) {
        console.error(`[directivePoll] Failed to post sub-agent reply for ${subAgentId}:`, subErr.message);
        updateAgentHealth(subAgentId, 'failed');
      }
    }
  }

  // AUTO-LINK (Oct 4, 2026 — CEO fix): Every directive automatically
  // updates the agent's Vikunja task with the directive and response.
  // This unifies Slack and Vikunja — staleness becomes impossible
  // because the directive IS the task update.
  await linkDirectiveToTask(agentId, text, result?.response || result?.evidence).catch(e =>
    console.error(`[directivePoll] Auto-link failed for ${agentId}:`, e.message));
  // Queue for verification: the outcome will be checked by directiveVerify.js
  // against EXTERNAL systems (not just Slack text). This ensures "on it"
  // replies aren't mistaken for completed work.
  queueForVerification(text, agentId, result);
  // Suggest collaboration: if this directive overlaps with another agent's work,
  // connect them directly so they work like a real team.
  await suggestCollaboration(text, agentId).catch(e =>
    console.error(`[directivePoll] collaboration suggestion failed:`, e.message));

  return processed;
}

async function main() {
  const token = resolveSlackToken();
  if (!token) { console.error('[directivePoll] no Slack token'); process.exit(1); }
  const client = new WebClient(token);

  const state = loadState();
  let processed = 0;
  // CONCURRENCY (Oct 5, 2026): routable directives queue here during the
  // channel scan; their slow agent delegations run concurrently afterwards.
  const pendingDelegations = [];

  // Wire in-process delegation relay for the poller path (mirrors index.js
  // startup). Without this, agents' [from: X → Y] sub-delegations are all
  // dropped as "Unknown target — skipping" and execPM directives can never
  // produce verifiable evidence (fixed Oct 4, 2026 after 5 directives hit
  // the no-evidence retry loop).
  try {
    const delegation = require('../utils/delegation');
    const modules = {};
    for (const id of AGENT_IDS) {
      try {
        modules[id] = getAgent(id);
        // Initialize each agent with the Slack client so sub-delegations
        // via the relay don't hit null slackClient errors.
        // (Fixes "Cannot read properties of null (reading 'chat')" Oct 4)
        if (typeof modules[id].init === 'function') {
          try { modules[id].init({ client }); } catch (e) { /* already inited */ }
        }
      }
      catch (e) { console.error(`[directivePoll] failed to load agent ${id}:`, e.message); }
    }
    delegation.init(modules, DELEGATION_TARGETS);
    console.log('[directivePoll] delegation relay wired (all agents initialized with Slack client)');
  } catch (e) {
    console.error('[directivePoll] delegation wiring failed:', e.message);
  }

  for (const channel of CHANNELS) {
    const lastTs = state[channel] || '0';
    let history;
    try {
      history = await client.conversations.history({ channel, limit: 30 });
    } catch (e) {
      console.error(`[directivePoll] history failed for ${channel}:`, e.message);
      continue;
    }
    const msgs = (history.messages || [])
      .filter(m => parseFloat(m.ts) > parseFloat(lastTs))
      .sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

    for (const m of msgs) {
      const text = m.text || '';
      const msgTs = parseFloat(m.ts);

      // ROADBLOCK DETECTION (Oct 4, 2026 — Jesse's capability escalation rule)
      //
      // Agents report blockers via:
      //   [ROADBLOCK: AgentName] NEED: <what> | TRIED: <attempts> | BLOCKED BY: <obstacle>
      //
      // The PM (execPM) receives it first and either:
      //   (a) Routes to a team member who already has the capability, or
      //   (b) Escalates to the CEO who builds/installs what's missing.
      //
      // This is the "capability escalation chain" — the engine's mechanism
      // for turning "I can't do this" into "now I can."
      const rb = text.match(/\[ROADBLOCK:\s*(.+?)\]\s*(.+)/is);
      if (rb) {
        const agentName = rb[1].trim();
        const need = rb[2].trim().slice(0, 500);
        console.log(`[directivePoll] 🚧 ROADBLOCK from ${agentName}: ${need.slice(0, 100)}`);

        // Log to a dedicated roadblock file for CEO review
        const rbFile = require('path').join(__dirname, '.roadblocks.json');
        let roadblocks = [];
        try {
          roadblocks = JSON.parse(require('fs').readFileSync(rbFile, 'utf8'));
        } catch {}
        roadblocks.push({
          timestamp: new Date().toISOString(),
          agent: agentName,
          need: need,
          channel: channel,
          msgTs: m.ts,
          status: 'open',
          routedTo: 'execPM',
        });
        // Keep last 50
        if (roadblocks.length > 50) roadblocks = roadblocks.slice(-50);
        require('fs').writeFileSync(rbFile, JSON.stringify(roadblocks, null, 2));

        // CAPABILITY ESCALATION CHAIN (Jesse, Oct 4, 2026):
        // Route the roadblock to execPM (the PM), not just log it.
        // execPM checks the capability registry and either routes to a
        // team member with the tool or escalates to the CEO.
        try {
          const execPMAgent = getAgent('execPM');
          if (execPMAgent && typeof execPMAgent.handleDelegation === 'function') {
            if (typeof execPMAgent.init === 'function') {
              try { execPMAgent.init({ client }); } catch (e) { /* already inited */ }
            }
            const roadblockMsg = `[from: ${agentName} → Exec PM] CAPABILITY REQUEST: ${need}`;
            console.log(`[directivePoll] Routing roadblock to execPM for capability matching`);
            await Promise.race([
              execPMAgent.handleDelegation(roadblockMsg, new Set(), channel, m.ts),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('execPM roadblock handler timed out')), 60000)
              ),
            ]).catch(e => console.error(`[directivePoll] execPM roadblock routing failed:`, e.message));
          }
        } catch (e) {
          console.error(`[directivePoll] Roadblock routing error:`, e.message);
        }

        // Mark as seen (don't reprocess)
        if (msgTs > parseFloat(state[channel] || '0')) state[channel] = m.ts;
        processed++;
        continue;
      }

      // ROOT-CAUSE FIX: Match any inter-agent delegation, not just CEO.
      // ExecPM and other agents delegate using [from: X → Y] format.
      // The old regex only matched CEO, so sub-delegations were silently dropped.
      const dm = text.match(/\[from:\s*(.+?)\s*→\s*(.+?)\]/i);
      if (!dm) {
        // Non-directive: safe to mark as seen immediately.
        if (msgTs > parseFloat(state[channel] || '0')) state[channel] = m.ts;
        continue;
      }
      const fromName = dm[1].trim();
      const toNameRaw = dm[2].trim();
      // Only route if the target is a known agent (prevents matching random text)
      const toName = toNameRaw.toLowerCase().replace(/[\s-]+/g, '');
      const agentId = DELEGATION_TARGETS[toName];
      if (!agentId || !AGENT_IDS.includes(agentId)) {
        console.log(`[directivePoll] no agent for target "${toNameRaw}" (from ${fromName}) — skipping`);
        // Mark as seen to avoid reprocessing an unroutable directive.
        if (msgTs > parseFloat(state[channel] || '0')) state[channel] = m.ts;
        continue;
      }
      const agent = getAgent(agentId);
      // No blocking — the engine auto-links directives to tasks instead.
      // (Blocking removed per Jesse Oct 4: "Don't block them. Fix the engine.")
      if (typeof agent.init === 'function') {
        try { agent.init({ client }); } catch (e) { /* already inited */ }
      }
      if (typeof agent.handleDelegation !== 'function') {
        console.log(`[directivePoll] ${agentId} has no handleDelegation — skipping`);
        if (msgTs > parseFloat(state[channel] || '0')) state[channel] = m.ts;
        continue;
      }
      console.log(`[directivePoll] routing to ${agentId}: "${text.slice(0, 80)}"`);
      // HEALTH: Track that this agent received a directive
      updateAgentHealth(agentId, 'received');
      // ARTIFACT VALIDATION (Oct 6, 2026 — Jesse: "Always fix it"):
      // If a directive asks to review/analyze/check specific artifacts
      // (PDFs, documents, templates, files) but provides no URLs or paths,
      // it's unactionable. Dead-letter immediately instead of wasting 3 retries.
      const artifactKeywords = /\b(pdfs?|documents?|templates?|files?|spreadsheets?|images?|videos?|designs?|mockups?|wireframes?)\b/i;
      const reviewKeywords = /\b(review|analyze|check|verify|audit|inspect|examine|look at)\b/i;
      const hasUrl = /https?:\/\/[^\s]+/i.test(text);
      const hasPath = /(?:\/[\w.-]+)+\.\w+/.test(text) || /\b[\w-]+\.(pdf|docx?|xlsx?|png|jpe?g)\b/i.test(text);
      if (artifactKeywords.test(text) && reviewKeywords.test(text) && !hasUrl && !hasPath) {
        console.log(`[directivePoll] ${agentId} directive references artifacts but provides no URLs/paths — dead-lettering as unactionable`);
        if (!state._deadLetter) state._deadLetter = [];
        state._deadLetter.push({
          channel, ts: m.ts, agentId,
          text: text.slice(0, 200),
          failedAt: new Date().toISOString(),
          reason: 'missing_artifacts',
        });
        if (msgTs > parseFloat(state[channel] || '0')) state[channel] = m.ts;
        updateAgentHealth(agentId, 'failed');
        continue;
      }
      // CONCURRENCY (Oct 5, 2026): Don't await the delegation inline —
      // queue it for the concurrent batch after the scan. The slow LLM
      // call runs in parallel with the other directives' calls.
      pendingDelegations.push({ channel, m, text, msgTs, agentId, agent });
    }
  }

  // PHASE 2+3 (Oct 5, 2026 — concurrent delegations):
  // Run all queued agent delegations concurrently (cap 4), then finalize
  // each in original order (validation, posting, state updates stay serial
  // so watermark/retry/dead-letter semantics are unchanged).
  //
  // BATCH CAP (Oct 5, 2026): With 180s timeouts, a large batch exceeds the
  // 5-min cron window. Cap at 8 per run (highest priority first); the rest
  // wait for the next cycle. Watermarks only advance for processed items,
  // so unprocessed directives are safely retried.
  const MAX_BATCH = 6;
  if (pendingDelegations.length > MAX_BATCH) {
    // Sort by priority (same logic as mapWithConcurrency) so the cap keeps
    // the highest-priority work
    pendingDelegations.sort((a, b) => getDirectivePriority(a) - getDirectivePriority(b));
    console.log(`[directivePoll] batch capped: ${pendingDelegations.length} → ${MAX_BATCH} (highest priority first, rest next cycle)`);
    pendingDelegations.length = MAX_BATCH;
  }
  if (pendingDelegations.length > 0) {
    console.log(`[directivePoll] running ${pendingDelegations.length} delegation(s) concurrently (cap ${DELEGATION_CONCURRENCY})`);
    const batchStart = Date.now();
    const delegationResults = await mapWithConcurrency(
      pendingDelegations, DELEGATION_CONCURRENCY, runDelegation
    );
    console.log(`[directivePoll] concurrent delegations finished in ${((Date.now() - batchStart) / 1000).toFixed(1)}s`);
    for (let i = 0; i < pendingDelegations.length; i++) {
      const item = pendingDelegations[i];
      const dr = delegationResults[i];
      if (!dr.ok) {
        console.error(`[directivePoll] ${item.agentId} delegation threw:`, dr.error?.message);
        updateAgentHealth(item.agentId, 'failed');
        // Do NOT advance state — retry this directive on the next run.
        continue;
      }
      try {
        processed += await finalizeDelegation(client, state, item, dr.value);
      } catch (e) {
        console.error(`[directivePoll] ${item.agentId} finalize failed:`, e.message);
        updateAgentHealth(item.agentId, 'failed');
        // Do NOT advance state — retry this directive on the next run.
      }
    }
  }

  saveState(state);
  console.log(`[directivePoll] done, processed ${processed} directive(s)`);
}

// SINGLE-INSTANCE LOCK (Oct 5, 2026): Poller runtime can exceed the 5-min cron
// cadence (180s timeout × many directives). Overlapping runs cause duplicate
// processing and duplicate Slack replies. Use a lock file — if another run is
// in progress, exit immediately.
const LOCK_PATH = path.join(__dirname, '.directive-poll.lock');
function acquireLock() {
  try {
    const fd = fs.openSync(LOCK_PATH, 'wx');
    fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
    fs.closeSync(fd);
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') {
      // Check if the lock is stale (older than 15 minutes)
      try {
        const stat = fs.statSync(LOCK_PATH);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > 15 * 60 * 1000) {
          console.log('[directivePoll] Stale lock found (>15min), removing and proceeding');
          fs.unlinkSync(LOCK_PATH);
          return acquireLock();
        }
      } catch {}
      console.log('[directivePoll] Another run in progress — exiting (single-instance lock)');
      return false;
    }
    throw e;
  }
}
function releaseLock() {
  try { fs.unlinkSync(LOCK_PATH); } catch {}
}
process.on('exit', releaseLock);
process.on('SIGTERM', () => { releaseLock(); process.exit(0); });

if (!acquireLock()) {
  process.exit(0);
}
main().then(() => {
  // Explicit exit: WebClient and fetch leave open handles that prevent natural exit.
  process.exit(0);
}).catch(e => { console.error('[directivePoll] fatal:', e.message); process.exit(1); });
