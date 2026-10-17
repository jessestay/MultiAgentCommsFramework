/**
 * file-report executor (Oct 12, 2026 — #724, Pillar 5)
 *
 * Mechanical: fileRead the contract's inputs, fileWrite the report
 * artifact — both via executeTool, both receipted. Model step (only):
 * draft the report body through the typed seam (validated against a body
 * schema before the write happens).
 */

const BODY_SCHEMA = {
  type: 'object',
  required: ['body', 'summary'],
  properties: {
    body: { type: 'string' },
    summary: { type: 'string' },
  },
};

module.exports = {
  name: 'file-report',
  contractTemplate: 'fileReport',

  async run({ task, contract, ctx }) {
    const params = contract.params || {};
    const inputs = params.inputs || [];
    const outputPath = params.outputPath;
    if (!outputPath) return { ok: false, errorClass: 'invalid_contract' };

    const parts = [];
    for (const p of inputs) {
      const r = await ctx.executeTool('fileRead', { path: p });
      if (r && r.ok) parts.push(`## Input: ${p}\n${r.content}`);
    }

    const gen = await ctx.generate({
      systemPrompt: 'You draft a concise report from the source inputs provided. The body is the full report text; the summary is one paragraph. Use only facts present in the inputs.',
      input: parts.length ? parts.join('\n\n') : `(No readable inputs. Task: ${task.title})`,
      outputSchema: BODY_SCHEMA,
      schemaName: 'file-report-body',
    });
    if (!gen.ok) {
      return { ok: false, errorClass: gen.errorClass || 'invalid_deliverable', validationErrors: gen.validationErrors };
    }

    const w = await ctx.executeTool('fileWrite', { path: outputPath, content: gen.value.body });
    if (!w || !w.ok) {
      return { ok: false, errorClass: 'tool_failed' };
    }

    return {
      deliverable: {
        status: 'produced',
        summary: gen.value.summary,
        artifactRefs: [outputPath],
      },
    };
  },
};
