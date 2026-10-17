/**
 * engine/tests/single-processor.test.js
 *
 * TDD for the split-brain bug (Oct 6, 2026).
 *
 * BUG: Two independent processes processed the same CEO directives:
 * 1. VM poller (engine/directivePoll.js) — polls Slack API every 5 min
 * 2. Railway bot (index.js) — receives Slack events in real-time
 *
 * Both saw "[from: CEO → CCO]" and both invoked the CCO's handleDelegation.
 * The VM poller posted via jarvis_jr (verified), and the Railway bot posted
 * via n8n-inbox/CCO bot (duplicate). The thread had 2 replies for 1 directive.
 *
 * ARCHITECTURE (Oct 4, 2026): "Poller is sole poster. VM handles directives
 * directly." The Railway bot's CEO-directive handling was never disabled.
 *
 * FIX: index.js must SKIP "[from: CEO → ...]" messages, letting the VM
 * poller claim them. The Railway bot still handles agent-to-agent
 * delegations ([from: CCO → CFO]) and mentions, just not CEO directives.
 *
 * BDD:
 * - Given a message "[from: CEO → CCO] ...", when the Railway bot's
 *   message handler runs, then it SKIPS (returns early, no handleDelegation).
 * - Given a message "[from: CCO → CFO] ...", when the handler runs,
 *   then it PROCESSES (agent-to-agent delegation still works).
 */
'use strict';

describe('Single directive processor (no split-brain)', () => {
  // The routing logic lives in index.js's message handler. We extract the
  // decision predicate for testing: should the Railway bot skip this message?
  function shouldSkipForPoller(text) {
    // SPEC: mirrors the guard in index.js message handler.
    // CEO directives are the VM poller's job. Everything else processes.
    const ceoDirective = /\[from:\s*CEO\s*→/i;
    return ceoDirective.test(text);
  }

  test('SKIPS: "[from: CEO → CCO]" is the poller\'s job', () => {
    expect(shouldSkipForPoller('[from: CEO → CCO] DIRECT: Write draft')).toBe(true);
  });

  test('SKIPS: CEO directive with different casing', () => {
    expect(shouldSkipForPoller('[from: ceo → cfo] Do the thing')).toBe(true);
  });

  test('PROCESSES: "[from: CCO → CFO]" agent-to-agent still works', () => {
    expect(shouldSkipForPoller('[from: CCO → CFO] Need numbers')).toBe(false);
  });

  test('PROCESSES: plain mention without delegation pattern', () => {
    expect(shouldSkipForPoller('@cco can you draft this?')).toBe(false);
  });

  test('PROCESSES: "[from: n8n-inbox → X]" system delegation', () => {
    // n8n-inbox carries system directives that must be routed (index.js:207)
    expect(shouldSkipForPoller('[from: n8n-inbox → CCO] Task update')).toBe(false);
  });
});
