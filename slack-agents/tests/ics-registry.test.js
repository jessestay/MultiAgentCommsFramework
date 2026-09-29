// tests/ics-registry.test.js — Investor Comms Service: CEO + surface plugin registry
//
// Contract: ics/registry.js exports
//   getActiveCeoId(cfg) -> cfg.ACTING_CEO_ID || cfg.CEO_SUCCESSION[0]
//   isAuthorizedEngine(engineId, cfg) -> true only for the active CEO id
//   registerSurface(name, adapter), unregisterSurface(name),
//   listSurfaces() -> string[], getSurface(name) -> adapter|undefined
// Adapter shape: {name, send(ctx, message) -> Promise<{status, detail?}>}
//   with status in delivered|failed|stubbed|queued.
'use strict';

const realConfig = require('../config');

function okAdapter(name) {
  return { name, send: async () => ({ status: 'delivered' }) };
}

describe('getActiveCeoId', () => {
  let registry;
  beforeEach(() => {
    jest.resetModules();
    registry = require('../ics/registry');
  });

  test('prefers ACTING_CEO_ID when set', () => {
    const cfg = { ACTING_CEO_ID: 'jarvis-jr', CEO_SUCCESSION: ['claude-dispatch', 'jarvis-jr', 'execPM'] };
    expect(registry.getActiveCeoId(cfg)).toBe('jarvis-jr');
  });

  test.each([[null], [undefined], ['']])(
    'falls back to CEO_SUCCESSION[0] when ACTING_CEO_ID is %p',
    (acting) => {
      const cfg = { ACTING_CEO_ID: acting, CEO_SUCCESSION: ['claude-dispatch', 'jarvis-jr'] };
      expect(registry.getActiveCeoId(cfg)).toBe('claude-dispatch');
    },
  );

  test('resolves the active CEO from the real MACF config', () => {
    // config.js: ACTING_CEO_ID='jarvis-jr' (set 2026-09-20, Claude Dispatch down)
    expect(realConfig.ACTING_CEO_ID).toBe('jarvis-jr');
    expect(registry.getActiveCeoId(realConfig)).toBe('jarvis-jr');
  });
});

describe('isAuthorizedEngine', () => {
  let registry;
  beforeEach(() => {
    jest.resetModules();
    registry = require('../ics/registry');
  });

  test('authorizes only the active CEO id', () => {
    const cfg = { ACTING_CEO_ID: 'jarvis-jr', CEO_SUCCESSION: ['claude-dispatch', 'jarvis-jr', 'execPM'] };
    expect(registry.isAuthorizedEngine('jarvis-jr', cfg)).toBe(true);
    expect(registry.isAuthorizedEngine('execPM', cfg)).toBe(false); // in-succession but not active
    expect(registry.isAuthorizedEngine('claude-dispatch', cfg)).toBe(false);
    expect(registry.isAuthorizedEngine('random-engine', cfg)).toBe(false);
    expect(registry.isAuthorizedEngine(undefined, cfg)).toBe(false);
    expect(registry.isAuthorizedEngine(null, cfg)).toBe(false);
  });

  test('follows cutover: after ACTING_CEO_ID changes, old engine is rejected', () => {
    const before = { ACTING_CEO_ID: 'jarvis-jr', CEO_SUCCESSION: ['claude-dispatch', 'jarvis-jr'] };
    const after = { ACTING_CEO_ID: 'claude-dispatch', CEO_SUCCESSION: ['claude-dispatch', 'jarvis-jr'] };
    expect(registry.isAuthorizedEngine('jarvis-jr', before)).toBe(true);
    expect(registry.isAuthorizedEngine('jarvis-jr', after)).toBe(false);
    expect(registry.isAuthorizedEngine('claude-dispatch', after)).toBe(true);
  });
});

describe('surface plugin registry', () => {
  let registry;
  beforeEach(() => {
    jest.resetModules();
    registry = require('../ics/registry');
  });

  test('registerSurface + listSurfaces round-trips names', () => {
    expect(registry.listSurfaces()).toEqual([]);
    registry.registerSurface('slack-dm', okAdapter('slack-dm'));
    registry.registerSurface('slice', okAdapter('slice'));
    expect(registry.listSurfaces().sort()).toEqual(['slack-dm', 'slice']);
  });

  test('getSurface returns the registered adapter', () => {
    const adapter = okAdapter('muse-chat');
    registry.registerSurface('muse-chat', adapter);
    expect(registry.getSurface('muse-chat')).toBe(adapter);
    expect(registry.getSurface('nope')).toBeUndefined();
  });

  test('re-registering a name replaces the adapter', () => {
    const first = okAdapter('slice');
    const second = okAdapter('slice');
    registry.registerSurface('slice', first);
    registry.registerSurface('slice', second);
    expect(registry.getSurface('slice')).toBe(second);
    expect(registry.listSurfaces()).toEqual(['slice']);
  });

  test('unregisterSurface removes the surface; unknown names do not throw', () => {
    registry.registerSurface('slice', okAdapter('slice'));
    registry.unregisterSurface('slice');
    expect(registry.listSurfaces()).toEqual([]);
    expect(registry.getSurface('slice')).toBeUndefined();
    expect(() => registry.unregisterSurface('never-registered')).not.toThrow();
  });

  test('registerSurface rejects adapters without a send function', () => {
    expect(() => registry.registerSurface('bad', { name: 'bad' })).toThrow();
    expect(() => registry.registerSurface('bad', null)).toThrow();
    expect(registry.listSurfaces()).toEqual([]);
  });

  test('registerSurface rejects non-string names', () => {
    expect(() => registry.registerSurface(42, okAdapter('x'))).toThrow();
    expect(() => registry.registerSurface('', okAdapter('x'))).toThrow();
  });

  test('listSurfaces returns a fresh array (mutating it does not affect the registry)', () => {
    registry.registerSurface('slice', okAdapter('slice'));
    const names = registry.listSurfaces();
    names.push('hacked');
    expect(registry.listSurfaces()).toEqual(['slice']);
  });

  test('registered adapters expose the required send shape', async () => {
    const adapter = okAdapter('slack-dm');
    registry.registerSurface('slack-dm', adapter);
    const res = await registry.getSurface('slack-dm').send({}, { body: 'hi' });
    expect(['delivered', 'failed', 'stubbed', 'queued']).toContain(res.status);
  });
});
