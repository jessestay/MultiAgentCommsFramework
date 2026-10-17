// directiveRetryQueue.test.js — retry-queue semantics for the CEO directive
// poller (Oct 11, 2026).
//
// Regression: a delegation failure (garbled output / null result) did NOT
// record a retry and did NOT hold the watermark, but the scan phase had
// already advanced the watermark past the directive via a later
// non-directive message. The directive was silently swallowed — never
// retried, never dead-lettered. The fix routes every unresolved directive
// into state._pendingRetry, drained at the start of every run independent
// of the watermark.
const {
  queueRetry,
  dropPendingRetry,
  drainPendingRetry,
  recordRetryFailure,
  MAX_PENDING_RETRY,
} = require('../directivePoll.js');

jest.mock('../../agents/cto.js', () => ({
  handleDelegation: async () => ({ response: 'ok' }),
  init: jest.fn(),
}), { virtual: false });

const item = (over = {}) => ({
  channel: 'C0ASH4TF604',
  m: { ts: '1791752904.751359' },
  text: '[from: CEO → CTO] Re your escalation on Railway API access for deploy status checks',
  msgTs: 1791752904.751359,
  agentId: 'cto',
  ...over,
});

describe('queueRetry', () => {
  test('adds an entry with channel, ts, agentId and text', () => {
    const state = {};
    queueRetry(state, item());
    expect(state._pendingRetry).toHaveLength(1);
    expect(state._pendingRetry[0]).toMatchObject({
      channel: 'C0ASH4TF604',
      ts: '1791752904.751359',
      agentId: 'cto',
    });
  });
  test('dedupes repeat queueing of the same directive', () => {
    const state = {};
    queueRetry(state, item());
    queueRetry(state, item());
    expect(state._pendingRetry).toHaveLength(1);
  });
  test('truncates long text', () => {
    const state = {};
    queueRetry(state, item({ text: 'x'.repeat(5000) }));
    expect(state._pendingRetry[0].text).toHaveLength(4000);
  });
  test('bounds the queue at MAX_PENDING_RETRY', () => {
    const state = {};
    for (let i = 0; i < MAX_PENDING_RETRY + 10; i++) {
      queueRetry(state, item({ m: { ts: `1791752${i}.0` }, msgTs: 1791752000 + i }));
    }
    expect(state._pendingRetry.length).toBeLessThanOrEqual(MAX_PENDING_RETRY);
  });
});

describe('dropPendingRetry', () => {
  test('removes only the matching entry', () => {
    const state = {};
    queueRetry(state, item());
    queueRetry(state, item({ m: { ts: '1791752905.0' }, msgTs: 1791752905 }));
    dropPendingRetry(state, 'C0ASH4TF604', '1791752904.751359');
    expect(state._pendingRetry).toHaveLength(1);
    expect(state._pendingRetry[0].ts).toBe('1791752905.0');
  });
});

describe('drainPendingRetry', () => {
  test('re-queues a known agent directive into pendingDelegations', () => {
    const state = { _pendingRetry: [{
      channel: 'C0ASH4TF604', ts: '1791752904.751359', msgTs: 1791752904.751359,
      agentId: 'cto', text: '[from: CEO → CTO] hello',
    }]};
    const queued = [];
    drainPendingRetry(state, null, queued);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      channel: 'C0ASH4TF604', msgTs: 1791752904.751359,
      agentId: 'cto', isRetry: true,
    });
    expect(queued[0].m.ts).toBe('1791752904.751359');
    expect(queued[0].text).toBe('[from: CEO → CTO] hello');
    expect(state._pendingRetry).toHaveLength(0); // drained set cleared
  });
  test('drops entries for unknown agents without queueing', () => {
    const state = { _pendingRetry: [{
      channel: 'C0ASH4TF604', ts: '1.0', msgTs: 1,
      agentId: 'nosuchagent', text: 'x',
    }]};
    const queued = [];
    drainPendingRetry(state, null, queued);
    expect(queued).toHaveLength(0);
    expect(state._pendingRetry).toHaveLength(0);
  });
  test('no-op on empty or missing queue', () => {
    const queued = [];
    drainPendingRetry({}, null, queued);
    drainPendingRetry({ _pendingRetry: [] }, null, queued);
    expect(queued).toHaveLength(0);
  });
});

describe('recordRetryFailure', () => {
  const noopHealth = () => {};
  test('failure 1: counts retry, queues it, does NOT advance watermark', () => {
    const state = { C0ASH4TF604: '1791753470.262799' }; // watermark past the directive
    const dead = recordRetryFailure(state, item(), 'garbled_output', noopHealth);
    expect(dead).toBe(false);
    expect(state._retries['C0ASH4TF604:1791752904.751359']).toBe(1);
    expect(state._pendingRetry).toHaveLength(1); // retry survives the watermark jump
    expect(state.C0ASH4TF604).toBe('1791753470.262799'); // untouched
    expect(state._deadLetter).toBeUndefined();
  });
  test('failure 2: increments the count, stays queued', () => {
    const state = { _retries: { 'C0ASH4TF604:1791752904.751359': 1 } };
    const dead = recordRetryFailure(state, item(), 'garbled_output', noopHealth);
    expect(dead).toBe(false);
    expect(state._retries['C0ASH4TF604:1791752904.751359']).toBe(2);
    expect(state._pendingRetry).toHaveLength(1);
  });
  test('failure 3: dead-letters with reason, advances watermark, clears retry state', () => {
    const state = {
      _retries: { 'C0ASH4TF604:1791752904.751359': 3 },
      _pendingRetry: [{ channel: 'C0ASH4TF604', ts: '1791752904.751359' }],
    };
    const healthCalls = [];
    const dead = recordRetryFailure(state, item(), 'garbled_output',
      (agentId, outcome) => healthCalls.push([agentId, outcome]));
    expect(dead).toBe(true);
    expect(state._deadLetter).toHaveLength(1);
    expect(state._deadLetter[0]).toMatchObject({
      channel: 'C0ASH4TF604',
      ts: '1791752904.751359',
      agentId: 'cto',
      reason: 'garbled_output',
    });
    expect(state.C0ASH4TF604).toBe('1791752904.751359'); // watermark advanced past it
    expect(state._retries['C0ASH4TF604:1791752904.751359']).toBeUndefined();
    expect(state._pendingRetry).toHaveLength(0);
    expect(healthCalls).toEqual([['cto', 'failed']]);
  });
  test('dead-letter does not move the watermark backwards', () => {
    const state = {
      C0ASH4TF604: '1791753470.262799',
      _retries: { 'C0ASH4TF604:1791752904.751359': 3 },
    };
    recordRetryFailure(state, item(), 'no_result', noopHealth);
    expect(state.C0ASH4TF604).toBe('1791753470.262799');
  });
});
