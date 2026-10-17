/**
 * Deterministic Executors — registry + dispatch (Oct 12, 2026 — #724, Pillar 5)
 *
 * Design: docs/code-enforced-tool-use-design.md, Pillar 5.
 *
 * Mechanical task shapes run as CODE, not as model generations. An
 * executor performs its steps by calling executeTool() directly (every
 * step issues a receipt and passes schema validation for free) and may
 * invoke the model ONLY through ctx.generate — the single typed seam
 * (utils/anthropic generateStructured) whose output is schema-validated
 * before use. There is no free-text generation anywhere else in the loop,
 * so "the agent narrated instead of acting" is unreachable for these
 * shapes.
 *
 * dispatch() returns a generateWithTools-shaped result so workTask's
 * contracted path (verification → completion) treats executor output and
 * model output identically:
 *   { ok, response, deliverable, toolResults, errorClass?, validationErrors? }
 */

const urlSweep = require('./urlSweep');
const fileReport = require('./fileReport');
const ticketFiler = require('./ticketFiler');
const slackPoster = require('./slackPoster');

const REGISTRY = {
  [urlSweep.name]: urlSweep,
  [fileReport.name]: fileReport,
  [ticketFiler.name]: ticketFiler,
  [slackPoster.name]: slackPoster,
};

function has(name) {
  return !!REGISTRY[name];
}

/**
 * Build the executor context. Side-effecting dependencies are injectable
 * for tests; production defaults are the real modules.
 */
function buildCtx({ task, contract, agentId = null, postMessage = null, generate = null } = {}) {
  const { executeTool } = require('../../utils/agentTools');
  const receipts = require('../receipts');
  return {
    agentId,
    taskId: task.id,
    task,
    contract,
    executeTool: (tool, args) => executeTool(tool, args, { agentId, taskId: task.id }),
    generate: generate || (({ systemPrompt, input, outputSchema, schemaName }) =>
      require('../../utils/anthropic').generateStructured({ systemPrompt, input, outputSchema, schemaName })),
    receipts,
    vikunja: require('../../utils/vikunja'),
    config: require('../../config'),
    postMessage: postMessage || (async () => {
      throw new Error('slack-poster: no postMessage bridge configured by the caller');
    }),
    log: (...a) => console.log('[executors]', ...a),
  };
}

async function dispatch(name, { task, contract, agentId = null, postMessage = null, generate = null } = {}) {
  const executor = REGISTRY[name];
  if (!executor) {
    return { ok: false, errorClass: 'unknown_executor', response: null, deliverable: null, toolResults: [] };
  }
  const ctx = buildCtx({ task, contract, agentId, postMessage, generate });
  try {
    const out = await executor.run({ task, contract, ctx });
    if (!out || out.ok === false || !out.deliverable) {
      return {
        ok: false,
        errorClass: (out && out.errorClass) || 'executor_failed',
        validationErrors: (out && out.validationErrors) || undefined,
        response: null, deliverable: null, toolResults: [],
      };
    }
    return {
      ok: true,
      response: out.deliverable.summary || JSON.stringify(out.deliverable),
      deliverable: out.deliverable,
      toolResults: [],
    };
  } catch (e) {
    return { ok: false, errorClass: 'executor_failed', response: null, deliverable: null, toolResults: [], error: e.message };
  }
}

module.exports = { REGISTRY, has, buildCtx, dispatch };
