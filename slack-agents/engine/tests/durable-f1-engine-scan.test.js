// durable-f1-engine-scan — Phase F (Vikunja #789, US-F1 machinery):
// the engine-side directive scanner + intake cycle.
//
// The Phase B poller scans Slack channels, registers directives in the
// durable intake, and finalizes settled records — all inside a 5-minute
// cron process whose cycle budget is consumed by retry drains BEFORE the
// scan runs, so during a gateway streak new directives can starve for
// multiple cycles (observed live Oct 16, 2026: watermark unmoved across
// several polls). Phase F moves the scan into the engine as a
// Hatchet-cron-driven cycle whose FIRST step is always the scan:
//
//   scan (register new) -> drain queues (register retries/requeues)
//   -> consume settled records (finalize via the shared finalize path)
//
// Criteria encoded here:
//   F1-a  a new [from: CEO → Role] directive found by the scan is
//         registered in the intake under the deterministic checkpoint
//         run ID, and the channel watermark advances exactly to it.
//   F1-b  the watermark NEVER advances past a directive whose
//         registration failed — the scan stops at that message and the
//         next cycle retries it (no missed directives by construction).
//   F1-c  non-directive and unroutable messages advance the watermark
//         without any registration.
//   F1-d  an artifact-reference directive with no URLs/paths is
//         dead-lettered at scan time (same rule as the poller) and the
//         watermark advances past it.
//   F1-e  'received' health/dedupe is counted once per unique directive
//         even if the same message is scanned again.
//   F1-f  a [ROADBLOCK: ...] report registers an execPM roadblock record
//         (kind 'roadblock') instead of a directive, and is recorded in
//         the roadblocks file.
//   F1-g  zero-missed audit: a routable directive sitting BELOW the
//         watermark that was never received/registered/queued is
//         reported to the retirement tracker as a missed directive.
//   F1-h  scan-first ordering: runIntakeCycle registers newly scanned
//         directives even when the drain/consume stages fail — drains
//         can never starve the scan.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-f1-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_GAPS_PATH = path.join(TMP, '.engine-gaps.json');
delete process.env.VIKUNJA_TOKEN;

jest.mock('../collaboration', () => ({ suggestCollaboration: async () => {} }));

function impl(rel, name) {
  try { return require(rel); }
  catch (e) { throw new Error(`missing implementation ${name}: ${e.message}`); }
}

const CH = 'C0ASH4TF604'; // #management

function directiveMsg(ts, to, body) {
  return { ts, text: `[from: CEO → ${to}] ${body}` };
}

function fakeClient(messagesByChannel) {
  return {
    conversations: {
      history: jest.fn(async ({ channel }) => ({ messages: (messagesByChannel[channel] || []).slice() })),
      replies: jest.fn(async () => ({ messages: [] })),
    },
    chat: { postMessage: jest.fn(async () => ({ ts: '1700000000.000001' })) },
  };
}

function makeScanner(messages, extraDeps = {}) {
  const scanMod = impl('../directiveScan', 'engine/directiveScan');
  const { createIntakeStore } = impl('../directiveIntake', 'engine/directiveIntake');
  const intakeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-f1-intake-'));
  const intake = createIntakeStore(intakeDir);
  const client = fakeClient({ [CH]: messages });
  const scanner = scanMod.createDirectiveScanner({
    client,
    intake,
    channels: [CH],
    roadblocksPath: path.join(TMP, `roadblocks-${Math.random().toString(36).slice(2, 8)}.json`),
    ...extraDeps,
  });
  return { scanner, intake, client };
}

