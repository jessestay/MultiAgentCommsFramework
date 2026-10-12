/**
 * ticket-filer executor (Oct 12, 2026 — #724, Pillar 5)
 *
 * Fully deterministic — NO model step exists. Creates Vikunja tasks from
 * the contract's structured spec and records a vikunja_task receipt per
 * filing, so completion verification and demo relay read effects, not
 * claims.
 */

module.exports = {
  name: 'ticket-filer',
  contractTemplate: 'ticketFiling',

  async run({ task, contract, ctx }) {
    const tickets = (contract.params && contract.params.tickets) || [];
    if (!tickets.length) return { ok: false, errorClass: 'invalid_contract' };

    const projectId = (contract.params && contract.params.projectId) || ctx.config.VIKUNJA.projectId;
    const created = [];
    for (const spec of tickets) {
      const createdTask = await ctx.vikunja.createTask('execPM', projectId, {
        title: spec.title,
        description: spec.description || '',
      });
      if (createdTask && createdTask.id != null) {
        created.push(createdTask.id);
        ctx.receipts.recordExternalReceipt({
          agentId: ctx.agentId, taskId: task.id,
          kind: 'vikunja_task', ref: String(createdTask.id),
          extra: { title: spec.title },
        });
      }
    }
    if (!created.length) return { ok: false, errorClass: 'nothing_filed' };

    return {
      deliverable: {
        status: 'produced',
        summary: `Filed ${created.length} task${created.length === 1 ? '' : 's'}: ${created.map(i => `#${i}`).join(', ')}`,
        taskRef: String(created[0]),
      },
    };
  },
};
