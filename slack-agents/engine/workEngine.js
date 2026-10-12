// engine/workEngine.js — MACF 24/7 Work Engine
//
// The team's muscle. An in-process service loop (not a cron, not a scheduled
// task): the PM leads, the Vikunja board is the backlog, and idle time becomes
// revenue and improvement work. It starts with the bot process, so wherever
// the bot runs at boot (desktop `macf-slack-runtime` scheduled task, Railway),
// the team keeps working around the clock — like a real company.
//
// Operating contract (Jesse's hard rules, enforced in every cycle):
// - Nothing is ever sent, published, bought, or charged without Jesse's
//   explicit approval. Drafts stay drafts.
// - Things that absolutely need Jesse (money authorization, his logins, his
//   approvals) get an IMMEDIATE DM from the CEO-role holder. Everything else
//   stays with the team — he sees outcomes, never tasks.
// - The investor is never tasked. The team solves or routes around.

const {
  AGENTS, CHANNELS, CEO_AGENT_ID, CEO_CHARTER, VIKUNJA,
} = require('../config');
const vikunja = require('../utils/vikunja');
const tasks = require('../utils/tasks');
// #724 (Oct 12, 2026): contracts + verified completion. Completion is a
// state transition taken when postconditions verify (engine/completion.js
// holds the only vikunja.completeTask call site).
const { parseContract } = require('./taskContract');
const completion = require('./completion');
const { getSchema } = require('./deliverableSchemas');
const { generateReport, generateWithTools, isConfigured: llmConfigured } = require('../utils/anthropic');
const { dmJesse } = require('../utils/dm');
const state = require('../utils/state');
const { acquireLock, isLockTask, holderId: lockHolderId } = require('./lock');

const ENGINE_ID = 'workEngine';
const CYCLE_MIN = parseInt(process.env.WORK_ENGINE_CYCLE_MIN || '30', 10);
const WORK_COOLDOWN_HOURS = parseInt(process.env.WORK_ENGINE_COOLDOWN_H || '6', 10);
const IDLE_PROPOSAL_HOURS = parseInt(process.env.WORK_ENGINE_IDLE_PROPOSAL_H || '12', 10);
const ENABLED = (process.env.WORK_ENGINE_ENABLED || '1') === '1';

// hasEvidence() DELETED (Oct 12, 2026 — #724, Phase 3): the prose evidence
// gate is replaced by contract verification (engine/completion.js) —
// postconditions checked against the world and the receipts ledger. There
// is no text pattern left that can make work "count" as delivered.

// AGENT HEALTH SYNC (Oct 7, 2026 — root-cause fix for the blind demo gate):
// sprintDemo.js's checkRecentDemos() reads .agent-health.json, but only
// directivePoll.js ever updated it. The work engine completed tasks every
// 30 min yet the gate reported "0 demos" because the engine never recorded
// its work. Now every completed task updates the owner's health entry, so
// the measurement sees reality.
const AGENT_HEALTH_PATH = require('path').join(__dirname, '.agent-health.json');
function updateAgentHealth(agentId, completed) {
  try {
    const fs = require('fs');
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
    h.lastActivity = now;
    h.lastChecked = now;
    if (completed) {
      h.directivesCompleted++;
      h.consecutiveFailures = 0;
      h.status = 'healthy';
    }
    fs.writeFileSync(AGENT_HEALTH_PATH, JSON.stringify(health, null, 2));
  } catch (e) {
    log(`health update failed for ${agentId}:`, e.message);
  }
}

// P1.6 (Oct 12, 2026 — WIP cap): revenue tasks get the first work slots
// every cycle. Everything else waits until the focus list is clear or
// parked. Task IDs: #82 audit drafts, #81 workshop promo, #75 workshop
// rollout, #658 PDF verdicts, #59 Guidepoint receivable, #56 DataAnnotation.
const REVENUE_FOCUS = new Set([82, 81, 75, 658, 59, 56]);

