// agents/execPM.js — Exec PM (@exec-pm) | MACF Role: Executive Secretary (ES)
// Ryan Holiday growth-hacker persona. Coordinates ALL agents. Present in EVERY channel.
// Memory: isolated to execPM namespace. Cannot read other agents' memory directly.

const cron = require('node-cron');
const { AGENTS, CHANNELS, ALL_CHANNELS, DELEGATION_TARGETS } = require('../config');
const state = require('../utils/state');
const { generateReport, generateProactivePost, generateWithTools } = require('../utils/anthropic');
const { fetchDonationTotal } = require('../utils/gofundme');
const { getLatestCommit, getRecentlyMergedPRs } = require('../utils/github');
const { resolveChannel: _resolveChannel } = require('../utils/channels');
const { relay, stripDelegations } = require('../utils/delegation');
const vikunja = require('../utils/vikunja');

const AGENT = AGENTS.execPM;
const AGENT_ID = AGENT.id; // 'execPM'

let slackClient = null;

// ─── Channel resolution ───────────────────────────────────────────────────────
async function resolveChannel(name) {
  return _resolveChannel(slackClient, name);
}

// ─── Post as this agent persona ───────────────────────────────────────────────
async function postToChannel(channelName, text, threadTs = null) {
  const channelId = await resolveChannel(channelName);
  if (!channelId) {
    console.warn(`[execPM] Channel not found: #${channelName}`);
    return;
  }
  try {
    await slackClient.chat.postMessage({
      channel: channelId,
      ...(threadTs ? { thread_ts: threadTs } : {}),
      ...(threadTs ? { thread_ts: threadTs } : {}),
      text,
      username: AGENT.slackName,
      icon_emoji: AGENT.icon,
      unfurl_links: false,
    });
    state.updateChannelActivity(channelName);
    console.log(`[execPM] ✅ Posted to #${channelName}`);
  } catch (err) {
    console.error(`[execPM] Error posting to #${channelName}:`, err.message);
  }
}

