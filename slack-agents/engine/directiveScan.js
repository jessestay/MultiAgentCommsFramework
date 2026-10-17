// engine/directiveScan.js — Phase F (Vikunja #789, US-F1): the
// engine-side directive scanner + the intake cycle it drives.
//
// The scanner applies the SAME per-message decisions as the poller's
// scan phase in engine/directivePoll.js (which stays frozen as the
// fallback path): roadblocks, delegation-header parsing (both arrow
// dialects), routability, the received-once dedupe, and the
// artifact-validation dead-letter. The difference is the sink: instead
// of queueing messages for in-process execution, each accepted
// directive is REGISTERED in the durable intake
// (engine/directiveIntake.js) — the Phase B dispatch loop then runs it
// as a directive-work Hatchet workflow, and the finalize loop consumes
// its settlement through the shared finalize machinery
// (engine/directiveFinalize.js).
//
// Watermark rule (the zero-missed invariant): the channel watermark
// advances to a message ONLY after that message has been durably
// handled — registered, dead-lettered, recorded as a roadblock, or
// classified as not-a-directive. If registration throws, the scan
// STOPS at that message: the watermark stays behind it and the next
// cycle retries it. The watermark can never pass an unregistered
// directive.
//
// Zero-missed audit: each scan also inspects the fetched window BELOW
// the watermark. A routable directive there that is in none of the
// handled ledgers (received list, intake, retry queue, dead-letter) is
// reported to the retirement tracker as missed — the check US-F1.3's
// "verified against the poller's own watermark method" asks for.
//
// runIntakeCycle is the Hatchet-cron-driven cycle (registered by
// engine/directiveTriggers.js). Its stage order is the starvation fix:
//   1. SCAN      — new directives register first, always.
//   2. DRAIN     — retry queue + due dead-letter requeues register.
//   3. CONSUME   — settled records finalize via the shared machinery.
// A cycle that dies mid-way loses nothing: registrations are durable
// the moment they land, queue entries that failed to register are
// re-queued, and state is saved after every stage.
'use strict';

const fs = require('fs');
const path = require('path');
const { DELEGATION_TARGETS } = require('../config');
const { updateAgentHealth } = require('./directiveFinalize');
const { directiveRunId } = require('./directiveWorkflow');

const DEFAULT_CHANNELS = [
  'C0ASH4TF604', // #management
  'C0ASDH1HC1Y', // #marketing
];
const DEFAULT_AGENT_IDS = ['execPM', 'cmo', 'cco', 'cfo', 'cro', 'cto', 'cuxo', 'jobcoach', 'lawyer', 'facebook', 'hr'];
const ROADBLOCKS_PATH = path.join(__dirname, '.roadblocks.json');

// Delegation header parser: accepts BOTH the Unicode arrow and the ASCII
// arrow in "[from: X <arrow> Y]". The ASCII form silently failed to route
// until Oct 15, 2026 — directives posted with '->' were scanned, marked
// seen, and dropped with zero log lines; the failure only surfaced by
// comparing the poll watermark against the received-directives ledger.
// (Moved here from directivePoll.js in Phase F so the poller's fallback
// scan and the engine scan share ONE parser — the drift between two
// parsers is exactly what hid that failure. directivePoll re-exports it.)
function parseDelegationHeader(text) {
  const m = String(text || '').match(/\[from:\s*(.+?)\s*(?:\u2192|->)\s*(.+?)\]/i);
  if (!m) return null;
  return { from: m[1].trim(), to: m[2].trim() };
}

function resolveAgentId(toNameRaw, agentIds) {
  const toName = String(toNameRaw || '').toLowerCase().replace(/[\s-]+/g, '');
  const agentId = DELEGATION_TARGETS[toName];
  if (!agentId || !agentIds.includes(agentId)) return null;
  return agentId;
}

