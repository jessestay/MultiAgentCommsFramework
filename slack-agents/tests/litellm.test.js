// tests/litellm.test.js — LiteLLM (local Ollama) backend + AI_BACKEND router
// The HTTP layer is stubbed via global.fetch; no live LiteLLM/Ollama is used.
'use strict';

const LITELLM_URL = 'http://127.0.0.1:4000/v1/chat/completions';

// Guard: the Anthropic SDK must never be called by the litellm backend.
const mockAnthropicCreate = jest.fn().mockResolvedValue({
  content: [{ text: 'anthropic-direct response' }],
});
jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({ messages: { create: mockAnthropicCreate } }))
);

const ENV_KEYS = ['AI_BACKEND', 'LITELLM_QUICK_MODEL', 'LITELLM_SMART_MODEL', 'LITELLM_BEST_MODEL'];
const savedEnv = {};
const originalFetch = global.fetch;

function okResponse(content = 'local model says hi') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { role: 'assistant', content } }] }),
    text: async () => '',
  };
}

function errorResponse(status = 500, body = 'Internal Server Error') {
  return {
    ok: false,
    status,
    json: async () => ({ error: body }),
    text: async () => body,
  };
}

function loadLitellm() {
  let mod;
  jest.isolateModules(() => { mod = require('../utils/litellm'); });
  return mod;
}

function lastRequest() {
  const [url, init] = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
  return { url, init, body: JSON.parse(init.body) };
}

beforeEach(() => {
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  global.fetch = jest.fn().mockResolvedValue(okResponse());
  mockAnthropicCreate.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
  }
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('litellm backend — exports', () => {
  test('exposes the same interface as the anthropic wrapper', () => {
    const llm = loadLitellm();
    expect(typeof llm.chat).toBe('function');
    expect(typeof llm.generateReport).toBe('function');
    expect(typeof llm.generateProactivePost).toBe('function');
    expect(llm.QUICK_MODEL).toBe('quick');
    expect(llm.SMART_MODEL).toBe('smart');
    expect(llm.BEST_MODEL).toBe('best');
  });
});

describe('litellm backend — tier resolution', () => {
  test.each([
    [undefined, 'quick'],
    ['quick', 'quick'],
    ['smart', 'smart'],
    ['best', 'best'],
  ])('model %p → LiteLLM alias %p by default', async (model, expected) => {
    const llm = loadLitellm();
    await llm.chat({ systemPrompt: 's', userMessage: 'u', model });
    expect(lastRequest().body.model).toBe(expected);
  });

  test('tier env vars override the aliases', async () => {
    process.env.LITELLM_QUICK_MODEL = 'ollama/q-model';
    process.env.LITELLM_SMART_MODEL = 'ollama/s-model';
    process.env.LITELLM_BEST_MODEL = 'ollama/b-model';
    const llm = loadLitellm();
    await llm.chat({ systemPrompt: 's', userMessage: 'u', model: 'quick' });
    expect(lastRequest().body.model).toBe('ollama/q-model');
    await llm.chat({ systemPrompt: 's', userMessage: 'u', model: 'smart' });
    expect(lastRequest().body.model).toBe('ollama/s-model');
    await llm.chat({ systemPrompt: 's', userMessage: 'u', model: 'best' });
    expect(lastRequest().body.model).toBe('ollama/b-model');
  });

  test('a full model ID is passed through unchanged', async () => {
    const llm = loadLitellm();
    await llm.chat({ systemPrompt: 's', userMessage: 'u', model: 'ollama/some-model:7b' });
    expect(lastRequest().body.model).toBe('ollama/some-model:7b');
  });

  test('generateReport defaults to smart, generateProactivePost to quick', async () => {
    const llm = loadLitellm();
    await llm.generateReport({ systemPrompt: 's', context: 'c' });
    expect(lastRequest().body.model).toBe('smart');
    await llm.generateProactivePost({ systemPrompt: 's', context: 'c' });
    expect(lastRequest().body.model).toBe('quick');
    await llm.generateReport({ systemPrompt: 's', context: 'c', model: 'best' });
    expect(lastRequest().body.model).toBe('best');
  });
});

describe('litellm backend — request shape', () => {
  test('POSTs OpenAI-compatible JSON to local LiteLLM with no API key', async () => {
    const llm = loadLitellm();
    await llm.chat({ systemPrompt: 'You are CMO.', userMessage: 'Hello', maxTokens: 321 });
    const { url, init, body } = lastRequest();
    expect(url).toBe(LITELLM_URL);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    const headerNames = Object.keys(init.headers).map(h => h.toLowerCase());
    expect(headerNames).not.toContain('authorization');
    expect(headerNames).not.toContain('x-api-key');
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are CMO.' },
      { role: 'user', content: 'Hello' },
    ]);
    expect(body.max_tokens).toBe(321);
  });

  test('max_tokens defaults to 1024 for chat', async () => {
    const llm = loadLitellm();
    await llm.chat({ systemPrompt: 's', userMessage: 'u' });
    expect(lastRequest().body.max_tokens).toBe(1024);
  });

  test('omits the system message when no system prompt is given', async () => {
    const llm = loadLitellm();
    await llm.chat({ userMessage: 'just me' });
    expect(lastRequest().body.messages).toEqual([{ role: 'user', content: 'just me' }]);
  });

  test('generateReport and generateProactivePost honor maxTokens and embed context', async () => {
    const llm = loadLitellm();
    await llm.generateReport({ systemPrompt: 'sys', context: 'REPORT-CTX' });
    let body = lastRequest().body;
    expect(body.max_tokens).toBe(1200);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toContain('REPORT-CTX');

    await llm.generateProactivePost({ systemPrompt: 'sys', context: 'POST-CTX', maxTokens: 99 });
    body = lastRequest().body;
    expect(body.max_tokens).toBe(99);
    expect(body.messages[1].content).toContain('POST-CTX');
  });
});

