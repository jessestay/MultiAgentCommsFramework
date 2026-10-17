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
const { logEngineGap } = require('./engineGap');
const { loadPollState, savePollState, POLL_STATE_PATH } = require('./directiveState');
const directiveFinalize = require('./directiveFinalize');
const { parseDelegationHeader } = require('./directiveScan');

const STATE_PATH = POLL_STATE_PATH; // engine/.directive-poll-state.json (see directiveState.js)
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

const AGENT_IDS = ['execPM', 'cmo', 'cco', 'cfo', 'cro', 'cto', 'cuxo', 'jobcoach', 'lawyer', 'facebook', 'hr'];
const loadedAgents = {};

function loadState() { return loadPollState(STATE_PATH); }
function saveState(s) { return savePollState(s, STATE_PATH); }

function getAgent(id) {
  if (!loadedAgents[id]) {
    loadedAgents[id] = require(`../agents/${id}.js`);
  }
  return loadedAgents[id];
}

// PHASE F (Vikunja #789): the finalize machinery (validation,
// posting, health, retry/dead-letter/requeue) lives in
// engine/directiveFinalize.js, shared with the engine-side intake
// cycle. The poller injects its agent loader here (the
// utils/delegation init pattern) and re-exports the bound functions
// below so existing callers and tests are untouched.
directiveFinalize.init({ getAgent, agentIds: AGENT_IDS });
const {
  verifyPostLanded, queueForVerification, updateAgentHealth, linkDirectiveToTask,
  buildReceiptSummary, queueRetry, dropPendingRetry, drainPendingRetry,
  drainDeadLetterRequeues, recordRetryFailure, hasVerifiableEvidenceIn,
  countToolReceiptsSince, hasEvidenceMarker, sanitizePostText, finalizeDelegation,
  MAX_PENDING_RETRY, REQUEUE_COOLDOWN_MS, MAX_REQUEUES,
} = directiveFinalize;

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
  const hdr = parseDelegationHeader(text);
  if (hdr && /^CEO$/i.test(hdr.from)) return PRIORITY.JESSE_DIRECT;
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

// ─── PHASE B (Vikunja #789) — directive execution paths ───────────────────
// executeDelegation is THE entry point for running one directive's
// delegation. Two execution paths, one contract (the agent's result, or
// null on failure — the finalize/retry/dead-letter machinery downstream
// is unchanged):
//
//   WORKFLOW PATH (MACF_DIRECTIVE_WORKFLOW=1 + fresh engine heartbeat):
//   the directive is registered in the durable intake
//   (engine/directiveIntake.js); the engine process dispatches it as a
//   directive-work Hatchet run whose step executes the delegation with
//   Phase A checkpointing; the poller awaits the intake record and
//   consumes its result. The agent never executes in this process.
//
//   INLINE PATH (the pre-Phase-B behavior, kept as the fail-closed
//   fallback): the delegation runs in this process — now wrapped in the
//   same run context (deterministic checkpoint run ID + the durable
//   checkpoint store), so even the fallback is checkpointed/resumable.
//
// The inline path is used ONLY when no workflow run can have started:
// flag off, engine heartbeat stale (the engine is down — nothing will
// dispatch), or intake registration itself throwing. A workflow-path
// failure AFTER registration (the record settles failed, or the wait
// times out) resolves to null and flows into the existing retry
// machinery — the agent is NEVER re-executed inline in that case,
// because a workflow step may still be running it (no double execution).
const DIRECTIVE_WORKFLOW_HEARTBEAT_MAX_AGE_MS = 90000;
let _intakeStore = null;
let _durableCheckpointStore = null;

function workflowModeEnabled() {
  return process.env.MACF_DIRECTIVE_WORKFLOW === '1';
}

// PHASE F (Vikunja #789) — fallback-only poller decision. With
// MACF_ENGINE_INTAKE=1 the engine owns scanning, registration and
// finalization; this cron poller is the fallback: it stands down
// while the engine heartbeat is fresh and resumes its full legacy
// cycle only when the heartbeat is stale (the engine is down).
// With the flag off, the poller is the primary path, as in Phase B.
function phaseFFallbackDecision({ engineIntakeFlag, heartbeatFresh } = {}) {
  if (!engineIntakeFlag) return 'legacy';
  return heartbeatFresh ? 'noop' : 'fallback';
}
function getIntakeStore() {
  if (!_intakeStore) {
    const { createIntakeStore, resolveIntakeDir } = require('./directiveIntake');
    _intakeStore = createIntakeStore(resolveIntakeDir());
  }
  return _intakeStore;
}
function getDurableCheckpointStore() {
  if (!_durableCheckpointStore) {
    const { createDurableCheckpointStore } = require('../utils/checkpointAdapters');
    _durableCheckpointStore = createDurableCheckpointStore();
  }
  return _durableCheckpointStore;
}
// Test hook: swap the intake store (temp dir) without touching env/FS layout.
function __setIntakeStoreForTest(store) { _intakeStore = store; }

