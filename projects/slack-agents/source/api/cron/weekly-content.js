// api/cron/weekly-content.js — Monday 9am MT (15:00 UTC) weekly content calendar
// Marketing Agent posts the weekly content calendar to #marketing.

const { postAsAgent, postApprovalRequest } = require('../../lib/slack');
const { generateWeeklyCalendar } = require('../../agents/marketing');
const { getState, recordCronRun } = require('../../lib/state');

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('Running weekly content calendar cron job...');

  try {
    const state = await getState();
    const calendar = await generateWeeklyCalendar(state);

    // Post as approval request — social content always needs Jesse's ✅
    const result = await postApprovalRequest(
      'marketing',
      'marketing',
      `weekly_calendar_${Date.now()}`,
      '📅 Weekly Content Calendar — needs your ✅ to schedule',
      calendar
    );

    if (result.ok) {
      await recordCronRun('weekly_content');
      console.log('Weekly content calendar posted successfully');
      return res.status(200).json({ ok: true, message: 'Weekly content calendar posted' });
    } else {
      console.error('Slack error posting weekly content:', result.error);
      return res.status(500).json({ ok: false, error: result.error });
    }
  } catch (err) {
    console.error('Weekly content cron error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

