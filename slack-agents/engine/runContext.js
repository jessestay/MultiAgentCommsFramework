// engine/runContext.js — Phase B (Vikunja #789): the run-context
// propagation channel for durable directive execution.
//
// Problem: Phase A wired checkpointing into generateWithTools behind
// explicit { runId, checkpointStore } options, but no agent passes them —
// every agent's handleDelegation calls generateWithTools with only its
// own arguments, and changing 11 agent signatures to thread two more
// values through every sub-delegation is exactly the kind of wide,
// fragile edit this program avoids.
//
// Solution: the code that OWNS the run (the directive-work workflow step,
// or the poller's inline fallback) opens a run context for the duration
// of the delegation:
//
//   runWithRunContext({ runId, checkpointStore }, () =>
//     agent.handleDelegation(...))
//
// generateWithTools consults currentRunContext() when its explicit
// options are absent (explicit options always win). AsyncLocalStorage
// scopes the context to one delegation's async tree, so concurrent
// delegations in one process never see each other's run IDs.
//
// Claim rule (sub-delegations): the FIRST generateWithTools call inside
// a context claims the run ID for its agent. A nested call from a
// DIFFERENT agent (a relay sub-delegation) derives its own deterministic
// checkpoint run ID, `${runId}:${agentId}`, so two agents' conversations
// never interleave into one checkpoint. A later call from the SAME agent
// in the same context reuses the run ID.
'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function runWithRunContext(ctx, fn) {
  if (!ctx || typeof ctx.runId !== 'string' || !ctx.runId) {
    throw new Error('runWithRunContext requires a ctx with a non-empty runId');
  }
  // Fresh store object per run: the claim flag must never leak between
  // two runs that happen to receive the same ctx object.
  return storage.run({ runId: ctx.runId, checkpointStore: ctx.checkpointStore || null, _claimedBy: null }, fn);
}

function currentRunContext() {
  return storage.getStore() || null;
}

module.exports = { runWithRunContext, currentRunContext };
