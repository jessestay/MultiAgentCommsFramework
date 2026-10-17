/**
 * LLM canary tests (Oct 12, 2026 — CEO mechanism repair).
 *
 * Pins the classification matrix and the bounded repair behavior:
 * a healthy stack costs one call and writes no gap; a gateway-only failure
 * files llm_gateway_down; a total failure tries exactly one cache-reset
 * retest, and only files llm_path_down when the retest also fails.
 * All litellm calls are injected fakes — no network, no production state.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { classify, runCanary } = require('../llm-canary');
const { logEngineGap, readGaps } = require('../engineGap');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'canary-test-'));
}

describe('classify', () => {
  test('stack ok is HEALTHY regardless of legs', () => {
    expect(classify({ stackOk: true, directOk: false })).toBe('HEALTHY');
    expect(classify({ stackOk: true, directOk: true })).toBe('HEALTHY');
  });
  test('stack down + direct up is GATEWAY_DOWN', () => {
    expect(classify({ stackOk: false, directOk: true })).toBe('GATEWAY_DOWN');
  });
  test('both down is TOTAL_DOWN', () => {
    expect(classify({ stackOk: false, directOk: false })).toBe('TOTAL_DOWN');
  });
  test('stack ok but slower than threshold is DEGRADED, not HEALTHY', () => {
    expect(classify({ stackOk: true, stackMs: 46000, slowMs: 45000 })).toBe('DEGRADED');
    expect(classify({ stackOk: true, stackMs: 44999, slowMs: 45000 })).toBe('HEALTHY');
    expect(classify({ stackOk: true })).toBe('HEALTHY');
  });
});

describe('runCanary', () => {
  test('healthy stack: one call, no leg probes, no gap, state written', async () => {
    const dir = tmpDir();
    const calls = { chat: 0, direct: 0, reachable: 0, gaps: 0 };
    const litellm = {
      chat: async () => { calls.chat++; return 'pong'; },
      chatTurn: async () => ({ text: 'done', toolCalls: [{ name: 'get_value' }] }),
      chatTurnDirect: async () => { calls.direct++; return { text: 'pong' }; },
      gatewayReachable: async () => { calls.reachable++; return true; },
      _resetGatewayCache: () => {},
    };
    const r = await runCanary({
      litellm,
      gapFn: () => { calls.gaps++; return true; },
      statePath: path.join(dir, 'state.json'),
    });
    expect(r.status).toBe('HEALTHY');
    expect(calls).toEqual({ chat: 1, direct: 0, reachable: 0, gaps: 0 });
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
    expect(saved.status).toBe('HEALTHY');
    expect(saved.history).toHaveLength(1);
  });

  test('gateway down: direct carries the attribution, gap filed once', async () => {
    const calls = { gaps: [] };
    const litellm = {
      chat: async () => { throw new Error('gateway timeout'); },
      chatTurnDirect: async () => ({ text: 'pong' }),
      gatewayReachable: async () => false,
      _resetGatewayCache: () => {},
    };
    const r = await runCanary({
      litellm,
      gapFn: (type, detail, source) => { calls.gaps.push({ type, source }); return true; },
      statePath: path.join(tmpDir(), 'state.json'),
    });
    expect(r.status).toBe('GATEWAY_DOWN');
    expect(r.routes.direct).toBe(true);
    expect(calls.gaps).toEqual([{ type: 'llm_gateway_down', source: 'llm-canary' }]);
  });

  test('tools probe failure degrades an otherwise healthy stack', async () => {
    const gaps = [];
    const litellm = {
      chat: async () => 'A paragraph of probe output.',
      chatTurn: async () => { throw new Error('tools call timed out'); },
      chatTurnDirect: async () => ({ text: 'pong' }),
      gatewayReachable: async () => true,
      _resetGatewayCache: () => {},
    };
    const r = await runCanary({
      litellm,
      gapFn: (type) => { gaps.push(type); return true; },
      statePath: path.join(tmpDir(), 'state.json'),
    });
    expect(r.status).toBe('DEGRADED');
    expect(r.tools.ok).toBe(false);
    expect(gaps).toEqual(['llm_path_slow']);
  });

  test('slow success files llm_path_slow and reports DEGRADED', async () => {
    const gaps = [];
    const litellm = {
      chat: async () => 'A paragraph of probe output.',
      chatTurn: async () => ({ text: 'done', toolCalls: [] }),
      chatTurnDirect: async () => ({ text: 'pong' }),
      gatewayReachable: async () => true,
      _resetGatewayCache: () => {},
    };
    const r = await runCanary({
      litellm,
      gapFn: (type) => { gaps.push(type); return true; },
      statePath: path.join(tmpDir(), 'state.json'),
      slowMs: -1, // any real latency exceeds a -1ms threshold
    });
    expect(r.status).toBe('DEGRADED');
    expect(gaps).toEqual(['llm_path_slow']);
  });

  test('total down + cache reset recovers: repaired, no gap', async () => {
    let chatCalls = 0;
    let resets = 0;
    const gaps = [];
    const litellm = {
      chat: async () => { chatCalls++; if (chatCalls < 2) throw new Error('connect ECONNREFUSED'); return 'pong'; },
      chatTurnDirect: async () => { throw new Error('429 rate limited'); },
      gatewayReachable: async () => false,
      _resetGatewayCache: () => { resets++; },
    };
    const r = await runCanary({
      litellm,
      gapFn: (...a) => { gaps.push(a); return true; },
      statePath: path.join(tmpDir(), 'state.json'),
    });
    expect(r.status).toBe('RECOVERED_AFTER_CACHE_RESET');
    expect(resets).toBe(1);
    expect(chatCalls).toBe(2);
    expect(gaps).toHaveLength(0);
  });

  test('total down + retest fails: llm_path_down gap filed', async () => {
    const gaps = [];
    const litellm = {
      chat: async () => { throw new Error('connect ECONNREFUSED'); },
      chatTurnDirect: async () => { throw new Error('402 payment required'); },
      gatewayReachable: async () => false,
      _resetGatewayCache: () => {},
    };
    const r = await runCanary({
      litellm,
      gapFn: (type) => { gaps.push(type); return true; },
      statePath: path.join(tmpDir(), 'state.json'),
    });
    expect(r.status).toBe('TOTAL_DOWN');
    expect(gaps).toEqual(['llm_path_down']);
  });
});

describe('engineGap.logEngineGap', () => {
  test('appends in the shared format and dedupes the same type within 24h', () => {
    const file = path.join(tmpDir(), 'gaps.json');
    expect(logEngineGap('llm_path_down', 'first', 'test', file)).toBe(true);
    expect(logEngineGap('llm_path_down', 'duplicate', 'test', file)).toBe(false);
    expect(logEngineGap('directive_dead_letter', 'other type', 'test', file)).toBe(true);
    const gaps = readGaps(file);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toMatchObject({ type: 'llm_path_down', detail: 'first', source: 'test', status: 'open' });
    expect(typeof gaps[0].timestamp).toBe('string');
  });

  test('a corrupt gaps file is treated as empty, never throws', () => {
    const file = path.join(tmpDir(), 'gaps.json');
    fs.writeFileSync(file, 'not json');
    expect(logEngineGap('x', 'y', 'test', file)).toBe(true);
    expect(readGaps(file)).toHaveLength(1);
  });
});