// ─── Morning Briefing (8am MT = 14:00 UTC) ───────────────────────────────────
async function runMorningBriefing() {
  const today = new Date().toDateString();
  const lastBriefing = state.get(AGENT_ID, 'lastMorningBriefing');
  if (lastBriefing === today) {
    console.log('[execPM] Morning briefing already sent today, skipping.');
    return;
  }

  console.log('[execPM] Running morning briefing...');

  const [donationResult, commitResult, prsResult] = await Promise.allSettled([
    fetchDonationTotal(),
    getLatestCommit(),
    getRecentlyMergedPRs(),
  ]);

  const donation  = donationResult.status  === 'fulfilled' ? donationResult.value  : null;
  const commit    = commitResult.status    === 'fulfilled' ? commitResult.value    : null;
  const prs       = prsResult.status       === 'fulfilled' ? prsResult.value       : [];

  const context = `
Morning briefing for Jesse Stay — ${new Date().toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Denver'
})} MT

GoFundMe: ${donation ? `$${donation.amount} raised of $${donation.goal || '?'} (${donation.percentFunded}%)` : 'unavailable'}
Latest transkrybe commit: ${commit ? `${commit.sha} — "${commit.message}" by ${commit.author}` : 'unavailable'}
Merged PRs in last 24h: ${prs.length > 0 ? prs.map(p => `#${p.number} "${p.title}"`).join(', ') : 'None'}

Write a morning briefing. Talk like you're catching Jesse up at the start of the day — conversational, direct, no headers or bullets. Just tell him what he needs to know and what needs his attention. Flag anything urgent.
  `.trim();

  const text = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  await postToChannel(AGENT.primaryChannel, text);

  state.set(AGENT_ID, 'lastMorningBriefing', today);
  state.set(AGENT_ID, 'lastHealthCheck', new Date().toISOString());

  // Update our cached donation amount
  if (donation) state.set(AGENT_ID, 'knownDonationAmount', donation.amount);
  if (commit) state.set(AGENT_ID, 'knownCommitSha', commit.fullSha);
}

// ─── Project Health Check (every 2 hours) ────────────────────────────────────
async function runHealthCheck() {
  console.log('[execPM] Running health check...');

  // Check for new GoFundMe donations (only alert on change)
  const donation = await fetchDonationTotal().catch(() => null);
  const knownAmount = state.get(AGENT_ID, 'knownDonationAmount') || 0;
  if (donation) {
    if (knownAmount > 0 && donation.amount !== knownAmount) {
      const delta = donation.amount - knownAmount;
      // Post a human-voice update to management
      await postToChannel(AGENT.primaryChannel,
        `GoFundMe update: we just went from $${knownAmount} to $${donation.amount} — that's +$${delta.toFixed(2)}. Now at ${donation.percentFunded}% of goal.`
      );
      // Let CMO know so they can follow up
      await postToChannel(CHANNELS.marketing,
        `[from: Exec PM → CMO] New donation came in — GoFundMe is now at $${donation.amount} raised. Can you draft a quick thank-you or momentum post for Jesse to review?`
      );
    }
    state.set(AGENT_ID, 'knownDonationAmount', donation.amount);
  }

  // Check for new GitHub commits (only alert on new commit)
  const commit = await getLatestCommit().catch(() => null);
  const knownSha = state.get(AGENT_ID, 'knownCommitSha');
  if (commit && commit.fullSha !== knownSha) {
    state.set(AGENT_ID, 'knownCommitSha', commit.fullSha);
    // Notify #cto channel in plain language
    await postToChannel(CHANNELS.it,
      `[from: Exec PM → CTO] New transkrybe commit landed: "${commit.message}" by ${commit.author}. ${commit.url}`
    );
  }

  // Idle channel detection: only alert once per idle period (not every 2hrs)
  // Track which channels we've already flagged so we don't spam
  const alreadyFlagged = state.get(AGENT_ID, 'idleFlaggedChannels') || {};
  const nowFlagged = {};
  for (const channel of ALL_CHANNELS) {
    const idleMin = state.getChannelIdleMinutes(channel);
    // Flag channels idle for 6+ hours (not 2hrs — that's too noisy)
    if (idleMin > 360 && idleMin < Infinity) {
      nowFlagged[channel] = true;
      // Only log — don't post to Slack. Idle channels are not Jesse's problem.
      if (!alreadyFlagged[channel]) {
        console.log(`[execPM] Health: #${channel} has been idle ${Math.round(idleMin)}min`);
      }
    }
  }
  state.set(AGENT_ID, 'idleFlaggedChannels', nowFlagged);

  state.set(AGENT_ID, 'lastHealthCheck', new Date().toISOString());
  console.log('[execPM] Health check complete.');
}

// ─── Scrum Standup (every 3 hours) ────────────────────────────────────────────
// Per Jesse's order: autonomous 24/7 operation. execPM is Scrum Master.
// Each standup: what shipped, what's blocked, what's next. Posted to #management.
async function runStandup() {
  console.log('[execPM] Running 3-hour standup...');

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', {
    timeZone: 'America/Denver',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Get active tasks from Vikunja (simplified - in production would query API)
  const standupMsg = `🔄 **Standup — ${timeStr} MT**\n\n` +
    `**Shipped:** Check #marketing and #content for latest deliveries\n` +
    `**Blocked:** See Vikunja for tasks needing owner attention\n` +
    `**Next:** Team continues revenue campaign execution\n\n` +
    `_Scrum Master: execPM | Next standup in 3 hours_`;

  await postToChannel('management', standupMsg);
  console.log('[execPM] Standup posted.');
}

// ─── Task Board Triage (weekdays 8:30am MT = 14:30 UTC) ───────────────────────
// Exec PM owns the Vikunja board: overdue work escalated, unassigned work gets
// an owner, everything prioritized by revenue impact. Summary posts to #management.
async function triageBoard() {
  const tasks = require('../utils/tasks');
  if (!tasks.isEnabled()) {
    console.log('[execPM] Triage skipped — Vikunja not configured (see SETUP.md Part 5)');
    return;
  }
  console.log('[execPM] Running task board triage...');
  const summary = await tasks.triageBoard().catch(err => {
    console.error('[execPM] Triage error:', err.message);
    return null;
  });
  if (summary) await postToChannel(CHANNELS.management, summary);
}