function createDirectiveScanner({
  client,
  intake,
  channels = DEFAULT_CHANNELS,
  agentIds = DEFAULT_AGENT_IDS,
  retirement = null,
  roadblocksPath = ROADBLOCKS_PATH,
  historyLimit = 30,
} = {}) {
  if (!client || !intake) throw new Error('createDirectiveScanner requires { client, intake }');

  function recordRoadblock(entry) {
    let roadblocks = [];
    try { roadblocks = JSON.parse(fs.readFileSync(roadblocksPath, 'utf8')); } catch {}
    if (!Array.isArray(roadblocks)) roadblocks = [];
    roadblocks.push(entry);
    if (roadblocks.length > 50) roadblocks = roadblocks.slice(-50);
    fs.writeFileSync(roadblocksPath, JSON.stringify(roadblocks, null, 2));
  }

  function isHandledBelow(state, channel, ts) {
    const key = `${channel}:${ts}`;
    if (Array.isArray(state._receivedDirectives) && state._receivedDirectives.includes(key)) return true;
    if (Array.isArray(state._pendingRetry) && state._pendingRetry.some(e => e.channel === channel && e.ts === ts)) return true;
    if (Array.isArray(state._deadLetter) && state._deadLetter.some(e => e.channel === channel && e.ts === ts)) return true;
    return false;
  }

  // The zero-missed audit over the already-watermarked window.
  async function auditWindow(state, channel, msgs, watermark) {
    if (!retirement || typeof retirement.recordMissedDirective !== 'function') return 0;
    let missed = 0;
    for (const m of msgs) {
      if (parseFloat(m.ts) > parseFloat(watermark)) continue;
      const dm = parseDelegationHeader(m.text || '');
      if (!dm) continue;
      if (!resolveAgentId(dm.to, agentIds)) continue;
      if (isHandledBelow(state, channel, m.ts)) continue;
      if (await intake.get(`${channel}:${m.ts}`)) continue;
      retirement.recordMissedDirective({ channel, ts: m.ts });
      missed++;
      console.error(`[directiveScan] MISSED directive detected below watermark: ${channel}:${m.ts}`);
    }
    return missed;
  }

  async function scanChannel(state, channel) {
    const summary = { channel, scanned: 0, registered: 0, roadblocks: 0, deadLettered: 0, missed: 0, error: null };
    const lastTs = state[channel] || '0';
    let history;
    try {
      history = await client.conversations.history({ channel, limit: historyLimit });
    } catch (e) {
      console.error(`[directiveScan] history failed for ${channel}:`, e.message);
      summary.error = e.message;
      return summary;
    }
    const msgs = (history.messages || []).slice().sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

    summary.missed = await auditWindow(state, channel, msgs, lastTs);

    let advancedTo = lastTs;
    const advance = (ts) => { if (parseFloat(ts) > parseFloat(advancedTo)) advancedTo = ts; };

    for (const m of msgs) {
      if (parseFloat(m.ts) <= parseFloat(lastTs)) continue;
      summary.scanned++;
      const text = m.text || '';
      const msgTs = parseFloat(m.ts);

      // ROADBLOCKS (same rule as the poller): recorded for CEO review
      // and routed to execPM — here as a roadblock-kind intake record,
      // executed by the workflow path and consumed fire-and-forget.
      const rb = text.match(/\[ROADBLOCK:\s*(.+?)\]\s*(.+)/is);
      if (rb) {
        const agentName = rb[1].trim();
        const need = rb[2].trim().slice(0, 500);
        console.log(`[directiveScan] 🚧 ROADBLOCK from ${agentName}: ${need.slice(0, 100)}`);
        recordRoadblock({
          timestamp: new Date().toISOString(),
          agent: agentName,
          need,
          channel,
          msgTs: m.ts,
          status: 'open',
          routedTo: 'execPM',
          via: 'engine-scan',
        });
        try {
          await intake.register({
            channel, ts: m.ts, msgTs, agentId: 'execPM',
            text: `[from: ${agentName} → Exec PM] CAPABILITY REQUEST: ${need}`,
            checkpointRunId: directiveRunId(channel, m.ts),
            kind: 'roadblock',
          });
        } catch (e) {
          console.error(`[directiveScan] roadblock registration failed for ${channel}:${m.ts} — scan stops here, will retry:`, e.message);
          break;
        }
        summary.roadblocks++;
        advance(m.ts);
        continue;
      }

      const dm = parseDelegationHeader(text);
      if (!dm) {
        // LOUD near-miss (Oct 15, 2026): a message that looks like a
        // delegation but does not parse must never be dropped silently.
        if (/\[from:/i.test(text)) {
          console.log(`[directiveScan] ⚠ NEAR-MISS: unparseable delegation header (check arrow/format): "${text.slice(0, 100)}"`);
        }
        advance(m.ts);
        continue;
      }
      const agentId = resolveAgentId(dm.to, agentIds);
      if (!agentId) {
        console.log(`[directiveScan] no agent for target "${dm.to}" (from ${dm.from}) — skipping`);
        advance(m.ts);
        continue;
      }

      // 'received' counted ONCE per unique directive (same dedupe the
      // poller keeps) — the scan may revisit a message after a
      // registration failure or a state repair.
      const directiveKey = `${channel}:${m.ts}`;
      if (!Array.isArray(state._receivedDirectives)) state._receivedDirectives = [];
      if (!state._receivedDirectives.includes(directiveKey)) {
        updateAgentHealth(agentId, 'received');
        state._receivedDirectives.push(directiveKey);
        if (state._receivedDirectives.length > 500) {
          state._receivedDirectives = state._receivedDirectives.slice(-500);
        }
      }

      // ARTIFACT VALIDATION (same rule as the poller): a directive that
      // asks to review specific artifacts but provides no URLs or paths
      // is unactionable — dead-letter it at scan instead of burning
      // retries.
      const artifactKeywords = /\b(pdfs?|documents?|templates?|files?|spreadsheets?|images?|videos?|designs?|mockups?|wireframes?)\b/i;
      const reviewKeywords = /\b(review|analyze|check|verify|audit|inspect|examine|look at)\b/i;
      const hasUrl = /https?:\/\/[^\s]+/i.test(text);
      const hasPath = /(?:\/[\w.-]+)+\.\w+/.test(text) || /\b[\w-]+\.(pdf|docx?|xlsx?|png|jpe?g)\b/i.test(text);
      if (artifactKeywords.test(text) && reviewKeywords.test(text) && !hasUrl && !hasPath) {
        console.log(`[directiveScan] ${agentId} directive references artifacts but provides no URLs/paths — dead-lettering as unactionable`);
        if (!Array.isArray(state._deadLetter)) state._deadLetter = [];
        state._deadLetter.push({
          channel, ts: m.ts, agentId,
          text: text.slice(0, 200),
          failedAt: new Date().toISOString(),
          reason: 'missing_artifacts',
        });
        updateAgentHealth(agentId, 'failed');
        advance(m.ts);
        summary.deadLettered++;
        continue;
      }

      // The durable handoff. If this throws, the scan stops: the
      // watermark must never advance past an unregistered directive.
      try {
        await intake.register({
          channel, ts: m.ts, msgTs, agentId, text,
          checkpointRunId: directiveRunId(channel, m.ts),
          kind: 'directive',
          requeues: 0,
        });
      } catch (e) {
        console.error(`[directiveScan] registration failed for ${directiveKey} — scan stops here, will retry next cycle:`, e.message);
        break;
      }
      summary.registered++;
      advance(m.ts);
    }

    if (parseFloat(advancedTo) > parseFloat(state[channel] || '0')) {
      state[channel] = advancedTo;
    }
    return summary;
  }

  async function scanAll(state) {
    const out = { channels: [], registered: 0, roadblocks: 0, deadLettered: 0, missed: 0 };
    for (const channel of channels) {
      const s = await scanChannel(state, channel);
      out.channels.push(s);
      out.registered += s.registered;
      out.roadblocks += s.roadblocks;
      out.deadLettered += s.deadLettered;
      out.missed += s.missed;
    }
    return out;
  }

  return { scanChannel, scanAll, channels: channels.slice() };
}

// One full intake cycle. Stage order is the starvation guarantee (see
// header). deps:
//   client     Slack WebClient (drains init agents; consume posts)
//   intake     the durable intake store
//   scanner    createDirectiveScanner(...) bound to the same intake
//   finalize   engine/directiveFinalize (init'ed by the caller)
//   loadState  () => poll state object
//   saveState  (state) => void — called after EVERY stage
//   retirement retirement tracker or null
async function runIntakeCycle({ client, intake, scanner, finalize, loadState, saveState, retirement = null } = {}) {
  if (!intake || !scanner || !finalize || !loadState || !saveState) {
    throw new Error('runIntakeCycle requires { intake, scanner, finalize, loadState, saveState }');
  }
  const state = loadState();

  // Stage 1 — SCAN FIRST. New directives register before any drain or
  // finalize work can consume the cycle.
  const scan = await scanner.scanAll(state);
  saveState(state);

  // Stage 2 — drains register queued work into the intake. The shared
  // drain functions build delegation items; here each item's execution
  // sink is the intake (the dispatch loop runs it as a workflow), not
  // an in-process call.
  const drainedItems = [];
  finalize.drainDeadLetterRequeues(state, client, drainedItems);
  finalize.drainPendingRetry(state, client, drainedItems);
  let drainedRegistered = 0;
  let drainedRequeuedBack = 0;
  for (const item of drainedItems) {
    try {
      await intake.register({
        channel: item.channel,
        ts: item.m.ts,
        msgTs: item.msgTs,
        agentId: item.agentId,
        text: item.text,
        checkpointRunId: directiveRunId(item.channel, item.m.ts),
        kind: 'directive',
        requeues: item.requeues || 0,
      });
      drainedRegistered++;
    } catch (e) {
      // Never lose a drained directive: it goes back to the retry
      // queue and registers on a later cycle.
      console.error(`[directiveScan] drain registration failed for ${item.channel}:${item.m.ts} — re-queuing:`, e.message);
      finalize.queueRetry(state, item);
      drainedRequeuedBack++;
    }
  }
  saveState(state);

  // Stage 3 — consume settled records through the shared finalize path.
  const consumed = await finalize.consumeSettledIntakeRecords({ intake, state, client });
  saveState(state);

  if (retirement) {
    try {
      retirement.recordScanCycle();
      if (consumed.directives > 0) retirement.recordEngineFinalized(consumed.directives);
    } catch (e) {
      console.error('[directiveScan] retirement recording failed:', e.message);
    }
  }

  const summary = { scan, drainedRegistered, drainedRequeuedBack, consumed };
  console.log(`[directiveScan] intake cycle: scanned-registered=${scan.registered} drained-registered=${drainedRegistered} finalized=${consumed.consumed}`);
  return summary;
}

module.exports = {
  parseDelegationHeader,
  resolveAgentId,
  createDirectiveScanner,
  runIntakeCycle,
  DEFAULT_CHANNELS,
  DEFAULT_AGENT_IDS,
};
