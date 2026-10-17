'use strict';
// Missing-capability escalation — structured signal + PM → CEO routing tests.
// When an agent lacks the tools/tech/code/architecture to complete a request,
// it emits {agent, task, missing[], attempted[], timestamp}; the engine routes
// it PM → CEO instead of letting the task silently stall.

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  emitMissingCapability,
  routeMissingCapability,
  pendingSignals,
  ROUTE,
} = require('../../missingCapability');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mcq-')), 'queue.json');
}

describe('missing-capability signal', () => {
  test('emits a well-formed signal with timestamp', () => {
    const q = tmpFile();
    const s = emitMissingCapability({
      agent: 'cuxo',
      task: 'Compose Canva graphic for LinkedIn draft #2',
      missing: ['canva-mcp'],
      attempted: ['image_search', 'media-pipeline'],
    }, { queuePath: q });
    expect(s.agent).toBe('cuxo');
    expect(s.task).toBeTruthy();
    expect(s.missing).toEqual(['canva-mcp']);
    expect(s.attempted).toEqual(['image_search', 'media-pipeline']);
    expect(typeof s.timestamp).toBe('string');
    expect(new Date(s.timestamp).getTime()).not.toBeNaN();
    expect(s.id).toBeTruthy();
  });

  test('rejects a signal with an empty missing[] — that is not a capability gap', () => {
    const q = tmpFile();
    expect(() => emitMissingCapability({
      agent: 'cuxo', task: 'x', missing: [], attempted: [],
    }, { queuePath: q })).toThrow();
  });

  test('rejects a signal missing agent or task', () => {
    const q = tmpFile();
    expect(() => emitMissingCapability({ task: 'x', missing: ['a'] }, { queuePath: q })).toThrow();
    expect(() => emitMissingCapability({ agent: 'cuxo', missing: ['a'] }, { queuePath: q })).toThrow();
  });

  test('signal is persisted to the queue', () => {
    const q = tmpFile();
    const s = emitMissingCapability({
      agent: 'cto', task: 'Verify Meta pixel', missing: ['meta-events-api'], attempted: ['browser'],
    }, { queuePath: q });
    const stored = JSON.parse(fs.readFileSync(q, 'utf8'));
    expect(stored.some((x) => x.id === s.id)).toBe(true);
  });
});

describe('missing-capability routing', () => {
  test('route order is PM first, then CEO', () => {
    expect(ROUTE).toEqual(['execPM', 'CEO']);
  });

  test('routing a signal records the PM → CEO path with timestamps', () => {
    const q = tmpFile();
    const s = emitMissingCapability({
      agent: 'cuxo', task: 'Canva graphic', missing: ['canva-mcp'], attempted: [],
    }, { queuePath: q });
    const routed = routeMissingCapability(s.id, { queuePath: q });
    expect(routed.route).toEqual(['execPM', 'CEO']);
    expect(routed.status).toBe('routed');
    expect(typeof routed.routed_at).toBe('string');
    expect(routed.current_holder).toBe('execPM');
  });

  test('routing an unknown signal id throws (fail closed, no silent drop)', () => {
    const q = tmpFile();
    expect(() => routeMissingCapability('nope', { queuePath: q })).toThrow();
  });

  test('pendingSignals returns only unrouted signals', () => {
    const q = tmpFile();
    const a = emitMissingCapability({ agent: 'cmo', task: 't1', missing: ['x'], attempted: [] }, { queuePath: q });
    const b = emitMissingCapability({ agent: 'cco', task: 't2', missing: ['y'], attempted: [] }, { queuePath: q });
    routeMissingCapability(a.id, { queuePath: q });
    const pending = pendingSignals({ queuePath: q });
    expect(pending.map((x) => x.id)).toEqual([b.id]);
  });

  test('a routed signal escalates execPM → CEO: escalation is recorded, not just hoped for', () => {
    const q = tmpFile();
    const s = emitMissingCapability({
      agent: 'lawyer', task: 'File review', missing: ['court-records-api'], attempted: ['web-search'],
    }, { queuePath: q });
    const routed = routeMissingCapability(s.id, { queuePath: q });
    // Escalation ladder: the PM owns first response; CEO is the backstop.
    expect(routed.escalation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ holder: 'execPM' }),
        expect.objectContaining({ holder: 'CEO' }),
      ])
    );
  });
});