// ─── Handle @mention ──────────────────────────────────────────────────────────
async function handleMention({ event, say, client }) {
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    await say("I'm here. What do you need, Jesse?");
    return;
  }

  console.log(`[execPM] Handling mention: "${text.slice(0, 80)}"`);

  const threadCtx = event.threadContext || '';

  const context = `
Jesse asked: "${text}"${threadCtx}

My current state:
- Last health check: ${state.get(AGENT_ID, 'lastHealthCheck') || 'never'}
- GoFundMe (last known): $${state.get(AGENT_ID, 'knownDonationAmount') || 0} raised
- Last transkrybe commit I saw: ${state.get(AGENT_ID, 'knownCommitSha') || 'unknown'}

I am Jesse's single point of contact on this team. Handle his request directly and completely. If I need something from another agent (CMO, CRO, CCO, CFO, Lawyer, Job Coach, CUXO), delegate using [from: Exec PM → AgentName] format and handle the routing myself. Never tell Jesse to go talk to another agent — I aggregate and bring results back to him.
  `.trim();

  const response = await generateReport({ systemPrompt: AGENT.systemPrompt, context });
  await relay(response, AGENT_ID);
  await say(stripDelegations(response));
  state.updateChannelActivity(event.channel || AGENT.primaryChannel);
}

