#!/usr/bin/env node
/**
 * MACF Scrum Standup — hourly team standup, execPM as scrum master.
 *
 * Jesse (Oct 10, 2026): "only daily stand up meetings of the team are to happen
 * hourly and should discuss what was accomplished and what each team member is
 * planning to do in the next hour."
 *
 * Follows Alistair Cockburn's Crystal Clear:
 * - Osmotic communication: standup posts in #management for all to see
 * - Focus: 3 questions only, no status theater
 * - Personal safety: blockers are system defects, not blame
 *
 * The 3 questions (adapted from traditional daily standup for hourly cadence):
 * 1. What did you accomplish in the last hour?
 * 2. What are you planning for the next hour?
 * 3. Any blockers?
 *
 * Data sources:
 * - .agent-health.json: what each agent demoed (accomplishments)
 * - Vikunja: active tasks per agent (plans)
 * - .engine-gaps.json: known blockers
 *
 * Output: posts standup summary to #management via Slack, logs to memory.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'scrum-config.json');
const HEALTH_PATH = path.join(__dirname, '.agent-health.json');
const GAPS_PATH = path.join(__dirname, '.engine-gaps.json');
const DEMO_STATE_PATH = path.join(__dirname, '.sprint-demo-state.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { standup: { enabled: true, interval_minutes: 60, scrum_master: 'execpm' } };
  }
}

function loadHealth() {
  try {
    return JSON.parse(fs.readFileSync(HEALTH_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function loadGaps() {
  try {
    return JSON.parse(fs.readFileSync(GAPS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function loadDemoState() {
  try {
    return JSON.parse(fs.readFileSync(DEMO_STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Build the standup report from agent health + gaps.
 * Returns { standup: [...], blockers: [...] }
 */
