// api/cron/process-queues.js — Autonomous Task Queue Processor
//
// Runs every hour. Checks each agent's pending task queue and executes outstanding
// work without requiring an @mention. This is what makes agents truly autonomous:
// Exec PM (or any agent) can add tasks via addTask('marketing', '...') and this cron
// will pick them up, execute them, and mark them complete.
//
// Schedule: every hour ("0 * * * *" in vercel.json)

const execPm    = require('../../agents/exec-pm');
const marketing = require('../../agents/marketing');
const transkrybe = require('../../agents/transkrybe');
const content   = require('../../agents/content');
const jobs      = require('../../agents/jobs');
const research  = require('../../agents/research');

const { getState, setState } = require('../../lib/state');
const { postAsAgent } = require('../../lib/slack');

const AGENT_HANDLERS = {
  'exec-pm': execPm,
  marketing,
  transkrybe,
  content,
  jobs,
  research,
};

// Max tasks to process per agent per run (avoid timeouts)
const MAX_TASKS_PER_AGENT = 3;

module.exports = async (req, res) => {
  // Protect cron endpoint
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[process-queues] Starting autonomous task queue processing...');

  const results = {};
  let totalProcessed = 0;
  let totalErrors = 0;

  try {
    const state = await getState();

    for (const [agentKey, handler] of Object.entries(AGENT_HANDLERS)) {
      const pendingTasks = (state.tasks[agentKey] || [])
        .filter(t => t.status === 'pending')
        .slice(0, MAX_TASKS_PER_AGENT);

      if (pendingTasks.length === 0) {
        results[agentKey] = { processed: 0, errors: 0 };
        continue;
      }

      console.log(`[process-queues] ${agentKey}: ${pendingTasks.length} pending task(s)`);
      let processed = 0;
      let errors = 0;

      for (const task of pendingTasks) {
        try {
          console.log(`[process-queues] Executing [${agentKey}/${task.id}]: ${task.task.slice(0, 80)}`);

          // Mark in-progress to prevent double-execution
          task.status = 'in-progress';
          task.started = new Date().toISOString();
          await setState(state);

          await handler.handleMessage(task.task, {
            channel: null,        // agent posts to its own home channel
            channelId: null,
            thread_ts: null,
            userName: 'scheduler',
            isScheduled: true,    // agents can check this to skip approval prompts
            taskId: task.id,
          });

          // Mark complete
          task.status = 'completed';
          task.completed = new Date().toISOString();
          await setState(state);

          processed++;
          totalProcessed++;
          console.log(`[process-queues] ✓ Completed [${agentKey}/${task.id}]`);
        } catch (err) {
          console.error(`[process-queues] ✗ Error [${agentKey}/${task.id}]:`, err.message);
          task.status = 'failed';
          task.error = err.message;
          task.failed = new Date().toISOString();
          try { await setState(state); } catch {}
          errors++;
          totalErrors++;
        }
      }

      results[agentKey] = { processed, errors };
    }

    console.log(`[process-queues] Done. Total processed: ${totalProcessed}, errors: ${totalErrors}`);

    // If anything was processed, let Exec PM know
    if (totalProcessed > 0) {
      const summary = Object.entries(results)
        .filter(([, r]) => r.processed > 0)
        .map(([agent, r]) => `${agent}: ${r.processed} task(s)`)
        .join(', ');

      // Only post to Slack if there were actual completions (avoid noise)
      // Exec PM logs this quietly; individual agents post their own results
      console.log(`[process-queues] Completed tasks: ${summary}`);
    }

    return res.status(200).json({
      ok: true,
      totalProcessed,
      totalErrors,
      agents: results,
    });

  } catch (err) {
    console.error('[process-queues] Fatal error:', err.message, err.stack);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
