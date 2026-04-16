// api/cron/weekly-jobs.js — Friday 5pm MT (23:00 UTC) weekly job search status
// Jobs Agent posts weekly application status to #jobs.

const { postAsAgent } = require('../../lib/slack');
const { generateWeeklyStatus } = require('../../agents/jobs');
const { getState, recordCronRun } = require('../../lib/state');

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('Running weekly jobs status cron job...');

  try {
    const state = await getState();
    const status = await generateWeeklyStatus(state);

    const result = await postAsAgent('jobs', 'jobs', `📊 *Weekly Job Search Update*\n\n${status}`);

    if (result.ok) {
      await recordCronRun('weekly_jobs');
      console.log('Weekly jobs status posted successfully');
      return res.status(200).json({ ok: true, message: 'Weekly jobs status posted' });
    } else {
      console.error('Slack error posting weekly jobs:', result.error);
      return res.status(500).json({ ok: false, error: result.error });
    }
  } catch (err) {
    console.error('Weekly jobs cron error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

