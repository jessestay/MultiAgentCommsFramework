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
const { generateReport, isConfigured: llmConfigured } = require('../utils/anthropic');
const { dmJesse } = require('../utils/dm');
const state = require('../utils/state');
const { acquireLock, isLockTask, holderId: lockHolderId } = require('./lock');

const ENGINE_ID = 'workEngine';
const CYCLE_MIN = parseInt(process.env.WORK_ENGINE_CYCLE_MIN || '30', 10);
const WORK_COOLDOWN_HOURS = parseInt(process.env.WORK_ENGINE_COOLDOWN_H || '6', 10);
const IDLE_PROPOSAL_HOURS = parseInt(process.env.WORK_ENGINE_IDLE_PROPOSAL_H || '12', 10);
const ENABLED = (process.env.WORK_ENGINE_ENABLED || '1') === '1';

let slackClient = null;
let timer = null;

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
  await slackClient.chat.postMessage({
    channel: channelId,
    text,
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

  log(`working task #${task.id} "${task.title}" as ${ownerId}`);

  const boundaries = `
HARD BOUNDARIES (never violate):
- Nothing is sent, published, posted publicly, bought, or charged without Jesse's explicit approval. Drafts stay drafts.
- You cannot spend money, use his accounts, or message anyone outside the team.
- If the task needs Jesse (his login, his card, his approval), do NOT do it — report exactly what he needs to do in one short step instead.
- Post your work to the team channel; it is internal until Jesse approves it.`;

  const context = `
You are working a task from the team's board as ${owner.slackName}.

Task #${task.id}: ${task.title}
${task.description ? `Details: ${task.description}` : ''}
${task.due_date ? `Due: ${task.due_date}` : ''}
${boundaries}

Do the work now. Produce the concrete deliverable: research findings, a draft, analysis, code, a plan — whatever the task calls for, within the boundaries above.
Write it in the team's voice: direct, no fluff, no headers unless the deliverable needs them.

After the deliverable, on its own final line, write exactly one of:
TASK-DONE: YES — <one line why no Jesse approval is needed>
TASK-DONE: NO — <one line: what still needs Jesse or what remains>
`.trim();

  let output;
  try {
    output = await generateReport({ systemPrompt: owner.systemPrompt, context, maxTokens: 2000 });
  } catch (err) {
    log(`LLM error on task #${task.id}:`, err.message);
    return;
  }
  if (!output) return;

  const doneMatch = output.match(/TASK-DONE:\s*(YES|NO)\s*[—-]\s*(.+)/i);
  const deliverable = output.replace(/TASK-DONE:.*$/gim, '').trim();
  const doneYes = doneMatch && doneMatch[1].toUpperCase() === 'YES';
  const doneWhy = doneMatch ? doneMatch[2].trim() : '';

  // Post the deliverable to the owner's channel.
  const channelId = await resolveChannelId(owner.primaryChannel).catch(() => null);
  if (channelId && deliverable) {
    await postAs(ownerId, channelId,
      `[work engine → ${owner.slackName}] Task #${task.id}: ${task.title}\n\n${deliverable}`
    ).catch(err => log('post failed:', err.message));
  }

  // Record progress on the task itself.
  const comment =
    `Work engine cycle (${new Date().toISOString()}):\n` +
    `Owner: ${owner.slackName}. Deliverable posted to #${owner.primaryChannel}.\n` +
    (doneYes ? `Marked done: ${doneWhy}` : `Still open: ${doneWhy || 'needs follow-up'}`);
  await vikunja.addComment('execPM', task.id, comment).catch(err =>
    log(`comment failed on #${task.id}:`, err.message));

  if (doneYes) {
    await vikunja.completeTask('execPM', task.id).catch(err =>
      log(`complete failed on #${task.id}:`, err.message));
    log(`task #${task.id} completed`);
  }

  state.set(ENGINE_ID, `lastWorked.${task.id}`, new Date().toISOString());
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
async function runCycle() {
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

  let raw;
  try {
    raw = await vikunja.listTasks('execPM', VIKUNJA.projectId, {
      filter: 'done = false', sortBy: 'priority', orderBy: 'desc', perPage: 50,
    });
  } catch (err) {
    log('could not list tasks:', err.message);
    return;
  }
  const open = (Array.isArray(raw) ? raw : (raw && raw.tasks) || [])
    .filter(t => !t.done && !isLockTask(t));
  log(`cycle: ${open.length} open tasks`);

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
  const actionable = open.filter(t => !isJesseGated(t));
  const candidate = actionable.find(t => {
    const last = state.get(ENGINE_ID, `lastWorked.${t.id}`);
    if (!last) return true;
    // High-priority work gets revisited sooner.
    const cooldown = (t.priority || 0) >= 3 ? 2 : WORK_COOLDOWN_HOURS;
    return hoursSince(last) >= cooldown;
  });

  if (candidate) {
    await workTask(candidate).catch(err => log('workTask error:', err.message));
    return;
  }

  // 3. Nothing actionable → idle mode: invent revenue / improvement work.
  log('no actionable tasks — entering idle proposal mode');
  await idleProposal().catch(err => log('idleProposal error:', err.message));
}

// ─── Service lifecycle ───────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  if (!ENABLED) {
    log('disabled via WORK_ENGINE_ENABLED=0');
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

module.exports = { init, stop, runCycle, isJesseGated, isDormant, isTimeCritical };