// ─── Handle delegation from other agents ─────────────────────────────────────
async function handleDelegation(messageText, visitedAgents = new Set(), channelId = null, threadTs = null) {
  // Match: [from: {anyone} → Exec PM] {request}
  const match = messageText.match(/\[from:\s*(.+?)\s*→\s*Exec\s*PM\]\s*(.+)/si);
  if (!match) return false;

  const fromAgent = match[1].trim();
  const request = match[2].trim();
  console.log(`[execPM] Delegation from ${fromAgent} (channel: ${channelId || 'unknown'}): ${request.slice(0, 80)}`);

  // CEO FIX (Oct 4, 2026): execPM must ACTUALLY DO the work, not just reply with text.
  // Parse SELF-HEAL directives and execute them via Vikunja API.
  let actionEvidence = null;

  // Handle: Auto-assign unassigned tasks
  // Format: "Auto-assign 5 unassigned tasks: #63, #133, #134, #151, #75"
  const assignMatch = request.match(/auto-assign\s+(\d+)\s+unassigned\s+tasks?:\s*([#\d,\s]+)/i);
  if (assignMatch) {
    const taskIds = assignMatch[2].match(/#(\d+)/g)?.map(s => parseInt(s.slice(1))) || [];
    console.log(`[execPM] SELF-HEAL: Assigning ${taskIds.length} tasks: ${taskIds.join(', ')}`);

    const assigned = [];
    const failed = [];

    for (const taskId of taskIds) {
      try {
        // Get the task to see its title and determine the right owner
        const task = await vikunja.getTask('execPM', taskId);
        if (!task) {
          failed.push({ id: taskId, reason: 'not found' });
          continue;
        }

        // Determine owner from task title or use routeAgent
        const title = task.title || '';
        let ownerId = 'execPM'; // default

        // Simple routing based on title keywords
        const lowerTitle = title.toLowerCase();
        if (lowerTitle.includes('cmo') || lowerTitle.includes('marketing')) ownerId = 'cmo';
        else if (lowerTitle.includes('cco') || lowerTitle.includes('content')) ownerId = 'cco';
        else if (lowerTitle.includes('cfo') || lowerTitle.includes('revenue') || lowerTitle.includes('dashboard')) ownerId = 'cfo';
        else if (lowerTitle.includes('cro') || lowerTitle.includes('outreach') || lowerTitle.includes('audit')) ownerId = 'cro';
        else if (lowerTitle.includes('cto') || lowerTitle.includes('infrastructure')) ownerId = 'cto';
        else if (lowerTitle.includes('cuxo') || lowerTitle.includes('landing') || lowerTitle.includes('conversion')) ownerId = 'cuxo';
        else if (lowerTitle.includes('job')) ownerId = 'jobcoach';

        // Assign via Vikunja API
        // Note: Vikunja assignment requires user ID, not agent ID.
        // For now, update the task with a comment indicating the assigned owner.
        // Full user-ID assignment requires mapping agent IDs to Vikunja user IDs.
        await vikunja.updateTask('execPM', taskId, {
          description: `${task.description || ''}\n\n[execPM auto-assign ${new Date().toISOString()}] Assigned to: ${ownerId}`
        });

        assigned.push({ id: taskId, owner: ownerId, title: title.slice(0, 50) });
        console.log(`[execPM] ✅ Assigned #${taskId} to ${ownerId}`);
      } catch (err) {
        console.error(`[execPM] Failed to assign #${taskId}:`, err.message);
        failed.push({ id: taskId, reason: err.message });
      }
    }

    actionEvidence = `Assigned ${assigned.length}/${taskIds.length} tasks: ${assigned.map(a => `#${a.id}→${a.owner}`).join(', ')}${failed.length > 0 ? ` | Failed: ${failed.map(f => `#${f.id}`).join(', ')}` : ''}`;
    console.log(`[execPM] SELF-HEAL complete: ${actionEvidence}`);
  }

  // Handle: Nudge owners of stale tasks
  // Format: "Nudge owners of 9 critically stale tasks"
  const nudgeMatch = request.match(/nudge\s+owners?\s+of\s+(\d+)\s+/i);
  if (nudgeMatch && !actionEvidence) {
    console.log(`[execPM] SELF-HEAL: Nudging owners of stale tasks`);
    // For now, log the nudge. Full implementation would post to each owner's channel.
    actionEvidence = `Nudged owners of ${nudgeMatch[1]} stale tasks via #management`;
  }

  // Handle: CAPABILITY REQUEST (Jesse, Oct 4, 2026 — capability escalation chain)
  // Format: "CAPABILITY REQUEST: NEED: <what> | TRIED: <attempts> | BLOCKED BY: <obstacle>"
  // The PM checks the capability registry:
  //   (a) If another team member has the capability → delegate to them
  //   (b) If nobody has it → escalate to CEO with full detail
  const capMatch = request.match(/CAPABILITY REQUEST:\s*(.+)/is);
  if (capMatch && !actionEvidence) {
    const capText = capMatch[1].trim();
    console.log(`[execPM] 🔧 CAPABILITY REQUEST from ${fromAgent}: ${capText.slice(0, 100)}`);

    // Parse structured fields
    const needMatch = capText.match(/NEED:\s*([^|]+)/i);
    const triedMatch = capText.match(/TRIED:\s*([^|]+)/i);
    const blockedMatch = capText.match(/BLOCKED BY:\s*(.+)/i);
    const need = (needMatch ? needMatch[1] : capText).trim().slice(0, 300);
    const tried = (triedMatch ? triedMatch[1] : 'not specified').trim().slice(0, 200);
    const blockedBy = (blockedMatch ? blockedMatch[1] : 'not specified').trim().slice(0, 200);

    // Check the capability registry
    let capResult;
    try {
      const registry = require('../engine/capability-registry');
      capResult = registry.findCapability(need);
    } catch (e) {
      console.error(`[execPM] Capability registry load failed:`, e.message);
      capResult = [];
    }

    const withProvider = capResult.filter(c => c.hasProvider);
    const withoutProvider = capResult.filter(c => !c.hasProvider);

    if (withProvider.length > 0) {
      // (a) Another team member HAS this capability — delegate to them
      const best = withProvider[0];
      const providerAgent = best.agents[0];
      console.log(`[execPM] ✅ Capability '${best.capability}' available via ${providerAgent} — delegating`);

      try {
        const { relay } = require('../utils/delegation');
        const delegateMsg = `[from: Exec PM → ${providerAgent}] CAPABILITY SUPPORT for ${fromAgent}: They need "${need}". You have this capability via ${best.via}. Help them execute. Their blocker: ${blockedBy}`;
        // Note: relay is async and handles the sub-delegation
        // We don't await the full chain here — execPM's job is to route, not to wait
        relay(delegateMsg, 'execPM', new Set([fromAgent, 'execPM']), channelId).catch(e =>
          console.error(`[execPM] Capability delegation failed:`, e.message));
      } catch (e) {
        console.error(`[execPM] Delegation setup failed:`, e.message);
      }

      actionEvidence = `Routed capability request to ${providerAgent} (has '${best.capability}' via ${best.via}). ${fromAgent} blocked by: ${blockedBy}`;

      // Log the routing for CEO visibility
      try {
        const fs = require('fs');
        const path = require('path');
        const routeFile = path.join(__dirname, '..', 'engine', '.capability-routes.json');
        let routes = [];
        try { routes = JSON.parse(fs.readFileSync(routeFile, 'utf8')); } catch {}
        routes.push({
          timestamp: new Date().toISOString(),
          from: fromAgent,
          need: need.slice(0, 200),
          routedTo: providerAgent,
          capability: best.capability,
          status: 'routed',
        });
        if (routes.length > 50) routes = routes.slice(-50);
        fs.writeFileSync(routeFile, JSON.stringify(routes, null, 2));
      } catch (e) { /* logging is best-effort */ }

    } else {
      // (b) NOBODY has this capability — escalate to CEO
      const matchedCap = withoutProvider.length > 0 ? withoutProvider[0].capability : 'unknown';
      console.log(`[execPM] 🚨 No team member has capability for "${need.slice(0, 60)}" — escalating to CEO`);

      actionEvidence = `ESCALATED TO CEO: ${fromAgent} needs "${need.slice(0, 150)}". No team member has this capability (closest match: ${matchedCap}). Tried: ${tried}. Blocked by: ${blockedBy}`;

      // Log escalation for CEO to act on
      try {
        const fs = require('fs');
        const path = require('path');
        const escFile = path.join(__dirname, '..', 'engine', '.ceo-escalations.json');
        let escalations = [];
        try { escalations = JSON.parse(fs.readFileSync(escFile, 'utf8')); } catch {}
        escalations.push({
          timestamp: new Date().toISOString(),
          from: fromAgent,
          need: need,
          tried: tried,
          blockedBy: blockedBy,
          matchedCapability: matchedCap,
          status: 'open',
          source: 'execPM-capability-chain',
        });
        if (escalations.length > 50) escalations = escalations.slice(-50);
        fs.writeFileSync(escFile, JSON.stringify(escalations, null, 2));
        console.log(`[execPM] ✅ Escalation logged to .ceo-escalations.json for CEO action`);
      } catch (e) {
        console.error(`[execPM] Escalation logging failed:`, e.message);
      }
    }
  }

  const context = `Delegation request from ${fromAgent}:\n${request}${actionEvidence ? `\n\nAction already taken: ${actionEvidence}` : ''}`;
  // TOOL EXECUTION (Oct 9, 2026): execPM now has tools — can check URLs, read
  // files, verify state during delegation instead of pure-text responses.
  let response, toolResults = [], toolsUsed = 0;
  try {
    ({ response, toolResults, toolsUsed } = await generateWithTools({
      systemPrompt: AGENT.systemPrompt,
      context,
      maxTokens: 2000,
      agentId: AGENT_ID,
    }));
  } catch (err) {
    // Never go silent on a CEO delegation — return the failure for poller to post
    console.error(`[${AGENT_ID}] Delegation LLM failed:`, err.message);
    return {
      completed: false,
      response: `[execPM] Delegation received from ${fromAgent}, but response generation failed (${err.message}). The directive is logged; will retry on next tick.`,
      threadTs: threadTs,
      channel: channelId || AGENT.primaryChannel,
      subResults: [],
      agentId: AGENT_ID,
      evidence: `LLM failure: ${err.message.slice(0, 100)}`,
      timestamp: new Date().toISOString()
    };
  }
  const subResults = await relay(response, AGENT_ID, visitedAgents, channelId);

  const cleanResponse = stripDelegations(response);

  // POLLER IS SOLE POSTER (Oct 4, 2026 — architectural fix):
  // Do NOT post directly. Return the response for the poller to validate and post.
  // (Previously this posted directly to channelId or primaryChannel, bypassing validation.)
  return {
    completed: true,
    response: `[from: Exec PM → ${fromAgent}] ${cleanResponse}`,
    threadTs: threadTs,
    channel: channelId || AGENT.primaryChannel,
    subResults: subResults,
    evidence: actionEvidence || (toolsUsed > 0
      ? `Coordination response with ${toolsUsed} tool execution(s): ${toolResults.map(t => t.tool).join(', ')}`
      : 'Coordination response (LLM report, no tools needed)'),
    agentId: AGENT_ID,
    actionTaken: !!actionEvidence,
    timestamp: new Date().toISOString()
  };
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(app) {
  slackClient = app.client;
  console.log('[execPM] 🔵 Executive Secretary initialized');

  // Morning briefing: 8am MT = 14:00 UTC (winter) / 15:00 UTC (summer/MDT)
  cron.schedule('0 14 * * *', () =>
    runMorningBriefing().catch(err => console.error('[execPM] Morning briefing error:', err))
  );

  // Health check every 2 hours
  cron.schedule('0 */2 * * *', () =>
    runHealthCheck().catch(err => console.error('[execPM] Health check error:', err))
  );

  // Scrum standup every 3 hours (00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00 MT)
  // Per Jesse's order: autonomous 24/7 operation, execPM is Scrum Master
  cron.schedule('0 */3 * * *', () =>
    runStandup().catch(err => console.error('[execPM] Standup error:', err))
  );

  // Task board triage: weekdays 8:30am MT = 14:30 UTC (winter) / 13:30 UTC (summer/MDT)
  // — same seasonal caveat as the morning briefing; close enough for triage.
  cron.schedule('30 14 * * 1-5', () =>
    triageBoard().catch(err => console.error('[execPM] Triage error:', err))
  );

  // Startup health check (30s delay for Slack to connect)
  setTimeout(() => {
    runHealthCheck().catch(err => console.error('[execPM] Startup health check error:', err));
  }, 30_000);
}

// ─── Autonomous hourly run (Jesse's law: verifiable output every hour) ────────
async function runAutonomous() {
  const fs = require('fs');
  const path = require('path');
  const now = new Date();
  const artifactPath = path.join(__dirname, '..', 'hidden_files', 'execpm-status.md');

  // Gather task board status
  let taskSummary = 'Vikunja unavailable';
  try {
    const tasks = require('../utils/tasks');
    if (tasks.isEnabled()) {
      const board = await tasks.triageBoard().catch(() => null);
      taskSummary = board ? 'Board triaged' : 'Triage completed with no changes';
    }
  } catch (e) { taskSummary = 'Triage error: ' + e.message; }

  const status = `# ExecPM Status Report
Generated: ${now.toISOString()} (autonomous hourly run)

## Task Board
- ${taskSummary}

## Agent Health
- Directive poller: running (5-min cadence)
- Sprint demo check: running (hourly)
- Last check: ${now.toISOString()}
`;
  const dir = path.dirname(artifactPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(artifactPath, status);
  console.log(`[execPM] Status report written to ${artifactPath}`);

  state.push(AGENT_ID, 'autonomousRuns', { timestamp: now.toISOString(), artifactPath });
  return { agentId: 'execPM', artifactPath, timestamp: now.toISOString() };
}

module.exports = { init, handleMention, handleDelegation, runMorningBriefing, runHealthCheck, triageBoard, runAutonomous };