// STRIKE SYSTEM (Oct 12, 2026 — starvation fix): a task whose work attempt
// fails must still record lastWorked, or the candidate picker re-selects it
// every cycle forever (task #11: 71 consecutive attempts, 40 tasks starved).
// 3 failed attempts in 4h parks the task for the rest of the window so the
// backlog keeps moving. Strikes expire automatically after 4h.
function recordAttempt(taskId, ok) {
  const now = new Date().toISOString();
  state.set(ENGINE_ID, `lastWorked.${taskId}`, now);
  const key = `failStrikes.${taskId}`;
  if (ok) {
    state.set(ENGINE_ID, key, []);
    return;
  }
  const fourHoursAgo = Date.now() - 4 * 3600 * 1000;
  const strikes = (state.get(ENGINE_ID, key) || [])
    .filter(s => new Date(s).getTime() > fourHoursAgo);
  strikes.push(now);
  state.set(ENGINE_ID, key, strikes.slice(-10));
}

function isParked(taskId) {
  const fourHoursAgo = Date.now() - 4 * 3600 * 1000;
  const strikes = (state.get(ENGINE_ID, `failStrikes.${taskId}`) || [])
    .filter(s => new Date(s).getTime() > fourHoursAgo);
  return strikes.length >= 3;
}

// Tasks matching this are Jesse-gated: the team may not execute them, but
// Jesse gets an immediate ping (Jesse's rule: things that absolutely need him
// are immediate pings). Pings are batched into ONE DM per cycle.
const JESSE_GATED_RE = /jesse action|needs jesse|jesse-only|jesse approval/i;
// Dormant by Jesse's own standing orders — never ping, never work.
// (Matches HOLD-001 / "on hold" / "parked" as a status, not incidental words
// like "RAM held".)
const DORMANT_RE = /hold-001|on hold|\bparked\b|guardrail/i;
// Time-critical: genuinely deadline-driven (used for re-pings).
const TIME_CRITICAL_RE = /urgent|asap|deadline|expires/i;

function log(...args) {
  console.log('[workEngine]', ...args);
}

function hoursSince(ts) {
  if (!ts) return Infinity;
  return (Date.now() - new Date(ts).getTime()) / 3_600_000;
}

function isDormant(task) {
  const haystack = `${task.title || ''} ${task.description || ''}`;
  return DORMANT_RE.test(haystack);
}

function isJesseGated(task) {
  if (isDormant(task)) return false;
  const haystack = `${task.title || ''} ${task.description || ''}`;
  return JESSE_GATED_RE.test(haystack);
}

function isTimeCritical(task) {
  const haystack = `${task.title || ''} ${task.description || ''}`;
  if (TIME_CRITICAL_RE.test(haystack)) return true;
  if (task.due_date) {
    const ms = new Date(task.due_date).getTime() - Date.now();
    if (ms < 48 * 3_600_000) return true; // due within 48h or overdue
  }
  return false;
}

// ─── Post to a channel as a persona (same pattern as the agents) ─────────────
async function postAs(agentId, channelId, text) {
  const agent = AGENTS[agentId];
  if (!agent) throw new Error(`unknown agent ${agentId}`);

  // GARBLED OUTPUT REJECTION (Oct 9, 2026): Apply the same validation
  // as directivePoll.js to work-engine deliverables. The work-engine path
  // was posting garbled output (CUXO CoT leak, CRO GoFundMe reply) because
  // isGarbledOutput was only checked in directivePoll.
  const { isGarbledOutput, sanitizeForSlack } = require('../utils/delegation');
  const clean = sanitizeForSlack(text);
  if (isGarbledOutput(clean)) {
    log(`REJECTED garbled output from ${agentId} — not posting`);
    log(`Garbled preview: ${clean.slice(0, 100)}...`);
    return; // Don't post, don't throw — just skip
  }

  await slackClient.chat.postMessage({
    channel: channelId,
    text: clean,
    username: agent.slackName,
    icon_emoji: agent.icon,
    unfurl_links: false,
  });
  log(`posted as ${agentId} → ${channelId}`);
}

async function resolveChannelId(channelName) {
  const { resolveChannel } = require('../utils/channels');
  return resolveChannel(slackClient, channelName);
}

// ─── Immediate Jesse ping (CEO-role holder only) ────────────────────────────
// Jesse's rule: things that absolutely need him are immediate pings. Multiple
// items in one cycle go out as ONE DM — immediate, not nagging.
async function pingJesse(items) {
  if (!items.length) return;
  const ceoAgent = AGENTS[CEO_AGENT_ID];
  const lines = items.map(({ task, reason }) =>
    `• *${task.title}* (Vikunja #${task.id}) — ${reason}`);
  const text =
    (items.length === 1
      ? `Heads up — this needs you, so I'm pinging you directly:\n\n`
      : `Heads up — ${items.length} things need you, so I'm pinging you directly:\n\n`) +
    lines.join('\n') +
    `\n\nReply here and I'll take it from there.`;
  const channelId = await dmJesse(slackClient, ceoAgent, text);
  const now = new Date().toISOString();
  for (const { task } of items) {
    state.set(ENGINE_ID, `pinged.${task.id}`, now);
  }
  if (channelId) log(`immediate ping → Jesse (${items.length} item${items.length === 1 ? '' : 's'})`);
  else log('WARN: could not DM Jesse');
}

