/**
 * litellm.js tier-fallback tests (Oct 11, 2026).
 *
 * models.yaml promises: "The engine tries them top-down, falling back to the
 * next if one fails or returns empty." These tests prove chatTurn walks the
 * chain: empty -> retry same model; error -> next model; all fail -> throw.
 */

jest.mock('axios');
jest.mock('../../utils/modelRouter', () => ({
  getFallbackChain: (tier) => {
    if (tier === 'smart') return ['macf-smart-paid', 'macf-smart-free'];
    if (tier === 'quick') return ['macf-cheap', 'openrouter/nvidia/nemotron-3.5-lightning:free'];
    return [];
  },
  loadConfig: () => ({
    settings: { empty_response_retries: 1, model_timeout_ms: 5000, log_routing: false },
  }),
}));

const axios = require('axios');
const litellm = require('../../utils/litellm');

process.env.LITELLM_BASE_URL = 'http://127.0.0.1:4000';
process.env.LITELLM_MASTER_KEY = 'sk-test';

function okResponse(text) {
  return { data: { choices: [{ message: { content: text, tool_calls: [] } }] } };
}
function emptyResponse() {
  return { data: { choices: [{ message: { content: '  ', tool_calls: [] } }] } };
}
const modelsCalled = () => axios.post.mock.calls.map(c => c[1].model);

beforeEach(() => {
  axios.post.mockReset();
  axios.get.mockReset();
  axios.get.mockResolvedValue({ status: 200, data: {} }); // gateway up by default
  litellm._resetGatewayCache();
  // Silence routing logs even if a test flips the flag.
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  console.log.mockRestore();
});

test('first model success -> single call, returns text', async () => {
  axios.post.mockResolvedValue(okResponse('hello'));
  const r = await litellm.chatTurn({ userMessage: 'hi', model: 'smart' });
  expect(r.text).toBe('hello');
  expect(modelsCalled()).toEqual(['macf-smart-paid']);
});

test('empty response retries same model then falls to next', async () => {
  // empty_response_retries: 1 -> 2 attempts on paid, then free succeeds
  axios.post
    .mockResolvedValueOnce(emptyResponse())
    .mockResolvedValueOnce(emptyResponse())
    .mockResolvedValueOnce(okResponse('from-free'));
  const r = await litellm.chatTurn({ userMessage: 'hi', model: 'smart' });
  expect(r.text).toBe('from-free');
  expect(modelsCalled()).toEqual(['macf-smart-paid', 'macf-smart-paid', 'macf-smart-free']);
});

test('transport error skips retries and goes to next model immediately', async () => {
  axios.post
    .mockRejectedValueOnce(new Error('timeout of 5000ms exceeded'))
    .mockResolvedValueOnce(okResponse('from-free'));
  const r = await litellm.chatTurn({ userMessage: 'hi', model: 'smart' });
  expect(r.text).toBe('from-free');
  expect(modelsCalled()).toEqual(['macf-smart-paid', 'macf-smart-free']);
});

test('all models fail -> throws naming the chain', async () => {
  axios.post.mockRejectedValue(new Error('boom'));
  await expect(litellm.chatTurn({ userMessage: 'hi', model: 'smart' }))
    .rejects.toThrow(/macf-smart-paid -> macf-smart-free/);
  // 1 attempt per model on error (no empty-retries burned on errors)
  expect(modelsCalled()).toEqual(['macf-smart-paid', 'macf-smart-free']);
});

test('full model id (not a tier) -> single attempt, no chain', async () => {
  axios.post.mockResolvedValue(okResponse('direct'));
  const r = await litellm.chatTurn({ userMessage: 'hi', model: 'openrouter/deepseek/deepseek-v4-flash' });
  expect(r.text).toBe('direct');
  expect(modelsCalled()).toEqual(['openrouter/deepseek/deepseek-v4-flash']);
});