describe('US-F1 engine-side scanner', () => {
  test('F1-a: registers a new directive and advances the watermark exactly to it', async () => {
    const { scanner, intake } = makeScanner([
      directiveMsg('100.001', 'CTO', 'do the thing https://example.com/x'),
      { ts: '100.002', text: 'just chatter' },
    ]);
    const state = {};
    const summary = await scanner.scanChannel(state, CH);
    expect(summary.registered).toBe(1);
    const rec = await intake.get(`${CH}:100.001`);
    expect(rec).not.toBeNull();
    expect(rec.agentId).toBe('cto');
    expect(rec.status).toBe('registered');
    expect(rec.checkpointRunId).toBe(`directive:${CH}:100.001`);
    // Watermark covers both handled messages (directive registered,
    // chatter is a non-directive) — and nothing beyond them.
    expect(state[CH]).toBe('100.002');
  });

  test('F1-b: a failed registration stops the scan — watermark never passes the unregistered directive', async () => {
    const scanMod = impl('../directiveScan', 'engine/directiveScan');
    const { createIntakeStore } = impl('../directiveIntake', 'engine/directiveIntake');
    const intake = createIntakeStore(fs.mkdtempSync(path.join(os.tmpdir(), 'macf-f1-intake-')));
    const realRegister = intake.register.bind(intake);
    let calls = 0;
    intake.register = async (rec) => {
      calls++;
      if (calls === 2) throw new Error('intake write exploded');
      return realRegister(rec);
    };
    const client = fakeClient({
      [CH]: [
        directiveMsg('200.001', 'CTO', 'first https://example.com/1'),
        directiveMsg('200.002', 'CMO', 'second https://example.com/2'),
        directiveMsg('200.003', 'CTO', 'third https://example.com/3'),
      ],
    });
    const scanner = scanMod.createDirectiveScanner({ client, intake, channels: [CH] });
    const state = {};
    await scanner.scanChannel(state, CH);
    // First directive registered; the second failed; the third was
    // never attempted (ordering preserved for the next cycle).
    expect(await intake.get(`${CH}:200.001`)).not.toBeNull();
    expect(await intake.get(`${CH}:200.003`)).toBeNull();
    expect(parseFloat(state[CH])).toBe(200.001);
  });

  test('F1-c: unroutable targets and non-directives advance without registering', async () => {
    const { scanner, intake } = makeScanner([
      { ts: '300.001', text: '[from: CEO → Nobody] hello' },
      { ts: '300.002', text: 'standup notes, no header' },
    ]);
    const state = {};
    const summary = await scanner.scanChannel(state, CH);
    expect(summary.registered).toBe(0);
    expect((await intake.list()).length).toBe(0);
    expect(state[CH]).toBe('300.002');
  });

  test('F1-d: artifact directive without URLs/paths is dead-lettered at scan, watermark advances', async () => {
    const { scanner, intake } = makeScanner([
      directiveMsg('400.001', 'CMO', 'Please review the attached PDFs and check the designs'),
    ]);
    const state = {};
    await scanner.scanChannel(state, CH);
    expect((await intake.list()).length).toBe(0);
    expect(Array.isArray(state._deadLetter)).toBe(true);
    expect(state._deadLetter).toHaveLength(1);
    expect(state._deadLetter[0]).toMatchObject({ channel: CH, ts: '400.001', reason: 'missing_artifacts' });
    expect(state[CH]).toBe('400.001');
  });

  test('F1-e: received is deduped across scans of the same message', async () => {
    const { scanner } = makeScanner([
      directiveMsg('500.001', 'CTO', 'once only https://example.com/once'),
    ]);
    const state = {};
    await scanner.scanChannel(state, CH);
    expect(state._receivedDirectives).toEqual([`${CH}:500.001`]);
    // Simulate a watermark reset (e.g. state repair): the same message
    // is scanned again — no second 'received', no duplicate record.
    delete state[CH];
    await scanner.scanChannel(state, CH);
    expect(state._receivedDirectives).toEqual([`${CH}:500.001`]);
  });

  test('F1-f: a roadblock registers an execPM roadblock record, not a directive', async () => {
    const rbPath = path.join(TMP, 'roadblocks-f1f.json');
    const { scanner, intake } = makeScanner([
      { ts: '600.001', text: '[ROADBLOCK: CMO] NEED: a Canva token | TRIED: refresh | BLOCKED BY: expired grant' },
    ], { roadblocksPath: rbPath });
    const state = {};
    await scanner.scanChannel(state, CH);
    const rec = await intake.get(`${CH}:600.001`);
    expect(rec).not.toBeNull();
    expect(rec.agentId).toBe('execPM');
    expect(rec.kind).toBe('roadblock');
    expect(rec.text).toContain('CAPABILITY REQUEST');
    const roadblocks = JSON.parse(fs.readFileSync(rbPath, 'utf8'));
    expect(roadblocks).toHaveLength(1);
    expect(roadblocks[0]).toMatchObject({ agent: 'CMO', channel: CH, status: 'open' });
    expect(state[CH]).toBe('600.001');
  });

  test('F1-g: a routable directive below the watermark that was never handled is reported missed', async () => {
    const missed = [];
    const retirement = { recordMissedDirective: (d) => missed.push(d) };
    const { scanner } = makeScanner([
      directiveMsg('700.001', 'CTO', 'old but never seen https://example.com/old'),
      directiveMsg('700.002', 'CTO', 'fresh https://example.com/fresh'),
    ], { retirement });
    // Watermark already past BOTH messages, but only the fresh one was
    // ever received — the old one slipped by some earlier path.
    const state = { [CH]: '700.002', _receivedDirectives: [`${CH}:700.002`] };
    await scanner.scanChannel(state, CH);
    expect(missed).toHaveLength(1);
    expect(missed[0]).toMatchObject({ channel: CH, ts: '700.001' });
  });

  test('F1-h: runIntakeCycle scans FIRST — new directives register even when consume fails', async () => {
    const scanMod = impl('../directiveScan', 'engine/directiveScan');
    const { createIntakeStore } = impl('../directiveIntake', 'engine/directiveIntake');
    const intake = createIntakeStore(fs.mkdtempSync(path.join(os.tmpdir(), 'macf-f1-intake-')));
    const client = fakeClient({ [CH]: [directiveMsg('800.001', 'CTO', 'starvation guard https://example.com/s')] });
    const scanner = scanMod.createDirectiveScanner({ client, intake, channels: [CH] });
    // A finalize stub whose consume stage explodes (e.g. Slack down).
    const finalize = {
      drainDeadLetterRequeues: () => 0,
      drainPendingRetry: () => {},
      queueRetry: () => {},
      consumeSettledIntakeRecords: async () => { throw new Error('consume exploded'); },
    };
    await expect(scanMod.runIntakeCycle({
      client, intake, scanner, finalize,
      loadState: () => ({}),
      saveState: () => {},
      retirement: null,
    })).rejects.toThrow('consume exploded');
    // The scan ran before the failing stage: its registration is durable
    // in the intake despite the downstream failure, and the next cycle
    // re-scans idempotently (register is first-wins).
    expect(await intake.get(`${CH}:800.001`)).not.toBeNull();
  });
});
