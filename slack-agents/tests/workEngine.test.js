// tests/workEngine.test.js — classification logic for the 24/7 work engine
'use strict';

const we = require('../engine/workEngine');

describe('task classification', () => {
  test('isDormant matches held/parked/guardrail statuses', () => {
    expect(we.isDormant({ title: 'Post — HELD under HOLD-001' })).toBe(true);
    expect(we.isDormant({ title: 'Geneo — PARKED (do not restart)' })).toBe(true);
    expect(we.isDormant({ title: 'Budget guardrail: $300/mo cap' })).toBe(true);
    expect(we.isDormant({ title: 'Weekly content batch (recurring)' })).toBe(false);
    // incidental words must NOT match
    expect(we.isDormant({ title: 'Benchmark models', description: '~2.3GB RAM held, unbenchmarked' })).toBe(false);
  });

  test('isJesseGated matches needs-Jesse markers, never dormant tasks', () => {
    expect(we.isJesseGated({ title: 'JESSE ACTION — connect Instagram' })).toBe(true);
    expect(we.isJesseGated({ title: 'Thing', description: 'needs Jesse approval' })).toBe(true);
    expect(we.isJesseGated({ title: 'Post — HELD under HOLD-001' })).toBe(false);
    expect(we.isJesseGated({ title: 'Regular research task' })).toBe(false);
  });

  test('isTimeCritical matches deadlines and near due dates', () => {
    expect(we.isTimeCritical({ title: 'Oscars comp tickets', description: 'deadline Sat' })).toBe(true);
    const soon = new Date(Date.now() + 12 * 3_600_000).toISOString();
    expect(we.isTimeCritical({ title: 'X', due_date: soon })).toBe(true);
    const past = new Date(Date.now() - 24 * 3_600_000).toISOString();
    expect(we.isTimeCritical({ title: 'X', due_date: past })).toBe(true);
    const later = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();
    expect(we.isTimeCritical({ title: 'X', due_date: later })).toBe(false);
    expect(we.isTimeCritical({ title: 'Standing guardrail', description: 'no rush' })).toBe(false);
  });
});