// ─── Work one actionable task ────────────────────────────────────────────────
async function workTask(task) {
  const haystack = `${task.title || ''} ${task.description || ''}`;
  const ownerId = tasks.routeAgent(haystack);
  const owner = AGENTS[ownerId] || AGENTS.execPM;

  // BACKOFF (Oct 5, 2026): If a LOOP task has failed with the same tool error
  // 3+ times in the last 4 hours, skip it instead of spamming the failure.
  // The tool is down; re-running every cycle just generates noise.
  const isLoopTask = /^LOOP:/i.test(task.title || '');
  if (isLoopTask) {
    const failKey = `toolFail.${task.id}`;
    const failures = state.get(ENGINE_ID, failKey) || [];
    const fourHoursAgo = Date.now() - 4 * 3600 * 1000;
    const recentFails = failures.filter(f => new Date(f.ts).getTime() > fourHoursAgo);
    if (recentFails.length >= 3) {
      // Check if they're all the same tool error
      const errors = recentFails.map(f => f.error);
      const sameError = errors.every(e => e === errors[0]);
      if (sameError) {
        log(`backing off task #${task.id}: same tool error 3x in 4h (${errors[0].slice(0, 60)})`);
        return; // Skip this cycle
      }
    }
  }

  log(`working task #${task.id} "${task.title}" as ${ownerId}`);

  // CONTRACT + LIFECYCLE (#724, Pillar 2): a task with a MACF-CONTRACT block
  // runs the state machine OPEN → CLAIMED → WORKING → VERIFYING → DONE /
  // BLOCKED, persisted per task.
  const contract = parseContract(task.description);
  if (!contract) {
    // FAIL-CLOSED (Oct 12, 2026 — #724, Phase 3): the legacy prose path is
    // deleted. An uncontracted task is never worked, never completed, and
    // never relayed — it stays open until triage stamps a contract on it.
    // The attempt is recorded so the picker backs off instead of spinning.
    log(`task #${task.id}: no MACF-CONTRACT — fail-closed, not worked (needs triage)`);
    recordAttempt(task.id, false);
    return;
  }
  const lcKey = `taskLifecycle.${task.id}`;
  let lifecycle = state.get(ENGINE_ID, lcKey) || { state: 'OPEN', attempts: 0, lastVerification: null };
  if (lifecycle.state === 'DONE' || lifecycle.state === 'BLOCKED') {
    log(`task #${task.id}: lifecycle is ${lifecycle.state} — not re-working`);
    return;
  }
  lifecycle = { ...lifecycle, state: 'WORKING' };
  state.set(ENGINE_ID, lcKey, lifecycle);
  const saveLifecycle = (patch) => {
    lifecycle = { ...lifecycle, ...patch };
    state.set(ENGINE_ID, lcKey, lifecycle);
  };

  const boundaries = `
HARD BOUNDARIES (never violate):
- Nothing is sent, published, posted publicly, bought, or charged without Jesse's explicit approval. Drafts stay drafts.
- You cannot spend money, use his accounts, or message anyone outside the team.
- If the task needs Jesse (his login, his card, his approval), do NOT do it — report exactly what he needs to do in one short step instead.
- Post your work to the team channel; it is internal until Jesse approves it.`;

  // Completion protocol: the typed-deliverable contract. The TASK-DONE
  // prose protocol is deleted — the model has no channel through which to
  // assert completion. US-104: structured verification failures from the
  // last attempt are fed forward as data.
  const completionProtocol = `
DELIVERABLE FORMAT (enforced by code): your final answer must be ONLY a JSON object matching schema "${contract.deliverable.schema}" — {"status": "produced", "summary": "<one-paragraph summary of what you did>", "artifactRefs": ["<sandbox paths you wrote>"], plus any schema-specific fields}. Prose, markdown, or tool-call text as the final answer is a failed attempt. Whether this task is done is decided by the engine verifying the contract's postconditions against the real world — nothing you write can mark it done. Do the work with tools first, then return the JSON.${lifecycle.lastVerification ? `\n\nPREVIOUS VERIFICATION FAILURES — your last attempt did not check out. Fix these:\n${JSON.stringify(lifecycle.lastVerification, null, 2)}` : ''}`;

  const context = `
You are working a task from the team's board as ${owner.slackName}.

Task #${task.id}: ${task.title}
${task.description ? `Details: ${task.description}` : ''}
${task.due_date ? `Due: ${task.due_date}` : ''}
${boundaries}

Do the work now. You have TOOLS — use them when the task needs real output, not just words. Check URLs, write files, build the artifact first, then report what you built.

Produce the concrete deliverable: research findings, a draft, analysis, code, a plan — whatever the task calls for, within the boundaries above.
Write it in the team's voice: direct, no fluff, no headers unless the deliverable needs them.

EVIDENCE (required, enforced by code): this task has a contract. The engine verifies the contract's postconditions against the real world (files on disk, live URLs, the receipts ledger) before the task can complete — claims in your summary are not evidence. Do the work with tools so the effects exist, then summarize them.

Do NOT narrate your process ("Let me check...", "I'm pulling...", "Here's my thinking"). Do the work with your tools, then write the deliverable directly. One short status line at most; the deliverable is the message.
${completionProtocol}
`.trim();

  let output;
  let toolResults = [];
  let generationFailure = null;
  const startChannel = await resolveChannelId(owner.primaryChannel).catch(() => null);
  try {
    // EXECUTION (#724): a contract naming a deterministic executor runs as
    // code (engine/executors) — mechanical steps receipted, the model
    // reachable only through the typed seam. Otherwise generateWithTools
    // gives the agent urlCheck/fileWrite/fileRead/fileList so tasks
    // produce real artifacts instead of narrated intent.
    let result;
    const executors = require('./executors');
    if (contract.executor && executors.has(contract.executor)) {
      result = await executors.dispatch(contract.executor, {
        task, contract, agentId: ownerId,
        postMessage: async ({ channel, text }) => {
          const cid = await resolveChannelId(channel).catch(() => null);
          if (!cid) throw new Error(`slack-poster: cannot resolve channel "${channel}"`);
          await postAs(ownerId, cid, text);
          return { ts: new Date().toISOString() };
        },
      });
      result.toolResults = result.toolResults || [];
    } else {
      result = await generateWithTools({
        systemPrompt: owner.systemPrompt, context, maxTokens: 2000, agentId: ownerId, taskId: task.id,
        outputSchema: getSchema(contract.deliverable.schema), schemaName: contract.deliverable.schema,
      });
    }
    output = result.response;
    toolResults = result.toolResults || [];
    // STRUCTURAL FAILURE (Oct 12, 2026 — #724): generateWithTools returns
    // ok:false when the attempt failed in code — repeated invalid tool
    // input, or a "deliverable" that was role-played tool-call text. That
    // is a failed attempt, never a deliverable: no post, no relay, no
    // audit of empty output. (This is the break that queued fabricated
    // tool calls as deliverables for tasks 230/711/271/234/235.)
    if (result.ok === false) {
      generationFailure = result.errorClass || 'generation_failed';
      output = null;
    }
    // TOOL AUDIT (Oct 12, 2026 — Jesse's order, Vikunja #722): audit the RAW
    // output the second generation completes, before sanitization strips the
    // evidence. Catches narration-instead-of-tools, tool-call-as-text leaks,
    // and tool failures; fixable failures are repaired on the spot.
    try {
      const audit = generationFailure ? { findings: [] } : require('./toolUsageAuditor').auditGeneration({
        agentId: ownerId, taskId: task.id, taskTitle: task.title, taskDescription: task.description || '',
        via: 'generateWithTools', toolEvents: toolResults, rawOutput: output || '',
      });
      if (audit.findings.length) {
        log(`tool audit task #${task.id}: ${audit.findings.map(f => `${f.type}${f.errorClass ? '/' + f.errorClass : ''}${f.autoFix && f.autoFix.fixed ? ' [auto-fixed]' : ''}`).join(', ')}`);
      }
    } catch (e) { log('tool audit failed (non-fatal):', e.message); }
  } catch (err) {
    log(`LLM error on task #${task.id}:`, err.message);
    // FIX (Oct 2, 2026): Never post "On it" without a follow-up. If the LLM
    // fails, report the failure instead of going silent.
    if (startChannel) {
      await postAs(ownerId, startChannel,
        `[work engine → ${owner.slackName}] Task #${task.id}: ${task.title}\n\n` +
        `Hit an error while working this: ${err.message}. Logged; will retry after cooldown.`
      ).catch(e => log('failure post failed:', e.message));
    }
    // FIX (Oct 12, 2026 — starvation): record the attempt even on failure,
    // or this task is re-picked every cycle forever.
    recordAttempt(task.id, false);
    return;
  }
  if (generationFailure) {
    // Failed attempt (see the structural-failure note above): log + backoff
    // only. No Slack post, no relay — there is no deliverable.
    log(`task #${task.id}: generation failed validation (${generationFailure}) — attempt recorded, no deliverable posted`);
    if (contract) {
      // Contracted: the failure counts toward the lifecycle attempt budget
      // and feeds forward as structured data (US-104).
      const failures = [{ type: 'deliverable_schema', satisfied: false, observed: generationFailure }];
      const attempts = (lifecycle.attempts || 0) + 1;
      if (attempts >= (contract.maxAttempts || 3)) {
        saveLifecycle({ state: 'BLOCKED', attempts, lastVerification: failures });
        completion.recordVerificationBlocked({ taskId: task.id, agentId: ownerId, failures });
        log(`task #${task.id}: BLOCKED after ${attempts} attempts (${generationFailure})`);
      } else {
        saveLifecycle({ state: 'WORKING', attempts, lastVerification: failures });
      }
    }
    recordAttempt(task.id, false);
    return;
  }
  if (!output) {
    if (startChannel) {
      await postAs(ownerId, startChannel,
        `[work engine → ${owner.slackName}] Task #${task.id}: ${task.title}\n\n` +
        `No output generated. Logged; will retry after cooldown.`
      ).catch(e => log('empty post failed:', e.message));
    }
    recordAttempt(task.id, false);
    return;
  }
  // REMOVED (Oct 5, 2026): The "On it — digging in now" narration was pure noise.
  // Every task already gets a "[work engine → Agent] Task #X" post with the
  // actual deliverable below. The separate "On it" message added nothing but
  // ack-style clutter that the delivery learner correctly penalizes.

  // ─── Contracted path: VERIFYING → DONE / WORKING / BLOCKED (#724) ───────
  // The generation produced a schema-valid deliverable (or the attempt
  // would already have failed above). Completion is now decided ONLY by
  // verification against the world + the ledger. hasEvidence, TASK-DONE
  // parsing, and the sanitizers below do not exist on this path.
  if (contract) {
    saveLifecycle({ state: 'VERIFYING' });
    const outcome = await completion.completeVerifiedTask({ taskId: task.id, contract, agentId: ownerId });
    if (outcome.completed) {
      saveLifecycle({ state: 'DONE', completedAt: new Date().toISOString(), lastVerification: null });
      log(`task #${task.id} completed (verified: ${outcome.results.map(r => r.type).join(', ')})`);
      const channelId = await resolveChannelId(owner.primaryChannel).catch(() => null);
      if (channelId && output) {
        await postAs(ownerId, channelId,
          `[work engine → ${owner.slackName}] Task #${task.id}: ${task.title}\n\n${output}`
        ).catch(err => log('post failed:', err.message));
        state.set(ENGINE_ID, `lastDemo.${ownerId}`, new Date().toISOString());
        state.set(ENGINE_ID, `lastDemoTask.${ownerId}`, task.id);
      }
      await vikunja.addComment('execPM', task.id,
        `Work engine cycle (${new Date().toISOString()}):\n` +
        `Owner: ${owner.slackName}. Deliverable VERIFIED against contract postconditions ` +
        `(${outcome.results.map(r => `${r.type}=pass`).join(', ')}). Marked done by the completion verifier.`
      ).catch(err => log(`comment failed on #${task.id}:`, err.message));
      updateAgentHealth(ownerId, true);
      recordAttempt(task.id, true);
      if (output) {
        enqueueRelay({
          taskId: task.id, title: task.title, agent: ownerId,
          deliverable: output.slice(0, 2000), done: true, receiptBacked: true,
          ts: new Date().toISOString(),
        });
      }
      return;
    }
    // Verification failed: structured failures feed the next attempt.
    const attempts = (lifecycle.attempts || 0) + 1;
    const failTypes = outcome.failures.map(f => f.type).join(', ');
    if (attempts >= (contract.maxAttempts || 3)) {
      saveLifecycle({ state: 'BLOCKED', attempts, lastVerification: outcome.failures });
      completion.recordVerificationBlocked({ taskId: task.id, agentId: ownerId, failures: outcome.failures });
      log(`task #${task.id}: BLOCKED — verification failed after ${attempts} attempts (${failTypes})`);
      if (startChannel) {
        await postAs(ownerId, startChannel,
          `[work engine → ${owner.slackName}] Task #${task.id}: ${task.title}\n\n` +
          `Verification failed after ${attempts} attempts (${failTypes}) — task blocked for review. No deliverable was accepted.`
        ).catch(e => log('blocked post failed:', e.message));
      }
    } else {
      saveLifecycle({ state: 'WORKING', attempts, lastVerification: outcome.failures });
      log(`task #${task.id}: verification failed (${failTypes}) — attempt ${attempts}/${contract.maxAttempts || 3}, back to WORKING`);
      if (startChannel) {
        await postAs(ownerId, startChannel,
          `[work engine → ${owner.slackName}] Task #${task.id}: ${task.title}\n\n` +
          `Produced output did not verify yet (${failTypes}). Logged; will retry with the failure details next cycle.`
        ).catch(e => log('verify-fail post failed:', e.message));
      }
    }
    recordAttempt(task.id, false);
    return;
  }

  // LEGACY PATH DELETED (Oct 12, 2026 — #724, Phase 3): everything that
  // used to follow — TASK-DONE prose parsing, control-token sanitizers,
  // the hasEvidence() gate, and prose-based completion — is gone. Past
  // this point every task is contracted (uncontracted tasks fail closed
  // at the top of workTask) and the contracted branch above always
  // returns: DONE, WORKING, or BLOCKED, decided by verification.
}

