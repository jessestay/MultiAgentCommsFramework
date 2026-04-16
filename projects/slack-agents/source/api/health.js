// api/health.js — Health check endpoint
// Also shows which agents are configured and cron schedules.

const { getState } = require('../lib/state');

module.exports = async (req, res) => {
  let stateStatus = 'unknown';
  let lastRun = {};

  try {
    const state = await getState();
    stateStatus = 'ok';
    lastRun = state.last_run || {};
  } catch (err) {
    stateStatus = `error: ${err.message}`;
  }

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    system: 'jesse-slack-agents multi-agent',
    agents: [
      { key: 'exec-pm', name: '📋 Exec PM', channel: '#exec-pm', role: 'Primary interface + project tracking' },
      { key: 'marketing', name: '📣 Marketing Agent', channel: '#marketing', role: 'GoFundMe + social content' },
      { key: 'transkrybe', name: '🎵 Transkrybe Agent', channel: '#transkrybe', role: 'Dev tracking + GitHub' },
      { key: 'content', name: '✍️ Content Agent', channel: '#content', role: 'Blog, LinkedIn, TikTok scripts' },
      { key: 'jobs', name: '💼 Jobs Agent', channel: '#jobs', role: 'Job search + applications' },
      { key: 'research', name: '🔍 Research Agent', channel: '#research', role: 'Background research' },
    ],
    cron_jobs: [
      { name: 'morning-briefing', schedule: '0 14 * * *', description: 'Daily 8am MT — Exec PM morning briefing to #exec-pm' },
      { name: 'weekly-content', schedule: '0 15 * * 1', description: 'Monday 9am MT — Marketing content calendar to #marketing' },
      { name: 'weekly-jobs', schedule: '0 23 * * 5', description: 'Friday 5pm MT — Jobs weekly status to #jobs' },
      { name: 'weekly-transkrybe', schedule: '0 14 * * 1', description: 'Monday 8am MT — Transkrybe dev status to #transkrybe' },
    ],
    state_status: stateStatus,
    last_cron_runs: lastRun,
    env: {
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      SLACK_BOT_TOKEN: !!process.env.SLACK_BOT_TOKEN,
      SLACK_SIGNING_SECRET: !!process.env.SLACK_SIGNING_SECRET,
      GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
      CRON_SECRET: !!process.env.CRON_SECRET,
    },
  };

  res.status(200).json(health);
};

