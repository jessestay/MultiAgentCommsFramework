// durable-d2-cache-measurement.test.js — Phase D, US-D2 (Vikunja #789).
//
// TDD RED PHASE (Oct 16, 2026): written from US-D2's acceptance criteria
// BEFORE the implementation exists. Caching is accepted on MEASUREMENT,
// not documentation — this suite defines the measurement machinery:
//
//   * utils/promptCache.js (shared with US-D1) also exports:
//       parseUsage(rawUsage)
//         -> undefined when the provider reported no usage at all, else
//            { promptTokens, completionTokens, cachedTokens,
//              cacheCreationTokens } normalized across provider shapes:
//              - OpenAI-style: prompt_tokens / completion_tokens, cached in
//                prompt_tokens_details.cached_tokens;
//              - DeepSeek native: prompt_cache_hit_tokens;
//              - Anthropic native: input_tokens + cache_read_input_tokens
//                + cache_creation_input_tokens (Anthropic's input_tokens
//                EXCLUDES cache reads, so the normalized promptTokens is
//                the TOTAL input — otherwise shares are incomparable);
//              - already-normalized input passes through (idempotent).
//       computeCacheStats(turns)
//         -> { perTurn: [{ promptTokens, cachedTokens, share }],
//              totalPromptTokens, totalCachedTokens, totalShare, turnCount }
//       evaluateCacheBar(turns, { minShare })
//         -> { meetsBar, cachedPositive, turn3Share, reason }
//            The CEO-pinned bar (Oct 16): cached_tokens > 0 on repeat turns
//            AND cache-read share >= 50% of input tokens by turn 3.
//       assessCacheTurns(turns, { prefixStable })
//         -> { flags: [{ type: 'ZERO_CACHE_ON_REPEAT', turn }], defect }
//            US-D2.3: zero cached tokens on a REPEAT call with an unchanged
//            prefix inside the TTL is a defect, never accepted silently.
//            A cold first turn is expected and is NOT flagged.
//       decideCacheFallback({ mode, turns })
//         -> { mode, changed, reason, measuredShare }
//            US-D2.2: full breakpoints not honored (zero cached) or below
//            the bar -> fall back to 'system-only' and record why, with
//            the measured share. Bar met -> stay. No repeat turns yet ->
//            no decision (insufficient measurement).
//   * utils/litellm turn.usage surfaces the cached fields end-to-end
//     (mocked transport): present ONLY when the provider actually reported
//     cache data (lazy keys — existing usage consumers see the exact shape
//     they see today when no caching happened).
//   * generateWithTools accumulates cached tokens alongside prompt /
//     completion totals (checkpoint token counters + result usage), and
//     every chatTurn call in a delegation carries the SAME derived
//     sessionId (US-D1.2 at the delegation layer).

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MACF_EMPTY_RETRY_DELAY_MS = '0';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-durable-d2-'));
process.env.MACF_BREAKER_STATE_PATH = path.join(TMP, 'circuit-breaker.json');
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_TOOL_AUDIT_GAP_FILE = path.join(TMP, 'gaps.json');
process.env.MACF_STEP_BACKOFF_MS = '1';
delete process.env.ANTHROPIC_API_KEY;

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

function impl(rel) {
  try { return require(rel); } catch (e) {
    throw new Error(`RED PHASE (TDD): implementation module not built yet: ${rel} — ${e.code || e.message}`);
  }
}

// ─── parseUsage: provider shapes ────────────────────────────────────────────

