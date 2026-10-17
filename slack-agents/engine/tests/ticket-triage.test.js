/**
 * engine/tests/ticket-triage.test.js
 *
 * TDD for ticket triage (Oct 10, 2026 — Jesse's order).
 *
 * Jesse's law: "Why isn't there a process monitoring for new tickets and
 * assigning to the exec pm to bring up in sprint planning meetings or assign
 * immediately (for urgent tasks)? All of this should be built into the MACF."
 *
 * ROOT CAUSE: Tickets were created without assignees. Agents only pick up
 * assigned tasks. There was no triage process, so requests sat idle.
 */
'use strict';

const { isUrgent, classifyAgent, USER_IDS, URGENT_KEYWORDS, TYPE_MAP } = require('../ticket-triage.js');

describe('Urgency detection', () => {
  test('detects urgent keyword in title', () => {
    expect(isUrgent({ title: 'URGENT: Fix the deploy', description: '' })).toBe(true);
  });

  test('detects asap in description', () => {
    expect(isUrgent({ title: 'Normal task', description: 'Need this asap please' })).toBe(true);
  });

  test('detects deadline keyword', () => {
    expect(isUrgent({ title: 'Q4 report', description: 'Deadline is tomorrow' })).toBe(true);
  });

  test('non-urgent task returns false', () => {
    expect(isUrgent({ title: 'Review the docs', description: 'When you have time' })).toBe(false);
  });

  test('empty task is not urgent', () => {
    expect(isUrgent({ title: '', description: '' })).toBe(false);
  });
});

describe('Agent classification', () => {
  test('legal task → lawyer', () => {
    expect(classifyAgent({ title: 'Review the agreement', description: '' })).toBe('lawyer');
  });

  test('job task → jobcoach', () => {
    expect(classifyAgent({ title: 'Create resume for Cricut', description: '' })).toBe('jobcoach');
  });

  test('comms task → cco', () => {
    expect(classifyAgent({ title: 'Draft LinkedIn reply', description: '' })).toBe('cco');
  });

  test('strategy task → cco', () => {
    expect(classifyAgent({ title: 'Wix project pricing strategy', description: '' })).toBe('cco');
  });

  test('marketing task → cmo', () => {
    expect(classifyAgent({ title: 'Workshop promo campaign', description: '' })).toBe('cmo');
  });

  test('research task → cro', () => {
    expect(classifyAgent({ title: 'Market research brief', description: '' })).toBe('cro');
  });

  test('finance task → cfo', () => {
    expect(classifyAgent({ title: 'Q3 budget review', description: '' })).toBe('cfo');
  });

  test('tech task → cto', () => {
    expect(classifyAgent({ title: 'Fix the API bug', description: '' })).toBe('cto');
  });

  test('unknown type → execpm (for sprint planning triage)', () => {
    expect(classifyAgent({ title: 'Something vague', description: 'Not sure what this is' })).toBe('execpm');
  });
});

describe('User ID map', () => {
  test('all agents have user IDs', () => {
    const required = ['execpm', 'cmo', 'cco', 'cuxo', 'cro', 'cfo', 'cto', 'lawyer', 'jobcoach'];
    for (const agent of required) {
      expect(USER_IDS[agent]).toBeDefined();
      expect(typeof USER_IDS[agent]).toBe('number');
    }
  });

  test('no duplicate user IDs', () => {
    const ids = Object.values(USER_IDS);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
