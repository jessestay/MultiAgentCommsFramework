// durable-d1-cache-config.test.js — Phase D, US-D1 (Vikunja #789).
//
// TDD RED PHASE (Oct 16, 2026): written from US-D1's acceptance criteria
// BEFORE the implementation exists. The contract under test:
//
//   * NEW MODULE utils/promptCache.js exporting (at least):
//       CACHE_TTL                       -> '1h' (the 1-hour TTL tier, US-D1.1)
//       cacheControlMarker()            -> { type: 'ephemeral', ttl: '1h' }
//       deriveSessionId({ agentId, taskId, runId, seed })
//         -> deterministic string | null. Same delegation inputs in -> the
//            SAME id out, every call (no timestamps, no randomness — a
//            session id that changes per call defeats sticky routing,
//            US-D1.2). Different task/run -> different id.
//       prefixHash({ systemPrompt, tools, messages })
//         -> sha256 hex fingerprint of the STABLE prefix only (system
//            content + tool definitions + stable head message), ignoring
//            cache_control markers and everything after the head. Equal
//            prefixes hash equal across turns; a changed system prompt or
//            tool set hashes DIFFERENT (US-D1.3 layout rebuild).
//       applyPromptCache({ messages, tools, sessionId, mode })
//         -> { messages, tools, sessionId, prefixHash, breakpoints }
//            mode 'full' (default): cache_control markers (ephemeral, 1h)
//              on (a) the system message, (b) the LAST tool definition,
//              (c) the stable conversation head (the first user message —
//              in the native loop that is the task context, byte-stable
//              across the delegation's turns).
//            mode 'system-only': marker on the system message ONLY.
//            mode 'off': nothing marked, sessionId null, breakpoints [].
//            Dynamic content — every message after the head, every tool
//            result — NEVER carries a marker (US-D1.1: dynamic content
//            appears after the last cache breakpoint). Inputs are never
//            mutated: the caller reuses its message array across turns.
//   * utils/litellm chatTurn / chatTurnDirect gain { sessionId, cacheMode }:
//       - with a sessionId, the wire body carries session_id (OpenRouter
//         sticky routing) and the cache-built messages/tools;
//       - without one, the wire body is byte-identical to today (no
//         session_id, no markers) — caching is additive, never a behavior
//         change for existing callers;
//       - MACF_PROMPT_CACHE=off on the environment disables even when a
//         sessionId is supplied (ops kill switch).
//
// The wire tests reuse the kernel-breaker-litellm mock harness (axios +
// proxy agents + modelRouter mocked; the circuit breaker runs for real
// against a temp state file).

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MACF_EMPTY_RETRY_DELAY_MS = '0';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-durable-d1-'));
process.env.MACF_BREAKER_STATE_PATH = path.join(TMP, 'circuit-breaker.json');

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

// Guarded loader: in the red phase the module does not exist. Turning that
// into a thrown error inside each test keeps the failure a TEST failure
// (file still collects) and names exactly what is missing.
function impl(rel) {
  try { return require(rel); } catch (e) {
    throw new Error(`RED PHASE (TDD): implementation module not built yet: ${rel} — ${e.code || e.message}`);
  }
}

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('http-proxy-agent', () => ({ HttpProxyAgent: class { constructor() {} } }));
jest.mock('https-proxy-agent', () => ({ HttpsProxyAgent: class { constructor() {} } }));
jest.mock('../../utils/modelRouter', () => ({
  getFallbackChain: (tier) => (tier === 'smart' ? ['macf-smart-paid', 'macf-smart-free'] : [tier]),
  loadConfig: () => ({ settings: { empty_response_retries: 2, model_timeout_ms: 5000, log_routing: false } }),
  getModelForTier: (tier) => tier,
}));

