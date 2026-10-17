// kernel-p3-signals.test.js — #807 Phase 3 (US-P3.4/P3.5/P3.6).
//
// Delivery signals come from verified world-state: finalize records
// every postcondition outcome to a ledger; per-agent stats + the daily
// verified count read from it; the self-healer's low-delivery repairs
// finally have a verification test (postcondition recovery) instead of
// sitting 'initiated' until they escalate to needs_ceo.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-p3sig-'));
process.env.MACF_STATE_DIR = TMP;
process.env.MACF_RECEIPTS_FILE = path.join(TMP, '.receipts.jsonl');
process.env.MACF_POSTCONDITION_OUTCOMES_FILE = path.join(TMP, 'postcondition-outcomes.jsonl');

const dp = require('../directivePostconditions');
const { VERIFICATION_TESTS, recheckInitiatedRepairs } = require('../self-healer');

function outcome(agentId, p, satisfied) {
  return { type: 'file_exists', path: p, satisfied, observed: { exists: satisfied } };
}

describe('US-P3.5/P3.6 — postcondition outcomes ledger', () => {
  test('records outcomes and computes per-agent stats with a since floor', () => {
    dp.recordPostconditionOutcomes('cmo', '111.1', [outcome('cmo', 'a.md', true), outcome('cmo', 'b.md', true), outcome('cmo', 'c.md', false)]);
    dp.recordPostconditionOutcomes('cto', '222.2', [outcome('cto', 'd.md', true)]);
    const cmo = dp.postconditionStatsByAgent('cmo');
    expect(cmo.checked).toBe(3);
    expect(cmo.satisfied).toBe(2);
    expect(cmo.rate).toBeCloseTo(2 / 3);
    const future = dp.postconditionStatsByAgent('cmo', Date.now() + 60000);
    expect(future.checked).toBe(0);
    expect(dp.postconditionAgents().sort()).toEqual(['cmo', 'cto']);
  });

  test('daily verified count only counts satisfied outcomes from that day', () => {
    const today = new Date().toISOString().slice(0, 10);
    const before = dp.dailyVerifiedPostconditions(today);
    dp.recordPostconditionOutcomes('cmo', '333.3', [outcome('cmo', 'e.md', true), outcome('cmo', 'f.md', false)]);
    expect(dp.dailyVerifiedPostconditions(today)).toBe(before + 1);
    expect(dp.dailyVerifiedPostconditions('1999-01-01')).toBe(0);
  });
});

describe('US-P3.4 — healer verifies low-delivery repairs from the ledger', () => {
  test('VERIFICATION_TESTS has a postcondition test for AGENT_LOW_DELIVERY', () => {
    expect(typeof VERIFICATION_TESTS.AGENT_LOW_DELIVERY).toBe('function');
  });

  test('a recovered agent (verified postconditions since the repair) closes as verified', async () => {
    const ts = new Date(Date.now() - 3600000).toISOString();
    // 4 satisfied outcomes for hr AFTER the repair timestamp:
    dp.recordPostconditionOutcomes('hr', '444.4', [outcome('hr', 'g.md', true), outcome('hr', 'h.md', true), outcome('hr', 'i.md', true), outcome('hr', 'j.md', true)]);
    const log = { repairs: [{ timestamp: ts, issueType: 'AGENT_LOW_DELIVERY', agentId: 'hr', verification: 'initiated' }] };
    const summary = await recheckInitiatedRepairs(log, VERIFICATION_TESTS, Date.now());
    expect(summary.verified).toBe(1);
    expect(log.repairs[0].verification).toBe(true);
  });

  test('an agent still failing postconditions stays pending (no false close)', async () => {
    const ts = new Date(Date.now() - 3600000).toISOString();
    dp.recordPostconditionOutcomes('legalx', '555.5', [outcome('legalx', 'k.md', false), outcome('legalx', 'l.md', false), outcome('legalx', 'm.md', true), outcome('legalx', 'n.md', false)]);
    const log = { repairs: [{ timestamp: ts, issueType: 'AGENT_LOW_DELIVERY', agentId: 'legalx', verification: 'initiated' }] };
    const summary = await recheckInitiatedRepairs(log, VERIFICATION_TESTS, Date.now());
    expect(summary.verified).toBe(0);
    expect(log.repairs[0].verification).toBe('initiated');
  });
});
