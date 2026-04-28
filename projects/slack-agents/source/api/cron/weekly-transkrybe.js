// api/cron/weekly-transkrybe.js — Monday 8am MT (14:00 UTC) weekly dev status
// Transkrybe Agent posts weekly dev status to the cto channel.

const { postAsAgent } = require('../../lib/slack');
const { generateWeeklyStatus } = require('../../agents/transkrybe');
const { getState, recordCronRun } = require('../../lib/state');

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('Running weekly Transkrybe dev status cron job...');

  try {
    const state = await getState();
    const status = await generateWeeklyStatus(state);

    const result = await postAsAgent(
      'transkrybe',
      null,
      '🚦 *Weekly Dev Status — Transkrybe*

' + status
    );

    if (result.ok) {
      await recordCronRun('weekly_transkrybe');
      console.log('Weekly Transkrybe status posted successfully');
      return res.status(200).json({ ok: true, message: 'Weekly Transkrybe status posted' });
    } else {
      console.error('Slack error posting weekly transkrybe:', result.error);
      return res.status(500).json({ ok: false, error: result.error });
    }
  } catch (err) {
    console.error('Weekly Transkrybe cron error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
