/**
 * url-sweep executor (Oct 12, 2026 — #724, Pillar 5)
 *
 * Mechanical: urlCheck every contract URL via executeTool (receipted),
 * diff each status against the last receipted observation for that URL.
 * Model step (only): summarize the observed results through the typed seam.
 */

module.exports = {
  name: 'url-sweep',
  contractTemplate: 'urlSweep',

  async run({ task, contract, ctx }) {
    const urls = (contract.params && contract.params.urls) || [];
    const { getSchema } = require('../deliverableSchemas');

    // Last observed status per URL, from receipts issued BEFORE this run.
    const lastByUrl = {};
    for (const r of ctx.receipts.receiptsForTask(task.id)) {
      if (r.tool !== 'urlCheck') continue;
      for (const a of r.artifacts || []) {
        if (a.kind === 'http_check') lastByUrl[a.ref] = a.httpCode;
      }
    }

    const results = [];
    for (const url of urls) {
      const res = await ctx.executeTool('urlCheck', { url });
      const httpCode = res && res.httpCode != null ? res.httpCode : 0;
      results.push({
        url,
        httpCode,
        changed: lastByUrl[url] !== undefined ? lastByUrl[url] !== httpCode : false,
      });
    }

    const gen = await ctx.generate({
      systemPrompt: 'You summarize URL sweep results for a status report. Report only what the data shows: which URLs were checked, their HTTP status, and which changed since the last sweep.',
      input: JSON.stringify({ task: task.title, results }),
      outputSchema: getSchema('url-sweep@v1'),
      schemaName: 'url-sweep@v1',
    });
    if (!gen.ok) {
      // The mechanical receipts stand; only the summary failed.
      return { ok: false, errorClass: gen.errorClass || 'invalid_deliverable', validationErrors: gen.validationErrors };
    }
    return { deliverable: gen.value };
  },
};
