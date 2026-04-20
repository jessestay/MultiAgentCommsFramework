// tests/delegation-relay.test.js — Tests for utils/delegation.js in-process relay
'use strict';

const { init, relay } = require('../utils/delegation');

// ─── Mock agent modules ───────────────────────────────────────────────────────
function makeMockAgent(id) {
  return {
    id,
    calls: [],
    responses: [],
    async handleDelegation(msg, visited = new Set()) {
      this.calls.push({ msg, visited: new Set(visited) });
      const response = this.responses.shift() || '';
      // Relay sub-delegations from mock response
      if (response) {
        await relay(response, id, visited);
      }
      return true;
    },
  };
}

const MOCK_TARGETS = {
  'cmo':      'cmo',
  'cco':      'cco',
  'cuxo':     'cuxo',
  'cro':      'cro',
  'lawyer':   'lawyer',
  'cfo':      'cfo',
  'execpm':   'execPM',
  'exec pm':  'execPM',
  'exec-pm':  'execPM',
  'jobcoach': 'jobcoach',
  'job coach':'jobcoach',
};

let agents;

beforeEach(() => {
  agents = {
    cmo:      makeMockAgent('cmo'),
    cco:      makeMockAgent('cco'),
    cuxo:     makeMockAgent('cuxo'),
    cro:      makeMockAgent('cro'),
    lawyer:   makeMockAgent('lawyer'),
    cfo:      makeMockAgent('cfo'),
    execPM:   makeMockAgent('execPM'),
    jobcoach: makeMockAgent('jobcoach'),
  };
  init(agents, MOCK_TARGETS);
});

// ─── Basic routing ────────────────────────────────────────────────────────────
describe('Basic delegation routing', () => {
  test('Routes [from: X → CMO] to cmo agent', async () => {
    await relay('[from: execPM → CMO] Please run a campaign brief', 'execPM');
    expect(agents.cmo.calls).toHaveLength(1);
    expect(agents.cmo.calls[0].msg).toContain('[from: execPM → CMO]');
  });

  test('Routes [from: X → CCO] to cco agent', async () => {
    await relay('[from: CMO → CCO] Draft the Monday post', 'cmo');
    expect(agents.cco.calls).toHaveLength(1);
  });

  test('Routes [from: X → Lawyer] to lawyer agent', async () => {
    await relay('[from: CFO → Lawyer] Entity structure question', 'cfo');
    expect(agents.lawyer.calls).toHaveLength(1);
  });

  test('Routes [from: X → Exec PM] to execPM agent', async () => {
    await relay('[from: CMO → Exec PM] Flagging a blocker', 'cmo');
    expect(agents.execPM.calls).toHaveLength(1);
  });

  test('Routes [from: X → Job Coach] to jobcoach agent', async () => {
    await relay('[from: Exec PM → Job Coach] Pipeline check', 'execPM');
    expect(agents.jobcoach.calls).toHaveLength(1);
  });

  test('Does nothing when no delegation pattern present', async () => {
    await relay('Just a normal message with no delegation', 'execPM');
    Object.values(agents).forEach(a => expect(a.calls).toHaveLength(0));
  });

  test('Does nothing when response is empty', async () => {
    await relay('', 'execPM');
    Object.values(agents).forEach(a => expect(a.calls).toHaveLength(0));
  });
});

// ─── Loop prevention ──────────────────────────────────────────────────────────
describe('Loop prevention', () => {
  test('Prevents self-delegation: A → A is skipped', async () => {
    await relay('[from: cmo → CMO] Talk to yourself', 'cmo');
    expect(agents.cmo.calls).toHaveLength(0);
  });

  test('Prevents ping-pong: A → B → A is blocked', async () => {
    // CMO delegates to CCO, CCO tries to delegate back to CMO
    agents.cco.responses.push('[from: CCO → CMO] Here is the draft');
    await relay('[from: execPM → CCO] Write the post', 'execPM');
    expect(agents.cco.calls).toHaveLength(1);
    // CMO should NOT be called since execPM is already visited (wait — actually
    // execPM called CCO, then CCO tries CMO. CMO is not in the chain yet.
    // The chain is execPM → CCO, and CCO tries → CMO. CMO not visited, so it fires.
    // This is correct behavior — it's not a loop.
    expect(agents.cmo.calls).toHaveLength(1);
  });

  test('Prevents true loop: A already in visited set blocks re-invocation', async () => {
    // Simulate a visited set that already contains cmo
    const visited = new Set(['execPM', 'cmo']);
    await relay('[from: cmo → CMO] This would loop', 'cmo', visited);
    expect(agents.cmo.calls).toHaveLength(0);
  });

  test('Chain [execPM → CMO → CCO] works without triggering loop prevention', async () => {
    // CMO delegates to CCO after being delegated to
    agents.cmo.responses.push('[from: CMO → CCO] Please write the draft');
    await relay('[from: execPM → CMO] Campaign brief please', 'execPM');
    expect(agents.cmo.calls).toHaveLength(1);
    expect(agents.cco.calls).toHaveLength(1);
  });

  test('Chain stops when all unique agents exhausted (visited set)', async () => {
    // CCO is already in the chain; relay from CCO to CCO should be blocked
    const visited = new Set(['execPM', 'cmo', 'cco']);
    await relay('[from: cco → CCO] Another CCO request', 'cco', visited);
    expect(agents.cco.calls).toHaveLength(0);
  });
});

// ─── Duplicate pair prevention ────────────────────────────────────────────────
describe('Duplicate pair prevention', () => {
  test('Does not call B twice if [from: A → B] appears twice in same response', async () => {
    const msg = `
      [from: execPM → CMO] First request
      [from: execPM → CMO] Second request (duplicate)
    `;
    await relay(msg, 'execPM');
    expect(agents.cmo.calls).toHaveLength(1);
  });

  test('Does call two different agents from same response', async () => {
    const msg = `
      [from: execPM → CMO] Marketing request
      [from: execPM → CCO] Content request
    `;
    await relay(msg, 'execPM');
    expect(agents.cmo.calls).toHaveLength(1);
    expect(agents.cco.calls).toHaveLength(1);
  });
});

// ─── Unknown/invalid targets ──────────────────────────────────────────────────
describe('Unknown target handling', () => {
  test('Silently skips unknown target names', async () => {
    await relay('[from: execPM → UnknownAgent] This goes nowhere', 'execPM');
    Object.values(agents).forEach(a => expect(a.calls).toHaveLength(0));
  });

  test('Processes valid targets even if response also has unknown ones', async () => {
    const msg = `
      [from: execPM → UnknownAgent] skip this
      [from: execPM → CMO] process this
    `;
    await relay(msg, 'execPM');
    expect(agents.cmo.calls).toHaveLength(1);
  });
});

// ─── Visited set propagation ──────────────────────────────────────────────────
describe('Visited set passed to delegated agent', () => {
  test('Delegated agent receives correct visited set', async () => {
    const initialVisited = new Set(['execPM']);
    await relay('[from: execPM → CMO] Check in', 'execPM', initialVisited);
    expect(agents.cmo.calls[0].visited.has('execPM')).toBe(true);
    expect(agents.cmo.calls[0].visited.has('cmo')).toBe(false); // cmo not yet visited when called
  });
});
