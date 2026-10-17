// tests/tasks.test.js — Agent-facing Vikunja task helpers
'use strict';

jest.mock('../utils/vikunja', () => ({
  PRIORITY: { NONE: 0, LOW: 1, MEDIUM: 2, NORMAL: 3, HIGH: 4, URGENT: 5 },
  isConfigured: jest.fn(),
  createTask: jest.fn(),
  updateTask: jest.fn(),
  listTasks: jest.fn(),
  assignTask: jest.fn(),
  completeTask: jest.fn(),
}));

// config.js reads env at load time — set before requiring tasks
process.env.VIKUNJA_PROJECT_ID = '3';
process.env.VIKUNJA_USER_CMO = '11';

const vikunja = require('../utils/vikunja');
const tasks = require('../utils/tasks');

beforeEach(() => jest.clearAllMocks());

describe('isNoise', () => {
  test('short acks are noise', () => {
    expect(tasks.isNoise('On it.')).toBe(true);
    expect(tasks.isNoise('Got it')).toBe(true);
    expect(tasks.isNoise('')).toBe(true);
  });

  test('substantive work descriptions are not noise', () => {
    expect(tasks.isNoise('Draft the Q3 marketing plan with budget breakdown and timeline')).toBe(false);
  });

  test('longer acks describing work are kept', () => {
    expect(tasks.isNoise('On it — drafting the thank-you post now, will have it ready in 10 minutes')).toBe(false);
  });
});

describe('trackDelegation', () => {
  test('no-op when Vikunja is not configured', async () => {
    vikunja.isConfigured.mockReturnValue(false);
    const res = await tasks.trackDelegation('execPM', 'cmo', '[from: Exec PM → CMO] Draft post');
    expect(res).toBeNull();
    expect(vikunja.createTask).not.toHaveBeenCalled();
  });

  test('creates a task assigned to the receiving agent', async () => {
    vikunja.isConfigured.mockReturnValue(true);
    vikunja.createTask.mockResolvedValue({ id: 42 });
    vikunja.assignTask.mockResolvedValue({});

    const res = await tasks.trackDelegation('execPM', 'cmo', '[from: Exec PM → CMO] Draft the thank-you post for the new donor');
    expect(res).toEqual({ id: 42 });
    expect(vikunja.createTask).toHaveBeenCalledWith(
      'execPM',
      3,
      expect.objectContaining({ title: 'Draft the thank-you post for the new donor' })
    );
    // cmo → Vikunja user 11 (from env)
    expect(vikunja.assignTask).toHaveBeenCalledWith('execPM', 42, 11);
  });

  test('skips ack noise', async () => {
    vikunja.isConfigured.mockReturnValue(true);
    const res = await tasks.trackDelegation('facebook', 'execPM', '[from: Facebook Expert → Exec PM] On it.');
    expect(res).toBeNull();
    expect(vikunja.createTask).not.toHaveBeenCalled();
  });
});

describe('routeAgent', () => {
  test('routes by keyword, specific before general', () => {
    expect(tasks.routeAgent('facebook ad campaign performance')).toBe('facebook');
    expect(tasks.routeAgent('review the contract with the vendor')).toBe('lawyer');
    expect(tasks.routeAgent('fix the transkrybe login bug')).toBe('cto');
    expect(tasks.routeAgent('draft the newsletter')).toBe('cco');
    expect(tasks.routeAgent('plan the brand campaign')).toBe('cmo');
  });

  test('falls back to execPM', () => {
    expect(tasks.routeAgent('something totally unrelated xyz')).toBe('execPM');
  });
});

describe('triageBoard', () => {
  test('no-op when disabled', async () => {
    vikunja.isConfigured.mockReturnValue(false);
    expect(await tasks.triageBoard()).toBeNull();
  });

  test('escalates overdue, prioritizes revenue, flags unassigned', async () => {
    vikunja.isConfigured.mockReturnValue(true);
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    vikunja.listTasks.mockResolvedValue([
      { id: 1, title: 'Fix login bug', priority: 2, due_date: yesterday, done: false, assignees: [{ id: 5 }] },
      { id: 2, title: 'Client launch checklist', priority: 2, done: false, assignees: [] },
      { id: 3, title: 'Tidy up docs', priority: 3, done: false, assignees: [{ id: 5 }] },
    ]);
    vikunja.updateTask.mockResolvedValue({});
    vikunja.assignTask.mockResolvedValue({});

    const summary = await tasks.triageBoard();
    expect(summary).toContain('3 open tasks');

    // overdue → HIGH
    expect(vikunja.updateTask).toHaveBeenCalledWith('execPM', 1, { priority: 4 });
    // revenue keyword ("Client") → HIGH
    expect(vikunja.updateTask).toHaveBeenCalledWith('execPM', 2, { priority: 4 });
    // already fine → untouched
    const updatedIds = vikunja.updateTask.mock.calls.map(c => c[1]);
    expect(updatedIds).not.toContain(3);
    // unassigned task flagged in summary (execPM has no user mapped in this env)
    expect(summary).toContain('no owner');
  });

  test('clean board reports clean', async () => {
    vikunja.isConfigured.mockReturnValue(true);
    vikunja.listTasks.mockResolvedValue([]);
    const summary = await tasks.triageBoard();
    expect(summary).toContain('nothing open');
  });
});
