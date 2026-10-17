// durable-b3-intake-perms — Phase B deployment regression (Oct 16, 2026).
//
// Live find during the Phase B flag flip: the poller runs as root, the
// engine as macf. The first intake record landed 660 root:root; the
// engine's dispatch loop could not read it and skipped it silently —
// the directive sat at 'registered' forever. These tests pin the fix:
// every file in the poller<->engine handoff is world-readable, and an
// unreadable intake record is logged loudly instead of skipped in
// silence.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function impl(rel, name) {
  try { return require(rel); }
  catch (e) { throw new Error(`missing implementation ${name}: ${e.message}`); }
}

function tmpdir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `macf-b3-${tag}-`));
}

function othersReadable(file) {
  const mode = fs.statSync(file).mode;
  return (mode & 0o004) !== 0;
}

describe('Phase B handoff file permissions', () => {
  test('intake records are world-readable after register', async () => {
    const { createIntakeStore } = impl('../../engine/directiveIntake', 'engine/directiveIntake');
    const dir = tmpdir('intake');
    const store = createIntakeStore(dir);
    await store.register({
      channel: 'C1', ts: '111.222', msgTs: 111.222, agentId: 'cmo',
      text: '[from: CEO → CMO] test', checkpointRunId: 'directive:C1:111.222',
    });
    const file = path.join(dir, `${encodeURIComponent('C1:111.222')}.json`);
    expect(fs.existsSync(file)).toBe(true);
    expect(othersReadable(file)).toBe(true);
  });

  test('intake records stay world-readable after engine update', async () => {
    const { createIntakeStore } = impl('../../engine/directiveIntake', 'engine/directiveIntake');
    const dir = tmpdir('intake2');
    const store = createIntakeStore(dir);
    await store.register({
      channel: 'C1', ts: '333.444', msgTs: 333.444, agentId: 'cto',
      text: '[from: CEO → CTO] test', checkpointRunId: 'directive:C1:333.444',
    });
    await store.update('C1:333.444', { status: 'dispatched', runId: 'run-1' });
    const file = path.join(dir, `${encodeURIComponent('C1:333.444')}.json`);
    expect(othersReadable(file)).toBe(true);
  });

  test('heartbeat file is world-readable', async () => {
    const { createIntakeStore } = impl('../../engine/directiveIntake', 'engine/directiveIntake');
    const dir = tmpdir('hb');
    const store = createIntakeStore(dir);
    store.touchHeartbeat();
    const file = path.join(dir, 'engine-heartbeat.json');
    expect(fs.existsSync(file)).toBe(true);
    expect(othersReadable(file)).toBe(true);
    expect(store.heartbeatFresh(60000)).toBe(true);
  });

  test('checkpoint adapter files are world-readable after set', async () => {
    const { createFileAdapter } = impl('../../utils/checkpointAdapters', 'utils/checkpointAdapters');
    const dir = tmpdir('ckpt');
    const adapter = createFileAdapter({ dir });
    await adapter.set('checkpoint:run-1', JSON.stringify({ runId: 'run-1' }));
    const names = fs.readdirSync(dir).filter(n => n.endsWith('.json'));
    expect(names.length).toBe(1);
    expect(othersReadable(path.join(dir, names[0]))).toBe(true);
    expect(await adapter.get('checkpoint:run-1')).toContain('run-1');
  });

  test('list() logs loudly on an unreadable record instead of skipping silently', async () => {
    const { createIntakeStore } = impl('../../engine/directiveIntake', 'engine/directiveIntake');
    const dir = tmpdir('loud');
    const store = createIntakeStore(dir);
    const bad = path.join(dir, `${encodeURIComponent('C9:999.999')}.json`);
    fs.writeFileSync(bad, JSON.stringify({ key: 'C9:999.999', status: 'registered' }));
    fs.chmodSync(bad, 0o000);
    const errs = [];
    const orig = console.error;
    console.error = (...a) => errs.push(a.join(' '));
    try {
      // As root the file is still readable; the log assertion only
      // applies when the current user genuinely cannot read it.
      if (process.getuid && process.getuid() !== 0) {
        const out = await store.list('registered');
        expect(out.length).toBe(0);
        expect(errs.some(l => l.includes('cannot read intake record'))).toBe(true);
      } else {
        const out = await store.list('registered');
        expect(out.length).toBe(1);
      }
    } finally {
      console.error = orig;
      fs.chmodSync(bad, 0o644);
    }
  });
});
