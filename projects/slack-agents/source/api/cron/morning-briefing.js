// api/cron/morning-briefing.js — Daily morning briefing (8am MT = 14:00 UTC)
// Exec PM posts a morning briefing to #management with project status, priorities,
// and anything needing Jesse's attention.

const { postAsAgent } = require('../../lib/slack');
const { generateMorningBriefing } = require('../../agents/exec-pm');
const { getState, recordCronRun } = require('../../lib/state');

module.exports = async (req, res) => {
  // Protect cron endpoint (Vercel sends an authorization header for cron jobs)
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('Running morning briefing cron job...');

  try {
    const state = await getState();
    const briefing = await generateMorningBriefing(state);

    const result = await postAsAgent(
      'exec-pm',
      'management',
      briefing
    );

    if (result.ok) {
      await recordCronRun('morning_briefing');
      console.log('Morning briefing posted successfully');
      return res.status(200).json({ ok: true, message: 'Morning briefing posted' });
    } else {
      console.error('Slack error posting morning briefing:', result.error);
      return res.status(500).json({ ok: false, error: result.error });
    }
  } catch (err) {
    console.error('Morning briefing cron error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