const MARKER = { type: 'ephemeral', ttl: '1h' };
const TOOLS = [
  { type: 'function', function: { name: 'fileRead', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } },
  { type: 'function', function: { name: 'fileWrite', description: 'Write a file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } } } },
];
const snap = (v) => JSON.parse(JSON.stringify(v));

function markersIn(messages) {
  const found = [];
  (messages || []).forEach((m, i) => {
    if (Array.isArray(m.content)) {
      m.content.forEach((b, j) => { if (b && b.cache_control) found.push({ message: i, block: j, marker: b.cache_control }); });
    }
  });
  return found;
}

// ─── US-D1.1: breakpoints + 1h TTL on the stable prefix ─────────────────────

describe('US-D1.1 — cache breakpoints with the 1-hour TTL on the stable prefix', () => {
  test('the marker is the ephemeral type at the 1-hour TTL tier', () => {
    const pc = impl('../../utils/promptCache');
    expect(pc.CACHE_TTL).toBe('1h');
    expect(pc.cacheControlMarker()).toEqual(MARKER);
    // A fresh object per call — callers must never share (and mutate) one.
    expect(pc.cacheControlMarker()).not.toBe(pc.cacheControlMarker());
  });

  test('full mode marks the system message, the last tool, and the stable head — nothing after', () => {
    const pc = impl('../../utils/promptCache');
    const messages = [
      { role: 'system', content: 'You are the CMO. Stable persona text.' },
      { role: 'user', content: 'Task: write the thing. Stable task context.' },
      { role: 'assistant', content: 'Working on it.' },
      { role: 'user', content: 'Dynamic follow-up.' },
    ];
    const out = pc.applyPromptCache({ messages, tools: TOOLS, sessionId: 'macf:cmo:task:1' });
    const found = markersIn(out.messages);
    // Exactly two message breakpoints: system (0) and head (1).
    expect(found.map(f => f.message)).toEqual([0, 1]);
    for (const f of found) expect(f.marker).toEqual(MARKER);
    // System content became a text block carrying the original text.
    expect(out.messages[0].content[0].type).toBe('text');
    expect(out.messages[0].content[0].text).toBe('You are the CMO. Stable persona text.');
    // Tool breakpoint: the LAST tool definition only.
    expect(out.tools[0].cache_control).toBeUndefined();
    expect(out.tools[1].cache_control).toEqual(MARKER);
    // Breakpoint descriptor names what was marked.
    expect(out.breakpoints.map(b => b.at)).toEqual(expect.arrayContaining(['system', 'tools', 'head']));
    expect(out.sessionId).toBe('macf:cmo:task:1');
    expect(typeof out.prefixHash).toBe('string');
  });

  test('dynamic content after the head never carries a marker, even tool results', () => {
    const pc = impl('../../utils/promptCache');
    const messages = [
      { role: 'system', content: 'Persona.' },
      { role: 'user', content: 'Task context.' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'fileRead', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '{"ok":true,"content":"dynamic tool output"}' },
      { role: 'user', content: 'Another dynamic message.' },
    ];
    const out = pc.applyPromptCache({ messages, tools: TOOLS, sessionId: 's1' });
    const found = markersIn(out.messages);
    expect(found.every(f => f.message <= 1)).toBe(true);
    expect(out.messages[3].content).toBe('{"ok":true,"content":"dynamic tool output"}');
  });

  test('no system message (native-loop shape): the head is the first user message', () => {
    const pc = impl('../../utils/promptCache');
    const messages = [
      { role: 'user', content: 'Task: native context, stable across turns.' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'dynamic' },
    ];
    const out = pc.applyPromptCache({ messages, tools: TOOLS, sessionId: 's2' });
    const found = markersIn(out.messages);
    expect(found.map(f => f.message)).toEqual([0]);
    expect(out.breakpoints.map(b => b.at)).toEqual(expect.arrayContaining(['head', 'tools']));
    expect(out.breakpoints.map(b => b.at)).not.toContain('system');
  });

  test('system-only mode marks ONLY the system message (the US-D2 fallback layout)', () => {
    const pc = impl('../../utils/promptCache');
    const messages = [
      { role: 'system', content: 'Persona.' },
      { role: 'user', content: 'Task context.' },
    ];
    const out = pc.applyPromptCache({ messages, tools: TOOLS, sessionId: 's3', mode: 'system-only' });
    expect(markersIn(out.messages).map(f => f.message)).toEqual([0]);
    expect(out.tools.every(t => t.cache_control === undefined)).toBe(true);
    expect(out.breakpoints.map(b => b.at)).toEqual(['system']);
  });

  test('off mode marks nothing and drops the session id', () => {
    const pc = impl('../../utils/promptCache');
    const messages = [{ role: 'system', content: 'Persona.' }, { role: 'user', content: 'Task.' }];
    const out = pc.applyPromptCache({ messages, tools: TOOLS, sessionId: 's4', mode: 'off' });
    expect(markersIn(out.messages)).toEqual([]);
    expect(out.tools.every(t => t.cache_control === undefined)).toBe(true);
    expect(out.sessionId).toBeNull();
    expect(out.breakpoints).toEqual([]);
  });

  test('inputs are never mutated (the caller reuses its arrays across turns)', () => {
    const pc = impl('../../utils/promptCache');
    const messages = [
      { role: 'system', content: 'Persona.' },
      { role: 'user', content: 'Task context.' },
      { role: 'user', content: 'dynamic' },
    ];
    const tools = snap(TOOLS);
    const beforeM = snap(messages);
    const beforeT = snap(tools);
    pc.applyPromptCache({ messages, tools, sessionId: 's5' });
    expect(messages).toEqual(beforeM);
    expect(tools).toEqual(beforeT);
  });
});

// ─── Prefix stability + US-D1.3 rebuild ─────────────────────────────────────

describe('US-D1 — the stable prefix is byte-identical across turns; a change rebuilds the layout', () => {
  test('turn 1 and turn 3 of one conversation produce the identical prefix (hash + bytes)', () => {
    const pc = impl('../../utils/promptCache');
    const head = [
      { role: 'system', content: 'You are the CTO. Long stable persona.' },
      { role: 'user', content: 'Task: fix the page. Stable context.' },
    ];
    const turn1 = pc.applyPromptCache({ messages: head, tools: TOOLS, sessionId: 'macf:cto:task:9' });
    const turn3Messages = [...head,
      { role: 'assistant', content: 'First answer.' },
      { role: 'user', content: 'Follow-up?' },
      { role: 'assistant', content: 'Second answer.' },
      { role: 'user', content: 'And now?' }];
    const turn3 = pc.applyPromptCache({ messages: turn3Messages, tools: TOOLS, sessionId: 'macf:cto:task:9' });
    expect(turn3.prefixHash).toBe(turn1.prefixHash);
    // The marked prefix portion serializes byte-identically.
    expect(JSON.stringify(turn3.messages.slice(0, 2))).toBe(JSON.stringify(turn1.messages.slice(0, 2)));
    expect(JSON.stringify(turn3.tools)).toBe(JSON.stringify(turn1.tools));
  });

  test('US-D1.3: a changed system prompt rebuilds the layout (new hash, marker on the NEW text)', () => {
    const pc = impl('../../utils/promptCache');
    const a = pc.applyPromptCache({ messages: [{ role: 'system', content: 'PROMPT A' }, { role: 'user', content: 'Task.' }], tools: TOOLS, sessionId: 'macf:cto:task:9' });
    const b = pc.applyPromptCache({ messages: [{ role: 'system', content: 'PROMPT B' }, { role: 'user', content: 'Task.' }], tools: TOOLS, sessionId: 'macf:cto:task:9' });
    expect(b.prefixHash).not.toBe(a.prefixHash);
    expect(b.messages[0].content[0].text).toBe('PROMPT B');
    expect(b.messages[0].content[0].cache_control).toEqual(MARKER);
  });

  test('US-D1.3: a changed tool set rebuilds the layout (new hash)', () => {
    const pc = impl('../../utils/promptCache');
    const msgs = [{ role: 'system', content: 'P' }, { role: 'user', content: 'Task.' }];
    const a = pc.applyPromptCache({ messages: msgs, tools: TOOLS, sessionId: 's' });
    const changedTools = [...TOOLS, { type: 'function', function: { name: 'urlCheck', description: 'Check a URL', parameters: { type: 'object', properties: {} } } }];
    const b = pc.applyPromptCache({ messages: msgs, tools: changedTools, sessionId: 's' });
    expect(b.prefixHash).not.toBe(a.prefixHash);
  });

  test('prefixHash ignores the markers themselves and everything after the head', () => {
    const pc = impl('../../utils/promptCache');
    const base = [{ role: 'system', content: 'P' }, { role: 'user', content: 'Task.' }];
    const h1 = pc.prefixHash({ messages: base, tools: TOOLS });
    const withTail = [...base, { role: 'assistant', content: 'dynamic tail' }, { role: 'user', content: 'more dynamic' }];
    const h2 = pc.prefixHash({ messages: withTail, tools: TOOLS });
    expect(h2).toBe(h1);
    // Hashing the already-marked output gives the same fingerprint.
    const applied = pc.applyPromptCache({ messages: base, tools: TOOLS, sessionId: 's' });
    expect(pc.prefixHash({ messages: applied.messages, tools: applied.tools })).toBe(h1);
  });
});

// ─── US-D1.2: stable session_id derivation ──────────────────────────────────

describe('US-D1.2 — one stable session_id per delegation', () => {
  test('derivation is deterministic: same inputs, same id, every call', () => {
    const pc = impl('../../utils/promptCache');
    const a = pc.deriveSessionId({ agentId: 'cto', taskId: 112 });
    const b = pc.deriveSessionId({ agentId: 'cto', taskId: 112 });
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(b).toBe(a);
  });

  test('runId wins over taskId; different delegations get different ids', () => {
    const pc = impl('../../utils/promptCache');
    const byRun = pc.deriveSessionId({ agentId: 'cto', taskId: 112, runId: 'run-42' });
    const byRunAgain = pc.deriveSessionId({ agentId: 'cmo', taskId: 999, runId: 'run-42' });
    expect(byRun).toBe(byRunAgain); // the run IS the delegation scope
    expect(pc.deriveSessionId({ agentId: 'cto', taskId: 113 })).not.toBe(pc.deriveSessionId({ agentId: 'cto', taskId: 112 }));
    expect(pc.deriveSessionId({ agentId: 'cmo', taskId: 112 })).not.toBe(pc.deriveSessionId({ agentId: 'cto', taskId: 112 }));
  });

  test('a seed (task context) yields a stable id when no ids exist; nothing at all yields null', () => {
    const pc = impl('../../utils/promptCache');
    const a = pc.deriveSessionId({ agentId: 'execpm', seed: 'Task: coordinate the sprint.' });
    const b = pc.deriveSessionId({ agentId: 'execpm', seed: 'Task: coordinate the sprint.' });
    expect(a).toBe(b);
    expect(pc.deriveSessionId({ agentId: 'execpm', seed: 'Task: something else.' })).not.toBe(a);
    expect(pc.deriveSessionId({})).toBeNull();
    expect(pc.deriveSessionId()).toBeNull();
  });
});

// ─── Wire level: chatTurn / chatTurnDirect carry the cache construction ────

describe('US-D1 — chatTurn wire format (mocked transport)', () => {
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
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'answer' } }] } });
    delete process.env.MACF_PROMPT_CACHE;
    delete process.env.MACF_CACHE_MODE;
  });

  function lastBody() {
    return axios.post.mock.calls[axios.post.mock.calls.length - 1][1];
  }

  test('with a sessionId the body carries session_id and the marked stable prefix', async () => {
    const messages = [
      { role: 'system', content: 'Persona.' },
      { role: 'user', content: 'Task context.' },
    ];
    const before = snap(messages);
    await litellm.chatTurn({ messages, model: 'smart', sessionId: 'macf:cto:task:112', tools: TOOLS });
    const body = lastBody();
    expect(body.session_id).toBe('macf:cto:task:112');
    expect(markersIn(body.messages).map(f => f.message)).toEqual([0, 1]);
    expect(body.tools[body.tools.length - 1].cache_control).toEqual(MARKER);
    // The caller's array was not mutated by the wire build.
    expect(messages).toEqual(before);
  });

  test('without a sessionId the body is unchanged from today: no session_id, no markers', async () => {
    await litellm.chatTurn({ systemPrompt: 'Persona.', userMessage: 'hi', model: 'smart', tools: TOOLS });
    const body = lastBody();
    expect('session_id' in body).toBe(false);
    expect(markersIn(body.messages)).toEqual([]);
    expect(body.tools.every(t => t.cache_control === undefined)).toBe(true);
  });

  test('cacheMode system-only reaches the wire as system-only', async () => {
    await litellm.chatTurn({
      messages: [{ role: 'system', content: 'Persona.' }, { role: 'user', content: 'Task.' }],
      model: 'smart', sessionId: 'macf:cto:task:112', cacheMode: 'system-only', tools: TOOLS,
    });
    const body = lastBody();
    expect(body.session_id).toBe('macf:cto:task:112');
    expect(markersIn(body.messages).map(f => f.message)).toEqual([0]);
    expect(body.tools.every(t => t.cache_control === undefined)).toBe(true);
  });

  test('MACF_PROMPT_CACHE=off is an ops kill switch: no session, no markers', async () => {
    process.env.MACF_PROMPT_CACHE = 'off';
    await litellm.chatTurn({
      messages: [{ role: 'system', content: 'Persona.' }, { role: 'user', content: 'Task.' }],
      model: 'smart', sessionId: 'macf:cto:task:112', tools: TOOLS,
    });
    const body = lastBody();
    expect('session_id' in body).toBe(false);
    expect(markersIn(body.messages)).toEqual([]);
  });

  test('chatTurnDirect (OpenRouter) carries session_id and markers too', async () => {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'direct answer' } }] } });
    const turn = await litellm.chatTurnDirect({
      messages: [{ role: 'system', content: 'Persona.' }, { role: 'user', content: 'Task.' }],
      sessionId: 'macf:cto:task:112', tools: TOOLS,
    });
    expect(turn.text).toBe('direct answer');
    const call = axios.post.mock.calls.find(c => String(c[0]).includes('openrouter.ai'));
    expect(call).toBeTruthy();
    expect(call[1].session_id).toBe('macf:cto:task:112');
    expect(markersIn(call[1].messages).length).toBeGreaterThan(0);
    delete process.env.OPENROUTER_API_KEY;
  });
});