test('per-attempt timeout comes from models.yaml settings', async () => {
  axios.post.mockResolvedValue(okResponse('x'));
  await litellm.chatTurn({ userMessage: 'hi', model: 'smart' });
  expect(axios.post.mock.calls[0][2].timeout).toBe(5000);
});

test('gateway unreachable -> chatTurn fails fast without walking the chain', async () => {
  // Desktop down: preflight GET /health throws (timeout/refused). chatTurn
  // must throw immediately instead of burning attemptTimeoutMs per model.
  delete process.env.OPENROUTER_API_KEY; // no failover key: fail-fast path
  axios.get.mockRejectedValue(new Error('timeout of 5000ms exceeded'));
  await expect(litellm.chatTurn({ userMessage: 'hi', model: 'smart' }))
    .rejects.toThrow(/gateway unreachable/);
  expect(axios.post).not.toHaveBeenCalled();
});

test('P1.4: gateway unreachable + no VM key -> failover unavailable, helpful error', async () => {
  delete process.env.OPENROUTER_API_KEY;
  axios.get.mockRejectedValue(new Error('timeout of 5000ms exceeded'));
  await expect(litellm.chatTurnDirect({ userMessage: 'hi' }))
    .rejects.toThrow(/no OPENROUTER_API_KEY/);
  expect(axios.post).not.toHaveBeenCalled();
});

test('P1.4: gateway unreachable + VM key -> VM-direct failover engages', async () => {
  process.env.OPENROUTER_API_KEY = 'sk-or-test-key';
  try {
    axios.get.mockRejectedValue(new Error('timeout of 5000ms exceeded'));
    axios.post.mockResolvedValue(okResponse('failover answer'));
    const r = await litellm.chatTurn({ userMessage: 'hi', model: 'smart' });
    expect(r.text).toBe('failover answer');
    // Direct OpenRouter endpoint, free model first ($0 before paid).
    expect(axios.post.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(axios.post.mock.calls[0][1].model).toBe('liquid/lfm-2.5-2.6b:free');
    // Auth header present, key never in URL/body logs.
    expect(axios.post.mock.calls[0][2].headers.Authorization).toBe('Bearer sk-or-test-key');
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
});

test('P1.4: failover walks free -> paid chain on empty/error', async () => {
  process.env.OPENROUTER_API_KEY = 'sk-or-test-key';
  try {
    axios.get.mockRejectedValue(new Error('timeout of 5000ms exceeded'));
    axios.post
      .mockResolvedValueOnce(emptyResponse())   // lfm-2.5 empty
      .mockRejectedValueOnce(new Error('429'))  // nemotron rate-limited
      .mockResolvedValueOnce(okResponse('paid answer')); // deepseek works
    const r = await litellm.chatTurn({ userMessage: 'hi', model: 'smart' });
    expect(r.text).toBe('paid answer');
    const models = axios.post.mock.calls.map(c => c[1].model);
    expect(models).toEqual([
      'liquid/lfm-2.5-2.6b:free',
      'nvidia/nemotron-3.5-lightning:free',
      'deepseek/deepseek-v4-flash',
    ]);
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
});

test('gateway preflight negative cache avoids repeated probes while down', async () => {
  axios.get.mockRejectedValue(new Error('connect ECONNREFUSED'));
  const r1 = await litellm.gatewayReachable({ base: 'http://127.0.0.1:4000' });
  const r2 = await litellm.gatewayReachable({ base: 'http://127.0.0.1:4000' });
  expect(r1).toBe(false);
  expect(r2).toBe(false);
  // Second call served from the 60s negative cache: only one probe fired.
  expect(axios.get).toHaveBeenCalledTimes(1);
});

test('gateway reachable -> any HTTP status (even 404) counts as up', async () => {
  axios.get.mockResolvedValue({ status: 404, data: {} });
  const r = await litellm.gatewayReachable({ base: 'http://127.0.0.1:4000' });
  expect(r).toBe(true);
});