describe('US-D2 — usage parser extracts cached tokens from every provider shape', () => {
  test('OpenAI-style: cached_tokens inside prompt_tokens_details', () => {
    const pc = impl('../../utils/promptCache');
    const u = pc.parseUsage({ prompt_tokens: 2000, completion_tokens: 120, prompt_tokens_details: { cached_tokens: 1500 } });
    expect(u).toEqual({ promptTokens: 2000, completionTokens: 120, cachedTokens: 1500, cacheCreationTokens: 0 });
  });

  test('OpenAI-style without cache data: cached reads as 0 (the provider reported usage, just no hits)', () => {
    const pc = impl('../../utils/promptCache');
    const u = pc.parseUsage({ prompt_tokens: 900, completion_tokens: 30 });
    expect(u.promptTokens).toBe(900);
    expect(u.cachedTokens).toBe(0);
    expect(u.cacheCreationTokens).toBe(0);
  });

  test('DeepSeek native: prompt_cache_hit_tokens is the cached count', () => {
    const pc = impl('../../utils/promptCache');
    const u = pc.parseUsage({ prompt_tokens: 3000, completion_tokens: 80, prompt_cache_hit_tokens: 2800, prompt_cache_miss_tokens: 200 });
    expect(u.promptTokens).toBe(3000);
    expect(u.cachedTokens).toBe(2800);
  });

  test('Anthropic native: promptTokens is the TOTAL input (input + cache read + cache creation)', () => {
    const pc = impl('../../utils/promptCache');
    const u = pc.parseUsage({ input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 900, cache_creation_input_tokens: 50 });
    expect(u).toEqual({ promptTokens: 1050, completionTokens: 20, cachedTokens: 900, cacheCreationTokens: 50 });
  });

  test('already-normalized usage passes through unchanged (idempotent)', () => {
    const pc = impl('../../utils/promptCache');
    const normalized = { promptTokens: 500, completionTokens: 25, cachedTokens: 400, cacheCreationTokens: 10 };
    expect(pc.parseUsage(normalized)).toEqual(normalized);
  });

  test('no usage at all -> undefined (callers keep the field absent)', () => {
    const pc = impl('../../utils/promptCache');
    expect(pc.parseUsage(undefined)).toBeUndefined();
    expect(pc.parseUsage(null)).toBeUndefined();
    expect(pc.parseUsage({})).toBeUndefined();
    expect(pc.parseUsage('nope')).toBeUndefined();
  });
});

// ─── computeCacheStats + the CEO bar ────────────────────────────────────────

describe('US-D2.1 — cached-token share is computed from the usage fields', () => {
  const TURNS = [
    { promptTokens: 1000, cachedTokens: 0 },
    { promptTokens: 1100, cachedTokens: 900 },
    { promptTokens: 1200, cachedTokens: 1000 },
  ];

  test('per-turn and total shares', () => {
    const pc = impl('../../utils/promptCache');
    const s = pc.computeCacheStats(TURNS);
    expect(s.turnCount).toBe(3);
    expect(s.perTurn[0].share).toBe(0);
    expect(s.perTurn[1].share).toBeCloseTo(900 / 1100, 6);
    expect(s.perTurn[2].share).toBeCloseTo(1000 / 1200, 6);
    expect(s.totalPromptTokens).toBe(3300);
    expect(s.totalCachedTokens).toBe(1900);
    expect(s.totalShare).toBeCloseTo(1900 / 3300, 6);
  });

  test('turns missing cached fields count as zero cached, never NaN', () => {
    const pc = impl('../../utils/promptCache');
    const s = pc.computeCacheStats([{ promptTokens: 100 }, { promptTokens: 0, cachedTokens: 0 }]);
    expect(s.perTurn[0].cachedTokens).toBe(0);
    expect(s.perTurn[0].share).toBe(0);
    expect(s.perTurn[1].share).toBe(0);
    expect(Number.isNaN(s.totalShare)).toBe(false);
  });

  test('evaluateCacheBar: the CEO bar — cached > 0 on repeats AND >= 50% share by turn 3', () => {
    const pc = impl('../../utils/promptCache');
    const bar = pc.evaluateCacheBar(TURNS);
    expect(bar.cachedPositive).toBe(true);
    expect(bar.turn3Share).toBeCloseTo(1000 / 1200, 6);
    expect(bar.meetsBar).toBe(true);
  });

  test('evaluateCacheBar fails when nothing was ever cached', () => {
    const pc = impl('../../utils/promptCache');
    const bar = pc.evaluateCacheBar([
      { promptTokens: 1000, cachedTokens: 0 },
      { promptTokens: 1100, cachedTokens: 0 },
      { promptTokens: 1200, cachedTokens: 0 },
    ]);
    expect(bar.cachedPositive).toBe(false);
    expect(bar.meetsBar).toBe(false);
  });

  test('evaluateCacheBar fails when hits exist but the turn-3 share is under 50%', () => {
    const pc = impl('../../utils/promptCache');
    const bar = pc.evaluateCacheBar([
      { promptTokens: 1000, cachedTokens: 0 },
      { promptTokens: 2000, cachedTokens: 900 },
      { promptTokens: 3000, cachedTokens: 900 },
    ]);
    expect(bar.cachedPositive).toBe(true);
    expect(bar.turn3Share).toBeCloseTo(0.3, 6);
    expect(bar.meetsBar).toBe(false);
  });

  test('evaluateCacheBar cannot pass on fewer than 3 turns (the bar is a turn-3 bar)', () => {
    const pc = impl('../../utils/promptCache');
    const bar = pc.evaluateCacheBar([{ promptTokens: 1000, cachedTokens: 0 }, { promptTokens: 1100, cachedTokens: 1000 }]);
    expect(bar.turn3Share).toBeNull();
    expect(bar.meetsBar).toBe(false);
  });
});

