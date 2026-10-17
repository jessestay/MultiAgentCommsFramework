// kernel-resilience-litellm.test.js — Oct 15, 2026 (Jesse's order: "How do
// we keep the whole attempt from dying if any step comes back empty?").
//
// Mechanism 1 of 3: litellm.chatTurn ROTATES empty-retries across the model
// chain with spacing instead of hammering one streaking leg, and marks a
// transport-failed leg down for the rest of the call. Split into its own
// file because it needs the REAL litellm module (axios + modelRouter
// mocked), while kernel-resilience.test.js mocks litellm itself.

process.env.MACF_EMPTY_RETRY_DELAY_MS = '0';
// Phase C (Oct 16, 2026): chatTurn now consults the circuit breaker, whose
// state is a shared on-disk file. Isolate it per suite run + reset between
// tests so breaker trips inside one test can never leak into another.
const _fs = require('fs'), _os = require('os'), _path = require('path');
process.env.MACF_BREAKER_STATE_PATH = _path.join(
  _fs.mkdtempSync(_path.join(_os.tmpdir(), 'macf-breaker-resilience-')), 'circuit-breaker.json');

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
// The proxy-agent packages are ESM-only; jest cannot parse them and they are
// irrelevant to the rotation logic (the test base URL is localhost, so no
// proxy agent is ever constructed).
jest.mock('http-proxy-agent', () => ({ HttpProxyAgent: class { constructor() {} } }));
jest.mock('https-proxy-agent', () => ({ HttpsProxyAgent: class { constructor() {} } }));
jest.mock('../../utils/modelRouter', () => ({
  getFallbackChain: (tier) => (tier === 'smart' ? ['macf-smart-paid', 'macf-smart-free'] : [tier]),
  loadConfig: () => ({ settings: { empty_response_retries: 2, model_timeout_ms: 5000, log_routing: false } }),
  getModelForTier: (tier) => tier,
}));

describe('litellm chatTurn rotation', () => {
  const axios = require('axios');
  process.env.LITELLM_BASE_URL = 'http://127.0.0.1:4000';
  process.env.LITELLM_MASTER_KEY = 'test-key';
  // Required ONCE: jest.resetModules() would hand litellm a fresh axios mock
  // instance and strand the implementations set on the one captured here.
  const litellm = require('../../utils/litellm');
  beforeEach(() => {
    litellm._resetGatewayCache();
    require('../../utils/circuitBreaker').resetAll();
    axios.get.mockReset(); axios.post.mockReset();
    axios.get.mockResolvedValue({ status: 200, data: {} });
  });

  test('an empty from the top leg rotates to the next leg on the very next attempt', async () => {
    const modelsTried = [];
    axios.post.mockImplementation(async (url, body) => {
      modelsTried.push(body.model);
      if (body.model === 'macf-smart-paid') {
        return { data: { choices: [{ message: { content: '' } }] } };
      }
      return { data: { choices: [{ message: { content: 'hello from free' } }] } };
    });
    const turn = await litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' });
    expect(turn.text).toBe('hello from free');
    // Rotation: paid, then free — NOT paid, paid, paid (the old walk).
    expect(modelsTried[0]).toBe('macf-smart-paid');
    expect(modelsTried[1]).toBe('macf-smart-free');
  });

  test('all legs empty -> throws the all-models-failed error (caller retries the step)', async () => {
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: '' } }] } });
    await expect(litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' }))
      .rejects.toThrow(/all models failed/);
    // 2 legs x (1 + 2 retries) = 6 attempts before giving up.
    expect(axios.post.mock.calls.length).toBe(6);
  });

  test('a transport error marks the leg down; rotation skips it afterwards', async () => {
    const modelsTried = [];
    axios.post.mockImplementation(async (url, body) => {
      modelsTried.push(body.model);
      if (body.model === 'macf-smart-paid') throw new Error('timeout of 60000ms exceeded');
      return { data: { choices: [{ message: { content: 'free answered' } }] } };
    });
    const turn = await litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' });
    expect(turn.text).toBe('free answered');
    expect(modelsTried.filter(m => m === 'macf-smart-paid')).toHaveLength(1);
  });
});