function buildStandup(health, gaps, config) {
  const agents = Object.keys(health).filter(a => !a.startsWith('_'));
  const standup = [];
  const blockers = [];

  for (const agent of agents) {
    const h = health[agent] || {};
    const lastActivity = h.lastActivity
      ? new Date(h.lastActivity).toLocaleString('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit' })
      : 'no recent activity';
    const completed = h.directivesCompleted || 0;
    const failed = h.directivesFailed || 0;
    const status = h.status || 'unknown';
    const verified = h.verifiedDeliveries || 0;
    const consecutiveFailures = h.consecutiveFailures || 0;
    const received = h.directivesReceived || 0;

    // Blocker detection — LIVE failures only (root fix Oct 11, 2026):
    // directivesFailed/directivesCompleted are LIFETIME cumulative counters that
    // never reset, so the old rule (status !== 'healthy' || lifetime rate > 0.5)
    // permanently flagged agents as blockers even when they were currently
    // healthy (cto: consecutiveFailures=0, recent directives succeeding; lawyer:
    // no new terminal outcomes in 19h). The self-healer already tracks
    // lifetime-cumulative AGENT_LOW_DELIVERY gaps separately, so the standup
    // now escalates only live problems: consecutive failures right now, or an
    // 'idle' agent that HAS been assigned work but never reached a terminal
    // outcome (idle with zero directives ever received is "no work", not a
    // blocker).
    const isBlocked = consecutiveFailures > 0
      || (status === 'idle' && received > 0);

    standup.push({
      agent,
      accomplished: `${completed} directives completed, ${verified} verified deliveries (last activity ${lastActivity})`,
      planning: `status: ${status}`,
      blockers: isBlocked ? `${status}, ${failed} failures — needs scrum master attention` : 'none',
    });

    if (isBlocked) {
      blockers.push(`${agent}: ${status}, ${failed} failed directives`);
    }
  }

  // Blocker aging: track how long blockers persist, escalate after 3 standups
  const agedBlockers = ageBlockers(blockers, config);
  for (const ab of agedBlockers) {
    if (ab.standupCount >= (config.blocker_aging?.escalate_after_standups || 3)) {
      blockers.push(`[ESCALATED] ${ab.blocker} — open for ${ab.standupCount} standups`);
    }
  }

  // Merge async standup submissions
  const asyncSubmissions = loadAsyncStandups(config);
  for (const sub of asyncSubmissions) {
    const existing = standup.find(s => s.agent === sub.agent);
    if (existing) {
      existing.accomplished += ` (async: ${sub.accomplished})`;
      existing.planning += ` (async: ${sub.planning})`;
    } else {
      standup.push({ ...sub, blockers: sub.blockers || 'none (async)' });
    }
  }

  // Add engine-level gaps as blockers.
  // Stale gaps (an agent demoed AFTER the gap was recorded) are skipped —
  // otherwise the standup reports blockers that no longer exist. (Oct 11, 2026:
  // the hourly demo check's gaps lagged behind real demos and produced false
  // "missing_hourly_demo" blockers for agents that had already demoed.)
  const demoState = loadDemoState();
  const lastDemo = (demoState && demoState.lastDemo) || {};
  const recentGaps = (Array.isArray(gaps) ? gaps : []).slice(-5);
  for (const g of recentGaps) {
    // Closed gaps are resolved — rendering them as blockers is a false
    // positive (Oct 11, 2026: 4 closed AGENT_MODULE_BROKEN gaps from the
    // HOME-env false-positive run showed up as live blockers). Legacy gap
    // records without a status field are still rendered.
    if (g.status === 'closed') continue;
    const gapTs = Date.parse(g.timestamp || '');
    // Gap records from the self-healer carry the agent only in the description
    // ("cto: CTO delivery rate 34% ..."), not in an `agent` field — without the
    // fallback below the supersede rule never fired for these gaps (Oct 11,
    // 2026: an open AGENT_LOW_DELIVERY gap kept rendering as a live standup
    // blocker even after cto had demoed). A description prefix that matches no
    // known demo key fails open (renders), so non-agent descriptions are safe.
    const gapAgent = g.agent || (/^([a-z0-9_]+)\s*:/i.exec(g.description || '') || [])[1];
    const demoTs = gapAgent && lastDemo[gapAgent] ? Date.parse(lastDemo[gapAgent]) : NaN;
    if (!Number.isNaN(gapTs) && !Number.isNaN(demoTs) && demoTs > gapTs) continue;
    // Gap records come from multiple writers with different schemas: the
    // self-healer writes {issueType, description}, qualityTrends writes
    // {type, message} (Oct 12, 2026: its rows rendered as empty "[engine]
    // gap: " lines on the standup). Support both schemas; unknown rows
    // still render (fail-open).
    blockers.push(`[engine] ${g.issueType || g.gapType || g.type || 'gap'}: ${(g.description || g.message || '').slice(0, 120)}`);
  }

  return { standup, blockers };
}

/**
 * Format standup for Slack #management post.
 */
function formatStandup(standupData, config) {
  const lines = [];
  lines.push(`:mega: *Hourly Standup* — scrum master: ${config.standup.scrum_master}`);
  lines.push(`_${new Date().toLocaleString('en-US', { timeZone: 'America/Denver' })}_`);
  lines.push('');

  for (const s of standupData.standup) {
    lines.push(`*${s.agent}*`);
    lines.push(`  :white_check_mark: Done: ${s.accomplished}`);
    lines.push(`  :arrow_forward: Next: ${s.planning}`);
    lines.push(`  :octagonal_sign: Blockers: ${s.blockers}`);
  }

  if (standupData.blockers.length > 0) {
    lines.push('');
    lines.push('*Blockers needing scrum master attention:*');
    for (const b of standupData.blockers) {
      lines.push(`  • ${b}`);
    }
  } else {
    lines.push('');
    lines.push('No blockers. Team is clear.');
  }

  return lines.join('\n');
}

const BLOCKER_AGE_PATH = path.join(__dirname, '.blocker-ages.json');