// ─── US-D2.3: zero-cache-on-repeat is a flagged defect ──────────────────────

describe('US-D2.3 — zero cached tokens on a repeat call is flagged, not accepted silently', () => {
  test('a repeat turn with zero cached tokens (stable prefix) raises ZERO_CACHE_ON_REPEAT', () => {
    const pc = impl('../../utils/promptCache');
    const a = pc.assessCacheTurns([
      { promptTokens: 1000, cachedTokens: 0 },
      { promptTokens: 1100, cachedTokens: 0 },
      { promptTokens: 1200, cachedTokens: 800 },
    ], { prefixStable: true });
    expect(a.defect).toBe(true);
    expect(a.flags).toEqual([{ type: 'ZERO_CACHE_ON_REPEAT', turn: 1 }]);
  });

  test('a cold FIRST turn is expected — not a defect', () => {
    const pc = impl('../../utils/promptCache');
    const a = pc.assessCacheTurns([
      { promptTokens: 1000, cachedTokens: 0 },
      { promptTokens: 1100, cachedTokens: 900 },
    ], { prefixStable: true });
    expect(a.defect).toBe(false);
    expect(a.flags).toEqual([]);
  });

  test('an UNSTABLE prefix explains zero cache — no defect flag', () => {
    const pc = impl('../../utils/promptCache');
    const a = pc.assessCacheTurns([
      { promptTokens: 1000, cachedTokens: 0 },
      { promptTokens: 1500, cachedTokens: 0 },
    ], { prefixStable: false });
    expect(a.defect).toBe(false);
  });
});

// ─── US-D2.2: the system-only fallback decision ─────────────────────────────

describe('US-D2.2 — measured non-honoring falls back to system-only breakpoints, recorded', () => {
  test('zero cached tokens on repeats with full breakpoints -> system-only, with the measured share', () => {
    const pc = impl('../../utils/promptCache');
    const d = pc.decideCacheFallback({ mode: 'full', turns: [
      { promptTokens: 1000, cachedTokens: 0 },
      { promptTokens: 1100, cachedTokens: 0 },
      { promptTokens: 1200, cachedTokens: 0 },
    ] });
    expect(d.mode).toBe('system-only');
    expect(d.changed).toBe(true);
    expect(d.measuredShare).toBe(0);
    expect(d.reason).toMatch(/not honored|zero/i);
  });

  test('hits but below the bar -> system-only fallback to re-measure', () => {
    const pc = impl('../../utils/promptCache');
    const d = pc.decideCacheFallback({ mode: 'full', turns: [
      { promptTokens: 1000, cachedTokens: 0 },
      { promptTokens: 2000, cachedTokens: 900 },
      { promptTokens: 3000, cachedTokens: 900 },
    ] });
    expect(d.mode).toBe('system-only');
    expect(d.changed).toBe(true);
    expect(d.measuredShare).toBeCloseTo(0.3, 6);
  });

  test('bar met -> stay on full, no change', () => {
    const pc = impl('../../utils/promptCache');
    const d = pc.decideCacheFallback({ mode: 'full', turns: [
      { promptTokens: 1000, cachedTokens: 0 },
      { promptTokens: 1100, cachedTokens: 900 },
      { promptTokens: 1200, cachedTokens: 1000 },
    ] });
    expect(d.mode).toBe('full');
    expect(d.changed).toBe(false);
  });

  test('no repeat turns yet -> no decision (insufficient measurement)', () => {
    const pc = impl('../../utils/promptCache');
    const d = pc.decideCacheFallback({ mode: 'full', turns: [{ promptTokens: 1000, cachedTokens: 0 }] });
    expect(d.mode).toBe('full');
    expect(d.changed).toBe(false);
    expect(d.reason).toMatch(/insufficient/i);
  });

  test('already system-only -> stays, with the share recorded either way', () => {
    const pc = impl('../../utils/promptCache');
    const d = pc.decideCacheFallback({ mode: 'system-only', turns: [
      { promptTokens: 1000, cachedTokens: 0 },
      { promptTokens: 1100, cachedTokens: 950 },
    ] });
    expect(d.mode).toBe('system-only');
    expect(d.changed).toBe(false);
    expect(d.measuredShare).toBeGreaterThan(0);
  });
});

