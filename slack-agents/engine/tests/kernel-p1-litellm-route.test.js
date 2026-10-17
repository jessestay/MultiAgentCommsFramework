// kernel-p1-litellm-route.test.js — #807 Phase 1 (US-P1.1 + US-P1.2).
//
// US-P1.1: chatTurn names the route that answered (result.route), and when
// both OpenRouter legs are breaker-open the LOCAL leg (macf-local) is the
// one attempted — the delegation completes via local models instead of
// dying with the upstream.
// US-P1.2: the circuit breaker keeps LIFETIME per-route totals
// (success/empty) alongside the streak state, persisted in the state file.
//
// Same mock harness as kernel-breaker-litellm.test.js (axios + proxy agents
// mocked; modelRouter mocked to the post-Phase-1 chain; breaker real
// against a temp state file).

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MACF_EMPTY_RETRY_DELAY_MS = '0';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-p1-litellm-'));
process.env.MACF_BREAKER_STATE_PATH = path.join(TMP, 'circuit-breaker.json');

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('http-proxy-agent', () => ({ HttpProxyAgent: class { constructor() {} } }));
jest.mock('https-proxy-agent', () => ({ HttpsProxyAgent: class { constructor() {} } }));
jest.mock('../../utils/modelRouter', () => ({
  getFallbackChain: (tier) => (tier === 'smart' ? ['macf-smart-paid', 'macf-smart-free', 'macf-local'] : [tier]),
  loadConfig: () => ({ settings: { empty_response_retries: 2, model_timeout_ms: 5000, log_routing: false } }),
  getModelForTier: (tier) => tier,
}));

describe('#807 Phase 1 — litellm route stamping + breaker totals', () => {
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

  test('US-P1.1: both OpenRouter legs tripped -> macf-local answers; route stamped', async () => {
    trip('macf-smart-paid');
    trip('macf-smart-free');
    const modelsTried = [];
    axios.post.mockImplementation(async (url, body) => {
      modelsTried.push(body.model);
      return { data: { choices: [{ message: { content: 'local answered' } }] } };
    });
    const turn = await litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' });
    expect(modelsTried).toEqual(['macf-local']);
    expect(turn.text).toBe('local answered');
    expect(turn.route).toBe('macf-local');
  });

  test('US-P1.1: healthy paid leg answers; route stamped macf-smart-paid', async () => {
    axios.post.mockImplementation(async (url, body) => {
      return { data: { choices: [{ message: { content: 'paid answered' } }] } };
    });
    const turn = await litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' });
    expect(turn.text).toBe('paid answered');
    expect(turn.route).toBe('macf-smart-paid');
  });

  test('US-P1.2: breaker keeps lifetime totals per route', () => {
    const now = Date.now();
    breaker.recordEmpty('macf-local', now);
    breaker.recordEmpty('macf-local', now + 1);
    breaker.recordSuccess('macf-local', now + 2);
    const st = breaker.getRouteState('macf-local');
    expect(st.totals).toEqual({ success: 1, empty: 2 });
    // Persisted: a fresh read of the state file carries the totals.
    const raw = JSON.parse(fs.readFileSync(process.env.MACF_BREAKER_STATE_PATH, 'utf8'));
    expect(raw.routes['macf-local'].totals).toEqual({ success: 1, empty: 2 });
  });

  test('US-P1.2: legacy state entries without totals read as zero totals', () => {
    const legacy = { routes: { 'macf-smart-paid': { route: 'macf-smart-paid', state: 'closed', consecutiveEmpties: 0, trips: 2, openedAt: 0, openUntil: 0, cooldownMs: 120000 } } };
    fs.writeFileSync(process.env.MACF_BREAKER_STATE_PATH, JSON.stringify(legacy));
    const st = breaker.getRouteState('macf-smart-paid');
    expect(st.totals).toEqual({ success: 0, empty: 0 });
  });
});
