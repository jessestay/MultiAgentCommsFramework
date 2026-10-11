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

    // Blocker detection: unhealthy status or high failure rate
    const isBlocked = status !== 'healthy' || (failed > 0 && completed > 0 && failed / completed > 0.5);

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

  // Add engine-level gaps as blockers
  const recentGaps = (Array.isArray(gaps) ? gaps : []).slice(-5);
  for (const g of recentGaps) {
    blockers.push(`[engine] ${g.type || 'gap'}: ${(g.detail || '').slice(0, 80)}`);
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
  try {
    const { WebClient } = require('@slack/web-api');
    const token = process.env.SLACK_BOT_TOKEN;
    if (token) {
      const client = new WebClient(token);
      await client.chat.postMessage({
        channel: config.standup.channel || 'C0ASH4TF604',
        text: message,
      });
      console.log('[standup] Posted to #management');
    }
  } catch (e) {
    console.log('[standup] Slack post skipped:', e.message);
  }
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { buildStandup, formatStandup, loadConfig, submitAsyncStandup, ageBlockers };