// ─── litellm: turn.usage surfaces cached fields (mocked transport) ─────────
// This file ALSO mocks utils/litellm further below (for the generateWithTools
// section), so the real client is loaded with jest.requireActual: it runs
// against the mocked axios / proxy agents / modelRouter, with the real
// circuit breaker on a temp state file — the kernel-breaker-litellm harness.

describe('US-D2 — chatTurn surfaces cached tokens in turn.usage', () => {
  const axios = require('axios');
  process.env.LITELLM_BASE_URL = 'http://127.0.0.1:4000';
  process.env.LITELLM_MASTER_KEY = 'test-key';
  const litellm = jest.requireActual('../../utils/litellm');
  const breaker = require('../../utils/circuitBreaker');

  beforeEach(() => {
    litellm._resetGatewayCache();
    breaker.resetAll();
    axios.get.mockReset(); axios.post.mockReset();
    axios.get.mockResolvedValue({ status: 200, data: {} });
  });

  test('OpenAI-style cached_tokens reaches turn.usage', async () => {
    axios.post.mockResolvedValue({ data: {
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 640 } },
    } });
    const turn = await litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' });
    expect(turn.usage).toEqual({ promptTokens: 1000, completionTokens: 50, cachedTokens: 640 });
  });

  test('Anthropic-style cache fields reach turn.usage (total-input normalization)', async () => {
    axios.post.mockResolvedValue({ data: {
      choices: [{ message: { content: 'ok' } }],
      usage: { input_tokens: 300, output_tokens: 40, cache_read_input_tokens: 700, cache_creation_input_tokens: 25 },
    } });
    const turn = await litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' });
    expect(turn.usage.promptTokens).toBe(1025);
    expect(turn.usage.completionTokens).toBe(40);
    expect(turn.usage.cachedTokens).toBe(700);
    expect(turn.usage.cacheCreationTokens).toBe(25);
  });

  test('no cache data reported -> usage keeps its exact pre-Phase-D shape (lazy keys)', async () => {
    axios.post.mockResolvedValue({ data: {
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1000, completion_tokens: 50 },
    } });
    const turn = await litellm.chatTurn({ systemPrompt: 's', userMessage: 'hi', model: 'smart' });
    expect(turn.usage).toEqual({ promptTokens: 1000, completionTokens: 50 });
    expect('cachedTokens' in turn.usage).toBe(false);
  });
});

// ─── generateWithTools: accumulation + one session per delegation ──────────
// (jest.mock calls are hoisted file-wide: the axios / proxy-agent /
// modelRouter / litellm / agentTools mocks in this section apply to the
// whole file, including the requireActual litellm section above.)

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('http-proxy-agent', () => ({ HttpProxyAgent: class { constructor() {} } }));
jest.mock('https-proxy-agent', () => ({ HttpsProxyAgent: class { constructor() {} } }));
jest.mock('../../utils/modelRouter', () => ({
  getFallbackChain: (tier) => (tier === 'smart' ? ['macf-smart-paid', 'macf-smart-free'] : [tier]),
  loadConfig: () => ({ settings: { empty_response_retries: 2, model_timeout_ms: 5000, log_routing: false } }),
  getModelForTier: (tier) => tier,
}));