describe('litellm backend — response parsing', () => {
  test('returns choices[0].message.content', async () => {
    global.fetch.mockResolvedValueOnce(okResponse('Parsed answer'));
    const llm = loadLitellm();
    await expect(llm.chat({ systemPrompt: 's', userMessage: 'u' })).resolves.toBe('Parsed answer');
  });

  test('generateReport returns the parsed content', async () => {
    global.fetch.mockResolvedValueOnce(okResponse('Report body'));
    const llm = loadLitellm();
    await expect(llm.generateReport({ systemPrompt: 's', context: 'c' })).resolves.toBe('Report body');
  });

  test('throws on a malformed response body', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ choices: [] }), text: async () => '' });
    const llm = loadLitellm();
    await expect(llm.chat({ systemPrompt: 's', userMessage: 'u' })).rejects.toThrow();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('litellm backend — errors (log + throw, no retry, no paid fallback)', () => {
  test('HTTP 500 logs and throws, calling fetch exactly once', async () => {
    global.fetch.mockResolvedValue(errorResponse(500, 'model crashed'));
    const llm = loadLitellm();
    await expect(llm.chat({ systemPrompt: 's', userMessage: 'u', model: 'smart' })).rejects.toThrow(/500/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();
    expect(console.error.mock.calls[0].join(' ')).toMatch(/litellm/);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  test('connection refused logs and throws, calling fetch exactly once', async () => {
    const refused = new TypeError('fetch failed');
    refused.cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:4000'), { code: 'ECONNREFUSED' });
    global.fetch.mockRejectedValue(refused);
    const llm = loadLitellm();
    await expect(llm.generateReport({ systemPrompt: 's', context: 'c' })).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();
    expect(console.error.mock.calls[0].join(' ')).toMatch(/ECONNREFUSED/);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  test('router in litellm mode does not fall back to Anthropic on failure', async () => {
    process.env.AI_BACKEND = 'litellm';
    global.fetch.mockResolvedValue(errorResponse(500));
    let ai;
    jest.isolateModules(() => { ai = require('../utils/anthropic'); });
    await expect(ai.generateProactivePost({ systemPrompt: 's', context: 'c' })).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });
});

describe('AI_BACKEND router (utils/anthropic.js)', () => {
  function loadRouterAnd(backendFile) {
    let router, backend;
    jest.isolateModules(() => {
      router = require('../utils/anthropic');
      backend = require(`../utils/${backendFile}`);
    });
    return { router, backend };
  }

  const EXPORTS = ['chat', 'generateReport', 'generateProactivePost', 'QUICK_MODEL', 'SMART_MODEL', 'BEST_MODEL'];

  test('AI_BACKEND=litellm routes to utils/litellm', async () => {
    process.env.AI_BACKEND = 'litellm';
    const { router, backend } = loadRouterAnd('litellm');
    for (const name of EXPORTS) expect(router[name]).toBe(backend[name]);
    await router.chat({ systemPrompt: 's', userMessage: 'u' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  test('unset AI_BACKEND routes to utils/anthropic-direct', async () => {
    const { router, backend } = loadRouterAnd('anthropic-direct');
    for (const name of EXPORTS) expect(router[name]).toBe(backend[name]);
    await expect(router.chat({ systemPrompt: 's', userMessage: 'u' })).resolves.toBe('anthropic-direct response');
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  test('AI_BACKEND=anthropic routes to utils/anthropic-direct without warning', () => {
    process.env.AI_BACKEND = 'anthropic';
    const { router, backend } = loadRouterAnd('anthropic-direct');
    expect(router.chat).toBe(backend.chat);
    expect(console.warn).not.toHaveBeenCalled();
  });

  test('unknown AI_BACKEND warns and routes to utils/anthropic-direct', () => {
    process.env.AI_BACKEND = 'bogus';
    const { router, backend } = loadRouterAnd('anthropic-direct');
    for (const name of EXPORTS) expect(router[name]).toBe(backend[name]);
    expect(console.warn).toHaveBeenCalled();
    expect(console.warn.mock.calls[0].join(' ')).toMatch(/bogus/);
  });

  test('anthropic-direct keeps its original model tiers', () => {
    const { backend } = loadRouterAnd('anthropic-direct');
    expect(backend.QUICK_MODEL).toMatch(/^claude-/);
    expect(backend.SMART_MODEL).toMatch(/^claude-/);
    expect(backend.BEST_MODEL).toMatch(/^claude-/);
  });
});
