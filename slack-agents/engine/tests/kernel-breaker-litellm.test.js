// kernel-breaker-litellm.test.js — Phase C integration (Vikunja #789).
//
// Proves utils/litellm consults the circuit breaker (utils/circuitBreaker):
//   - a tripped leg is never attempted (fail-fast skip, not another
//     60-second timeout into a dead route)
//   - when EVERY leg is tripped, chatTurn throws a circuit-open error
//     immediately, with ZERO gateway calls — the caller's retry/dead-letter
//     machinery gets a fast failure it can schedule around
//   - real outcomes feed the breaker: empties count, a success resets
//   - the VM-direct failover chain gets the same treatment (direct: keys)
//
// Same mock harness as kernel-resilience-litellm.test.js (axios + proxy
// agents + modelRouter mocked); the breaker runs for REAL against a temp
// state file so the test exercises the actual cross-call memory.

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MACF_EMPTY_RETRY_DELAY_MS = '0';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-breaker-litellm-'));
process.env.MACF_BREAKER_STATE_PATH = path.join(TMP, 'circuit-breaker.json');

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('http-proxy-agent', () => ({ HttpProxyAgent: class { constructor() {} } }));
jest.mock('https-proxy-agent', () => ({ HttpsProxyAgent: class { constructor() {} } }));
jest.mock('../../utils/modelRouter', () => ({
  getFallbackChain: (tier) => (tier === 'smart' ? ['macf-smart-paid', 'macf-smart-free'] : [tier]),
  loadConfig: () => ({ settings: { empty_response_retries: 2, model_timeout_ms: 5000, log_routing: false } }),
  getModelForTier: (tier) => tier,
}));

describe('litellm chatTurn + circuit breaker', () => {
  const axios = require('axios');
  process.env.LITELLM_BASE_URL = 'http://127.0.0.1:4000';
  process.env.LITELLM_MASTER_KEY = 'test-key';
  const litellm = require('../../utils/litellm');
  const breaker = require('../../utils/circuitBreaker');

  beforeEach(() => {
    litellm._resetGatewayCache();
    breaker.resetAll();
    axios.get.mockReset(); axios.post.mockReset();
    axios.get.mockResolvedValue({ status: 200, data: {} });
  });

  function trip(route) {
    const now = Date.now();
    for (let i = 0; i < 3; i++) breaker.recordEmpty(route, now + i);
  }

  test('a tripped leg is skipped entirely; the healthy leg answers', async () => {
    trip('macf-smart-paid');
    const modelsTried = [];
    axios.post.mockImplementation(async (url, body) => {
      modelsTried.push(body.model);
      return { data: { choices: [{ message: { content: 'free answered' } }] } };
    });
    const turn = await litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' });
    expect(turn.text).toBe('free answered');
    expect(modelsTried).toEqual(['macf-smart-free']); // paid never attempted
  });

  test('all legs tripped -> circuit-open error with ZERO gateway calls', async () => {
    trip('macf-smart-paid');
    trip('macf-smart-free');
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'x' } }] } });
    await expect(litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' }))
      .rejects.toThrow(/circuit open/i);
    expect(axios.post.mock.calls.length).toBe(0);
  });

  test('real empties feed the breaker across calls', async () => {
    axios.post.mockImplementation(async (url, body) => {
      if (body.model === 'macf-smart-paid') return { data: { choices: [{ message: { content: '' } }] } };
      return { data: { choices: [{ message: { content: 'free ok' } }] } };
    });
    // Each call tries paid first (empty) then succeeds on free, so paid
    // accrues exactly one consecutive empty per call. Three calls trip it.
    await litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' });
    await litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' });
    await litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' });
    expect(breaker.getRouteState('macf-smart-paid').state).toBe('open');
    // Next call must not attempt paid at all.
    const modelsTried = [];
    axios.post.mockImplementation(async (url, body) => {
      modelsTried.push(body.model);
      return { data: { choices: [{ message: { content: 'free ok' } }] } };
    });
    await litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' });
    expect(modelsTried).toEqual(['macf-smart-free']);
  });

  test('a success on a streaking leg resets its breaker streak', async () => {
    const now = Date.now();
    breaker.recordEmpty('macf-smart-paid', now);
    breaker.recordEmpty('macf-smart-paid', now + 1);
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'paid answered' } }] } });
    const turn = await litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' });
    expect(turn.text).toBe('paid answered');
    expect(breaker.getRouteState('macf-smart-paid').consecutiveEmpties).toBe(0);
  });
});

describe('litellm VM-direct failover + circuit breaker', () => {
  const axios = require('axios');
  process.env.LITELLM_BASE_URL = 'http://127.0.0.1:4000';
  process.env.LITELLM_MASTER_KEY = 'test-key';
  process.env.OPENROUTER_API_KEY = 'test-or-key';
  const litellm = require('../../utils/litellm');
  const breaker = require('../../utils/circuitBreaker');

  beforeEach(() => {
    litellm._resetGatewayCache();
    breaker.resetAll();
    axios.get.mockReset(); axios.post.mockReset();
    axios.get.mockRejectedValue(new Error('connect ECONNREFUSED')); // gateway down -> direct path
  });

  test('all direct legs tripped -> circuit-open error, zero OpenRouter calls', async () => {
    const now = Date.now();
    for (const id of ['liquid/lfm-2.5-2.6b:free', 'nvidia/nemotron-3.5-lightning:free', 'deepseek/deepseek-v4-flash']) {
      for (let i = 0; i < 3; i++) breaker.recordEmpty(`direct:${id}`, now + i);
    }
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'x' } }] } });
    await expect(litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' }))
      .rejects.toThrow(/circuit open/i);
    expect(axios.post.mock.calls.length).toBe(0);
  });
});