const mockChatTurn = jest.fn();
const mockExecuteTool = jest.fn();
jest.mock('../../utils/litellm', () => ({
  isConfigured: () => true,
  chat: jest.fn(),
  chatTurn: (...args) => mockChatTurn(...args),
}));
jest.mock('../../utils/agentTools', () => ({
  TOOLS: {
    fileRead: { description: 'Read a file', argsSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } },
    fileWrite: { description: 'Write a file', argsSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false } },
  },
  getToolDescriptions: () => 'fileRead, fileWrite',
  executeTool: (...args) => mockExecuteTool(...args),
}));

const { generateWithTools } = require('../../utils/anthropic');

describe('US-D1.2 + US-D2 — the delegation loop carries one session and accumulates cached tokens', () => {
  beforeEach(() => {
    mockChatTurn.mockReset();
    mockExecuteTool.mockReset();
    mockExecuteTool.mockImplementation(async (toolName, args) => ({
      ok: true, tool: toolName, content: `CONTENT OF ${args && args.path}`,
    }));
    process.env.MACF_STEP_BACKOFF_MS = '1';
    process.env.MACF_STEP_DEADLINE_MS = '30000';
  });

  function scriptedTurns() {
    let turn = 0;
    mockChatTurn.mockImplementation(async () => {
      turn++;
      if (turn === 1) return { text: '', toolCalls: [{ id: 'c1', toolName: 'fileRead', args: { path: 'draft.md' } }], usage: { promptTokens: 1000, completionTokens: 30, cachedTokens: 0 } };
      return { text: 'Done. [DEMO]', toolCalls: [], usage: { promptTokens: 1200, completionTokens: 40, cachedTokens: 950 } };
    });
  }

  test('every chatTurn call in the loop carries the SAME sessionId', async () => {
    scriptedTurns();
    await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Read the draft and finish.',
      maxTokens: 500, agentId: 'cmo', taskId: 761,
    });
    expect(mockChatTurn.mock.calls.length).toBeGreaterThanOrEqual(2);
    const ids = mockChatTurn.mock.calls.map(c => c[0].sessionId);
    for (const id of ids) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      expect(id).toBe(ids[0]);
    }
  });

  test('the derived sessionId is stable across separate delegations with the same identity', async () => {
    scriptedTurns();
    await generateWithTools({ systemPrompt: 'You are a test agent.', context: 'Same task.', maxTokens: 500, agentId: 'cmo', taskId: 761 });
    const first = mockChatTurn.mock.calls[0][0].sessionId;
    mockChatTurn.mockClear();
    scriptedTurns();
    await generateWithTools({ systemPrompt: 'You are a test agent.', context: 'Same task.', maxTokens: 500, agentId: 'cmo', taskId: 761 });
    expect(mockChatTurn.mock.calls[0][0].sessionId).toBe(first);
  });

  test('cached tokens accumulate into the checkpoint token counters and the result usage', async () => {
    const cpMod = impl('../../utils/checkpointStore');
    const store = cpMod.createCheckpointStore(cpMod.createMemoryAdapter());
    scriptedTurns();
    const result = await generateWithTools({
      systemPrompt: 'You are a test agent.', context: 'Read the draft and finish.',
      maxTokens: 500, agentId: 'cmo', taskId: 761,
      runId: 'run-d2-1', checkpointStore: store,
    });
    expect(result.response).toContain('Done');
    expect(result.usage).toBeTruthy();
    expect(result.usage.promptTokens).toBe(2200);
    expect(result.usage.completionTokens).toBe(70);
    expect(result.usage.cachedTokens).toBe(950);
    const cp = await store.loadCheckpoint('run-d2-1');
    expect(cp.tokens.promptTokens).toBe(2200);
    expect(cp.tokens.cachedTokens).toBe(950);
  });
});