// P0.3 relay queue: real task-linked deliverables awaiting relay to Jesse.
function enqueueRelay(item) {
  try {
    const queue = state.get(ENGINE_ID, 'relayQueue') || [];
    queue.push(item);
    state.set(ENGINE_ID, 'relayQueue', queue.slice(-50)); // cap: no unbounded growth
  } catch (e) {
    log('relay queue write failed:', e.message);
  }
}

function drainRelayQueue() {
  try {
    const queue = state.get(ENGINE_ID, 'relayQueue') || [];
    state.set(ENGINE_ID, 'relayQueue', []);
    return queue;
  } catch (e) {
    log('relay queue drain failed:', e.message);
    return [];
  }
}

// ─── Idle mode: invent revenue / improvement work ────────────────────────────
async function idleProposal() {
  const lastProposal = state.get(ENGINE_ID, 'lastIdleProposal');
  if (hoursSince(lastProposal) < IDLE_PROPOSAL_HOURS) return;

  const past = state.get(ENGINE_ID, 'pastProposals') || [];
  const execPM = AGENTS.execPM;

  const context = `
The task board has no actionable work right now. A real company doesn't idle — it invents growth.

${CEO_CHARTER}

Propose ONE concrete revenue play or team improvement for Jesse Stay's world:
- Jesse runs social media consulting (Stay N Alive LLC), is becoming the go-to Muse/Meta expert, and is building Bacon (a Meta-Muse desktop tool).
- Past proposals (do NOT repeat): ${past.length ? past.join(' | ') : 'none yet'}

Write the proposal as a short internal pitch: what it is, why it could make money or make the team stronger, the first concrete step, and what (if anything) it needs from Jesse. Keep it draft-only — nothing will be sent, published, or bought without his approval.

End with one line exactly: PROPOSAL-TITLE: <short title>
`.trim();

  let output;
  try {
    output = await generateReport({ systemPrompt: execPM.systemPrompt, context, maxTokens: 1200 });
  } catch (err) {
    log('idle proposal LLM error:', err.message);
    return;
  }
  if (!output) return;

  const titleMatch = output.match(/PROPOSAL-TITLE:\s*(.+)/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled proposal';
  const body = output.replace(/PROPOSAL-TITLE:.*$/gim, '').trim();

  // Turn the proposal into a real board task so the engine picks it up next.
  let newTaskId = null;
  try {
    const created = await vikunja.createTask('execPM', VIKUNJA.projectId, {
      title: `IDEA: ${title}`,
      description: `${body}\n\n— proposed by the work engine (idle mode). Draft-only; nothing sent/published/bought without Jesse's approval.`,
      priority: vikunja.PRIORITY ? vikunja.PRIORITY.NORMAL : 0,
    });
    newTaskId = created && created.id;
  } catch (err) {
    log('idea task creation failed:', err.message);
  }

  const channelId = await resolveChannelId(CHANNELS.management).catch(() => null);
  if (channelId) {
    await postAs('execPM', channelId,
      `💡 *Idle-time proposal* (board was clear — the team doesn't idle):\n\n*${title}*\n\n${body}\n\n` +
      (newTaskId ? `Tracked as Vikunja #${newTaskId} — draft-only until approved.` : `Couldn't create the tracking task — flagging here instead.`)
    ).catch(err => log('proposal post failed:', err.message));
  }

  state.set(ENGINE_ID, 'lastIdleProposal', new Date().toISOString());
  state.set(ENGINE_ID, 'pastProposals', [...past, title].slice(-30));
  log(`idle proposal: "${title}"`);
}

// ─── One engine cycle ────────────────────────────────────────────────────────
let cycleInFlight = false;

async function runCycle() {
  // FIX (Oct 12, 2026): overlap guard. Two schedulers (native interval +
  // Hatchet engine-tick) were double-driving cycles with no mutex — the same
  // task could be picked twice concurrently (duplicate LLM spend, duplicate
  // Slack posts, distorted strike counts). Fail closed: a tick that arrives
  // mid-cycle skips.
  if (cycleInFlight) {
    log('previous cycle still in flight — skipping overlapping tick');
    return;
  }
  cycleInFlight = true;
  try {
  if (!slackClient) {
    log('no Slack client yet — skipping cycle');
    return;
  }
  if (!tasks.isEnabled()) {
    log('Vikunja not configured — skipping cycle');
    return;
  }

  // Single-instance: only the lock holder works. Everyone else stands down
  // BEFORE touching the board, Slack, or Jesse. The holder is passed
  // explicitly ('<hostname>:<pid>') so lock ownership is auditable.
  const holdsLock = await acquireLock({ holderId: lockHolderId() }).catch(err => {
    log('lock error (fail closed):', err.message);
    return false;
  });
  if (!holdsLock) {
    log('lock held elsewhere — standing down this cycle');
    return;
  }

  // Scan BOTH the MACF board (VIKUNJA_PROJECT_ID) and the Revenue Sprint
  // board (16). FIX (Oct 3, 2026): the cycle only ever scanned project 2,
  // so every Revenue Sprint task (#80, #81, #85, #87, #150, …) went 100h+
  // without a substantive update — the team monitor flagged them
  // critical-stale while the engine insisted it was healthy. Task ids are
  // unique across projects, so downstream state keys are unaffected.
  const PROJECT_IDS = [...new Set([VIKUNJA.projectId, 16].filter(Boolean))];
  let rawLists;
  try {
    rawLists = [];
    for (const pid of PROJECT_IDS) {
      const r = await vikunja.listTasks('execPM', pid, {
        filter: 'done = false', sortBy: 'priority', orderBy: 'desc', perPage: 50,
      });
      rawLists.push(Array.isArray(r) ? r : (r && r.tasks) || []);
    }
  } catch (err) {
    log('could not list tasks:', err.message);
    return;
  }
  const open = rawLists.flat()
    .filter(t => !t.done && !isLockTask(t));
  log(`cycle: ${open.length} open tasks across projects [${PROJECT_IDS.join(',')}]`);

  // 1. Jesse-gated items → immediate ping (one DM per cycle, first sighting;
  // re-ping only when time-critical and last ping was 24h+ ago).
  const toPing = [];
  for (const task of open) {
    if (!isJesseGated(task)) continue;
    const pingedAt = state.get(ENGINE_ID, `pinged.${task.id}`);
    if (!pingedAt) {
      toPing.push({ task, reason: 'needs your login, approval, or payment' });
    } else if (isTimeCritical(task) && hoursSince(pingedAt) > 24) {
      toPing.push({ task, reason: 'still blocked on you and time-critical' });
    }
  }
  if (toPing.length) {
    await pingJesse(toPing).catch(err => log('pingJesse error:', err.message));
  }

  // 1b. No LLM on this host → watch mode. Gated pings (above) are the
  // critical job and they're done; task work and idle proposals both need
  // the model, so skip them. The desktop engine (which holds the API key)
  // does the heavy lifting whenever it's live — the lock hands off cleanly.
  if (!llmConfigured()) {
    log('no LLM on this host — watch mode: gated pings sent, skipping task work');
    return;
  }

  // 2. Work the top actionable task (dormant and Jesse-gated excluded).
  // PRIORITIZATION (Oct 5, 2026): Sort stale-first. The old code used
  // .find() which grabbed the first unworked task in Vikunja's return order —
  // tasks at the end of the list (#85, #87) were starved indefinitely.
  // Now: oldest-updated first, so stale tasks get priority.
  const actionable = open.filter(t => !isJesseGated(t) && !isDormant(t));
  actionable.sort((a, b) => {
    // Vikunja API uses 'updated', not 'updated_at'
    const aUpdated = new Date(a.updated || a.updated_at || 0).getTime();
    const bUpdated = new Date(b.updated || b.updated_at || 0).getTime();
    return aUpdated - bUpdated; // Oldest first
  });
  const isEligible = (t) => {
    // FIX (Oct 12, 2026 — starvation): a task that failed 3x in 4h is parked;
    // without this, one poisoned task blocks the whole backlog forever.
    if (isParked(t.id)) return false;
    const last = state.get(ENGINE_ID, `lastWorked.${t.id}`);
    if (!last) return true;
    // High-priority work gets revisited sooner.
    const cooldown = (t.priority || 0) >= 3 ? 2 : WORK_COOLDOWN_HOURS;
    return hoursSince(last) >= cooldown;
  };
  // P1.6 (Oct 12, 2026 — WIP cap): revenue-focus tasks get the first slots
  // every cycle, stalest first within the lane.
  // CONTRACT LANE (Oct 12, 2026 — #724 acceptance fix): since Phase 3, only
  // contracted tasks can complete — uncontracted ones fail closed. Picking
  // purely stalest-first would starve every contracted task behind the
  // legacy backlog (one refused task per cycle, re-entering on cooldown
  // still sorted ahead). Prefer the stalest eligible CONTRACTED task; fall
  // back to the stalest eligible task overall so fail-closed pressure and
  // attempt backoff on the legacy backlog are preserved.
  const candidate = actionable.find(t => REVENUE_FOCUS.has(t.id) && isEligible(t))
    || actionable.find(t => isEligible(t) && !!parseContract(t.description))
    || actionable.find(t => isEligible(t));

  if (candidate) {
    await workTask(candidate).catch(err => log('workTask error:', err.message));
    return;
  }

  // 3. Nothing actionable → idle mode: invent revenue / improvement work.
  log('no actionable tasks — entering idle proposal mode');
  await idleProposal().catch(err => log('idleProposal error:', err.message));
  } finally {
    cycleInFlight = false;
  }
}

// ─── Service lifecycle ───────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  if (!ENABLED) {
    log('disabled via WORK_ENGINE_ENABLED=0');
    return;
  }
  // FIX (Oct 12, 2026): in Hatchet mode the engine-tick cron owns scheduling —
  // starting the native 30-min interval here DOUBLE-DRIVES runCycle (two
  // interleaved schedules, no overlap guard, 2x LLM spend, duplicate picks).
  // Pass startTimer:false when Hatchet drives the cycle.
  if (app.startTimer === false) {
    log('client set — native timer disabled (Hatchet drives cycles)');
    return;
  }
  log(`starting — cycle every ${CYCLE_MIN} min (first run in 90s)`);

  // First cycle shortly after boot so the bot is connected; then on interval.
  setTimeout(() => {
    runCycle().catch(err => log('cycle error:', err.message));
  }, 90_000);

  timer = setInterval(() => {
    runCycle().catch(err => log('cycle error:', err.message));
  }, CYCLE_MIN * 60_000);

  // Keep the process alive as a service: the cycle interval must stay
  // ref'd so the event loop never drains. (Never unref() it — an unref'd
  // timer lets Node exit once the first cycle finishes.)
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  log('stopped');
}

module.exports = { init, stop, runCycle, workTask, isJesseGated, isDormant, isTimeCritical, updateAgentHealth, recordAttempt, isParked, enqueueRelay, drainRelayQueue };
