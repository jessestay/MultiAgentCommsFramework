/**
 * slack-poster executor (Oct 12, 2026 — #724, Pillar 5)
 *
 * Deterministic: posts the contract's PREPARED message through the
 * caller's postMessage bridge and records a slack_message receipt — the
 * receipt is what the artifact_posted postcondition verifies. No model
 * step: the text was authored with the contract, not generated at run
 * time.
 */

module.exports = {
  name: 'slack-poster',
  contractTemplate: 'slackPost',

  async run({ task, contract, ctx }) {
    const params = contract.params || {};
    const channel = params.channel;
    const text = params.text;
    if (!channel || !text) return { ok: false, errorClass: 'invalid_contract' };

    const posted = await ctx.postMessage({ channel, text });
    const ts = (posted && posted.ts) || new Date().toISOString();
    ctx.receipts.recordExternalReceipt({
      agentId: ctx.agentId, taskId: task.id,
      kind: 'slack_message', ref: `${channel}/${ts}`,
      extra: { channel },
    });

    return {
      deliverable: {
        status: 'produced',
        summary: `Posted to ${channel}: ${String(text).slice(0, 120)}`,
        channel,
        messageTs: ts,
      },
    };
  },
};