// Inline execution — the pre-Phase-B path with its semantics preserved:
// pass the message ts so the agent can reply in the directive's thread
// (fixes the "0 replies" bug where agents posted top-level), and the
// hang envelope from Oct 4/5/6, 2026 (300s: the expert lens context
// slows generation; concurrent execution means a longer per-delegation
// timeout doesn't stall the batch). Phase B adds only the run-context
// wrapper (checkpointing) around the same call.
async function executeInline(item, { timeoutMs = 300000 } = {}) {
  const { agent, agentId, text, channel, m } = item;
  const { runWithRunContext } = require('./runContext');
  const { directiveRunId } = require('./directiveWorkflow');
  let timer = null;
  const result = await runWithRunContext(
    { runId: directiveRunId(channel, m.ts), checkpointStore: getDurableCheckpointStore() },
    () => Promise.race([
      agent.handleDelegation(text, new Set(), channel, m.ts),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Agent ${agentId} timed out after ${Math.round(timeoutMs / 1000)}s`)),
          timeoutMs
        );
      }),
    ])
  ).catch(e => {
    console.error(`[directivePoll] ${agentId} delegation failed/timed out:`, e.message);
    return null; // Treat as failure, don't block the batch
  }).finally(() => { if (timer) clearTimeout(timer); });
  return result;
}

// Workflow execution: register the directive and await the engine's
// settlement of its intake record. Returns the step's result, or null
// when the run failed or did not settle within the wait — null feeds
// the same retry machinery as an inline failure.
async function executeViaWorkflow(item, { timeoutMs = 300000, pollMs = 1000 } = {}) {
  const { channel, m, text, msgTs, agentId } = item;
  const intake = getIntakeStore();
  const { directiveRunId } = require('./directiveWorkflow');
  const key = `${channel}:${m.ts}`;
  await intake.register({
    channel, ts: m.ts, msgTs, agentId, text,
    checkpointRunId: directiveRunId(channel, m.ts),
  });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rec = await intake.get(key);
    if (rec && rec.status === 'completed') return rec.result === undefined ? null : rec.result;
    if (rec && rec.status === 'failed') {
      console.error(`[directivePoll] ${agentId} directive-work run failed: ${rec.error || 'unknown error'}`);
      return null;
    }
    if (Date.now() >= deadline) {
      console.error(`[directivePoll] ${agentId} directive-work run did not settle within ${Math.round(timeoutMs / 1000)}s — leaving it to the retry machinery (no inline re-execution)`);
      return null;
    }
    await new Promise(r => setTimeout(r, pollMs));
  }
}

async function executeDelegation(item, opts = {}) {
  if (workflowModeEnabled()) {
    let intake = null;
    try { intake = getIntakeStore(); } catch { intake = null; }
    if (intake && intake.heartbeatFresh(DIRECTIVE_WORKFLOW_HEARTBEAT_MAX_AGE_MS)) {
      try {
        return await executeViaWorkflow(item, opts);
      } catch (e) {
        // Registration/read failures mean no run can have started —
        // safe to fall back inline. (Post-registration failures resolve
        // to null inside executeViaWorkflow and never reach here.)
        console.error(`[directivePoll] workflow path unavailable for ${item.agentId} (${e.message}) — falling back to inline execution`);
        try {
          logEngineGap('directive_workflow_fallback', `${item.agentId} directive fell back to inline execution: ${e.message}`, 'directivePoll');
        } catch { /* gap logging must never break the batch */ }
      }
    } else {
      console.log(`[directivePoll] directive engine heartbeat stale — executing ${item.agentId} inline (workflow path unavailable)`);
    }
  }
  return executeInline(item, opts);
}

// Execute one agent delegation. Kept as the batch runner's entry point;
// the Phase B path selection lives in executeDelegation above.
async function runDelegation(item) {
  return executeDelegation(item);
}

async function main() {
  const token = resolveSlackToken();
  if (!token) { console.error('[directivePoll] no Slack token'); process.exit(1); }
  const client = new WebClient(token);

  const state = loadState();
  let processed = 0;

  // PHASE F (Vikunja #789) — fallback-only mode. With
  // MACF_ENGINE_INTAKE=1 the engine owns scanning, registration and
  // finalization (engine/directiveScan.js runIntakeCycle, driven by a
  // Hatchet cron trigger). This poller then only acts when the engine
  // is down: fresh heartbeat → stand down (a second worker double-posts);
  // stale heartbeat → record the fallback activation (it breaks the
  // retirement streak), adopt whatever the dead engine left in the
  // intake, finalize its settled records through the shared machinery,
  // and run the full legacy cycle below until the engine returns.
  let phaseFFallbackActive = false;
  if (process.env.MACF_ENGINE_INTAKE === '1') {
    let heartbeatFresh = false;
    try { heartbeatFresh = getIntakeStore().heartbeatFresh(DIRECTIVE_WORKFLOW_HEARTBEAT_MAX_AGE_MS); }
    catch { heartbeatFresh = false; }
    if (phaseFFallbackDecision({ engineIntakeFlag: true, heartbeatFresh }) === 'noop') {
      console.log('[directivePoll] Phase F: engine intake active (fresh heartbeat) — poller standing down (fallback-only mode)');
      return;
    }
    phaseFFallbackActive = true;
    console.log('[directivePoll] Phase F: engine heartbeat stale — FALLBACK cycle (poller resuming full duty until the engine returns)');
    try {
      const { createRetirementTracker } = require('./directiveRetirement');
      createRetirementTracker().recordFallbackActivation('engine heartbeat stale at poller cycle');
    } catch (e) {
      console.error('[directivePoll] Phase F: retirement fallback recording failed:', e.message);
    }
    try {
      const intake = getIntakeStore();
      const adopted = await directiveFinalize.adoptOrphanedIntakeRecords({ intake });
      if (adopted.forceFailed) {
        console.log(`[directivePoll] Phase F fallback: adopted ${adopted.forceFailed} orphaned intake record(s) left by the dead engine`);
      }
      const consumed = await directiveFinalize.consumeSettledIntakeRecords({ intake, state, client });
      if (consumed.consumed) {
        console.log(`[directivePoll] Phase F fallback: finalized ${consumed.consumed} settled intake record(s)`);
      }
    } catch (e) {
      console.error('[directivePoll] Phase F fallback adoption/consume failed:', e.message);
    }
  }
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

  // RETRY-QUEUE DRAIN (Oct 11, 2026): directives scanned but not resolved
  // (garbled output, null result, batch-cap drop, finalize throw) are
  // re-queued here from state._pendingRetry, INDEPENDENT of the watermark —
  // the scan-phase watermark may already have advanced past them.
  // AUTO-REQUEUE (Oct 15, 2026): dead-lettered directives whose cooldown has
  // elapsed drain FIRST (they are the oldest outstanding work), then the
  // regular retry queue.
  drainDeadLetterRequeues(state, client, pendingDelegations);
  drainPendingRetry(state, client, pendingDelegations);

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
            // Phase B (Vikunja #789): roadblocks ride the same execution
            // entry point as directives — workflow path when enabled,
            // inline otherwise — so no directive-path execution happens
            // outside it (US-B1.2 coverage).
            await executeDelegation(
              { channel, m: { ts: m.ts }, text: roadblockMsg, msgTs, agentId: 'execPM', agent: execPMAgent },
              { timeoutMs: 60000 }
            ).catch(e => console.error(`[directivePoll] execPM roadblock routing failed:`, e.message));
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
      const dm = parseDelegationHeader(text);
      if (!dm) {
        // LOUD near-miss (Oct 15, 2026): a message that looks like a
        // delegation but does not parse must never be dropped silently —
        // that silence hid the ASCII-arrow routing failure for hours.
        if (/\[from:/i.test(text)) {
          console.log(`[directivePoll] ⚠ NEAR-MISS: unparseable delegation header (check arrow/format): "${text.slice(0, 100)}"`);
        }
        // Non-directive: safe to mark as seen immediately.
        if (msgTs > parseFloat(state[channel] || '0')) state[channel] = m.ts;
        continue;
      }
      const fromName = dm.from;
      const toNameRaw = dm.to;
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
      // HEALTH (Oct 6, 2026 — root-cause fix): count 'received' ONCE per
      // unique directive. The watermark does not advance on evidence-gate
      // retries or batch-cap drops, so the same directive was re-scanned
      // every 5-min cycle and re-counted — inflating directivesReceived
      // (e.g. CMO 264 received vs 90 terminal outcomes) and systematically
      // depressing the delivery rate the self-healer checks against 50%.
      const directiveKey = `${channel}:${m.ts}`;
      if (!Array.isArray(state._receivedDirectives)) state._receivedDirectives = [];
      if (!state._receivedDirectives.includes(directiveKey)) {
        updateAgentHealth(agentId, 'received');
        state._receivedDirectives.push(directiveKey);
        // Bound the dedupe set: completed/dead-lettered directives advance
        // the watermark and can never reappear, so only recent keys matter.
        if (state._receivedDirectives.length > 500) {
          state._receivedDirectives = state._receivedDirectives.slice(-500);
        }
      }
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
          // #807 US-P3.2: full text on every dead-letter entry (the main
          // failure path already stores it; this intake path did not).
          fullText: text.slice(0, 4000),
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
  // PHASE F fallback bookkeeping: a directive this fallback cycle has
  // to route that was posted long before the engine died was missed by
  // the engine-side scan — record it against the retirement streak
  // (the zero-missed bar in the CEO's Phase F retirement decision).
  if (phaseFFallbackActive) {
    try {
      const { createRetirementTracker } = require('./directiveRetirement');
      const tracker = createRetirementTracker();
      const staleBeforeMs = Date.now() - 10 * 60 * 1000;
      for (const item of pendingDelegations) {
        if (!item.isRetry && (item.msgTs || 0) * 1000 < staleBeforeMs) {
          tracker.recordMissedDirective({ channel: item.channel, ts: item.m.ts });
          console.log(`[directivePoll] Phase F fallback: directive ${item.channel}:${item.m.ts} predates the engine outage — recorded as missed`);
        }
      }
    } catch (e) {
      console.error('[directivePoll] Phase F: retirement missed-directive recording failed:', e.message);
    }
  }

  const MAX_BATCH = 6;
  if (pendingDelegations.length > MAX_BATCH) {
    // Sort by priority (same logic as mapWithConcurrency) so the cap keeps
    // the highest-priority work
    pendingDelegations.sort((a, b) => getDirectivePriority(a) - getDirectivePriority(b));
    console.log(`[directivePoll] batch capped: ${pendingDelegations.length} → ${MAX_BATCH} (highest priority first, rest queued for retry)`);
    // Retry-queue the dropped items: the scan-phase watermark may already
    // have advanced past them, so "rest next cycle" is not guaranteed
    // without the explicit queue.
    for (const dropped of pendingDelegations.slice(MAX_BATCH)) {
      queueRetry(state, dropped);
    }
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
        // Retry-queue: the scan-phase watermark may already be past this
        // directive, so re-scanning is not guaranteed.
        queueRetry(state, item);
        continue;
      }
      try {
        processed += await finalizeDelegation(client, state, item, dr.value);
      } catch (e) {
        console.error(`[directivePoll] ${item.agentId} finalize failed:`, e.message);
        updateAgentHealth(item.agentId, 'failed');
        // Retry-queue: the scan-phase watermark may already be past this
        // directive, so re-scanning is not guaranteed.
        queueRetry(state, item);
      }
    }
  }

  // ZERO-CYCLE ALARM (Oct 12, 2026 — CEO mechanism repair): a cycle that had
  // delegations to run and processed none means the model path failed
  // end-to-end. That used to surface only as a log line hours later.
  if (processed === 0 && pendingDelegations.length > 0) {
    try {
      logEngineGap(
        'directive_cycle_zero',
        `Directive cycle processed 0 of ${pendingDelegations.length} delegation(s) — model path failure suspected; see llm-canary state`,
        'directivePoll'
      );
    } catch {}
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

// TEST-SAFE (Oct 11, 2026): main() runs only when executed directly, so
// require()ing this module for unit tests has no side effects (no lock,
// no Slack calls, no state mutation).
if (require.main === module) {
  if (!acquireLock()) {
    process.exit(0);
  }
  main().then(() => {
    // Explicit exit: WebClient and fetch leave open handles that prevent natural exit.
    process.exit(0);
  }).catch(e => { console.error('[directivePoll] fatal:', e.message); process.exit(1); });
}

module.exports = { queueRetry, dropPendingRetry, drainPendingRetry, drainDeadLetterRequeues, recordRetryFailure, MAX_PENDING_RETRY, REQUEUE_COOLDOWN_MS, MAX_REQUEUES, linkDirectiveToTask, finalizeDelegation, hasVerifiableEvidenceIn, countToolReceiptsSince, sanitizePostText, parseDelegationHeader, executeDelegation, executeInline, executeViaWorkflow, workflowModeEnabled, phaseFFallbackDecision, __setIntakeStoreForTest };