function loadBlockerAges() {
  try {
    return JSON.parse(fs.readFileSync(BLOCKER_AGE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveBlockerAges(ages) {
  fs.writeFileSync(BLOCKER_AGE_PATH, JSON.stringify(ages, null, 2));
}

/**
 * Track blocker persistence across standups. Escalate after N standups.
 */
function ageBlockers(currentBlockers, config) {
  const ages = loadBlockerAges();
  const result = [];

  // Increment age for continuing blockers
  for (const b of currentBlockers) {
    const key = b.slice(0, 60); // Use prefix as key
    ages[key] = (ages[key] || 0) + 1;
    result.push({ blocker: b, standupCount: ages[key] });
  }

  // Decay blockers that are resolved (not in current list)
  for (const key of Object.keys(ages)) {
    if (!currentBlockers.some(b => b.slice(0, 60) === key)) {
      delete ages[key];
    }
  }

  saveBlockerAges(ages);
  return result;
}

const ASYNC_PATH = path.join(__dirname, '.async-standups.json');

function loadAsyncStandups(config) {
  if (!config.async_standup?.enabled) return [];
  try {
    const data = JSON.parse(fs.readFileSync(ASYNC_PATH, 'utf8'));
    // Only include submissions from last 90 minutes
    const cutoff = Date.now() - 90 * 60 * 1000;
    return (data.submissions || []).filter(s =>
      new Date(s.submittedAt).getTime() > cutoff
    );
  } catch {
    return [];
  }
}

/**
 * Submit an async standup (for agents that miss the hourly window).
 */
function submitAsyncStandup(agent, accomplished, planning, blockers) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(ASYNC_PATH, 'utf8'));
  } catch {
    data = { submissions: [] };
  }
  data.submissions.push({
    agent, accomplished, planning, blockers,
    submittedAt: new Date().toISOString(),
  });
  // Keep only last 20
  data.submissions = data.submissions.slice(-20);
  fs.writeFileSync(ASYNC_PATH, JSON.stringify(data, null, 2));
}

async function main() {
  const config = loadConfig();
  if (!config.standup || !config.standup.enabled) {
    console.log('[standup] Disabled in scrum-config.json');
    return;
  }

  const health = loadHealth();
  const gaps = loadGaps();
  const standupData = buildStandup(health, gaps, config);
  const message = formatStandup(standupData, config);

  console.log('[STANDUP-REPORT]');
  console.log(message);

  // Post to Slack if client available
  // TOKEN FIX (Oct 10, 2026 — standup run): use slackToken.js so the VM cron
  // path resolves the custom.slack connector surrogate instead of silently
  // skipping the #management post when SLACK_BOT_TOKEN is unset.
  const { resolveSlackToken } = require('./slackToken');
  try {
    const { WebClient } = require('@slack/web-api');
    const token = resolveSlackToken();
    if (token) {
      const client = new WebClient(token);
      // DEDUP: skip if a standup was already posted to #management within the
      // max standup age window (prevents double posts on retries).
      const channelId = config.standup.channel || 'C0ASH4TF604';
      const maxAge = config.standup.max_standup_age_minutes || 90;
      const cutoff = Date.now() - maxAge * 60 * 1000;
      let alreadyPosted = false;
      try {
        const hist = await client.conversations.history({ channel: channelId, limit: 10 });
        alreadyPosted = (hist.messages || []).some(m =>
          (m.text || '').includes('Hourly Standup') && parseFloat(m.ts) * 1000 > cutoff
        );
      } catch (histErr) {
        console.log('[standup] history check skipped:', histErr.message);
      }
      if (!alreadyPosted) {
        await client.chat.postMessage({
          channel: channelId,
          text: message,
        });
        console.log('[standup] Posted to #management');
      } else {
        console.log('[standup] Standup already posted in window — skipping duplicate');
      }
    } else {
      console.log('[standup] Slack post skipped: no token (SLACK_BOT_TOKEN unset, surrogate unavailable)');
    }
  } catch (e) {
    console.log('[standup] Slack post skipped:', e.message);
  }
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { buildStandup, formatStandup, loadConfig, submitAsyncStandup, ageBlockers };
