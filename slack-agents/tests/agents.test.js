// tests/agents.test.js — Tests all 8 agent module interfaces
// Uses mocks for Slack client and Anthropic API to avoid live calls.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Isolated temp dir for memory files
const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'macf-agents-test-'));
process.env.RAILWAY_VOLUME_MOUNT_PATH = TEST_DIR;
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.SLACK_BOT_TOKEN = 'xoxb-test';
process.env.SLACK_SIGNING_SECRET = 'test-secret';
process.env.SLACK_APP_TOKEN = 'xapp-test';
process.env.GITHUB_TOKEN = 'ghp-test';

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ text: 'Mock AI response for testing' }],
      }),
    },
  }));
});

// Mock node-fetch (used by gofundme util)
jest.mock('node-fetch', () =>
  jest.fn().mockResolvedValue({
    ok: true,
    text: jest.fn().mockResolvedValue('<html><title>Test GoFundMe</title></html>'),
    json: jest.fn().mockResolvedValue({}),
  })
);

// Mock node-cron to prevent open handle warnings
jest.mock('node-cron', () => ({
  schedule: jest.fn(), // no-op — don't actually schedule timers in tests
}));

// Mock setTimeout/setInterval to prevent open handle warnings from startup delays
jest.useFakeTimers();

// Mock @octokit/rest
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    repos: {
      listCommits: jest.fn().mockResolvedValue({ data: [] }),
      listPullRequests: jest.fn().mockResolvedValue({ data: [] }),
    },
  })),
}));

// Reset module cache so state picks up the TEST_DIR env var
beforeAll(() => {
  delete require.cache[require.resolve('../utils/state')];
});

afterAll(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

// ─── Agent module interface tests ─────────────────────────────────────────────
const AGENT_FILES = ['execPM', 'cmo', 'cco', 'jobcoach', 'cuxo', 'cro', 'lawyer', 'cfo'];

describe('All agent modules export required interface', () => {
  AGENT_FILES.forEach(agentId => {
    test(`${agentId} exports init, handleMention, handleDelegation`, () => {
      const mod = require(`../agents/${agentId}`);
      expect(typeof mod.init).toBe('function');
      expect(typeof mod.handleMention).toBe('function');
      expect(typeof mod.handleDelegation).toBe('function');
    });
  });
});

describe('Agent init() works without crashing', () => {
  const mockConversationsList = jest.fn().mockResolvedValue({ channels: [] });
  const mockPostMessage = jest.fn().mockResolvedValue({ ok: true });

  const mockApp = {
    client: {
      conversations: { list: mockConversationsList, info: jest.fn().mockResolvedValue({ channel: { name: 'test' } }) },
      chat: { postMessage: mockPostMessage },
      auth: { test: jest.fn().mockResolvedValue({ user_id: 'U123' }) },
    },
  };

  AGENT_FILES.forEach(agentId => {
    test(`${agentId}.init() runs without error`, () => {
      const mod = require(`../agents/${agentId}`);
      expect(() => mod.init(mockApp)).not.toThrow();
    });
  });
});

describe('handleDelegation() rejects unmatched messages', () => {
  AGENT_FILES.forEach(agentId => {
    test(`${agentId} returns false for unmatched delegation`, async () => {
      const mod = require(`../agents/${agentId}`);
      const result = await mod.handleDelegation('This is a random message with no delegation pattern');
      expect(result).toBe(false);
    });
  });
});

describe('handleDelegation() matches correct patterns', () => {
  const mockConversationsList = jest.fn().mockResolvedValue({ channels: [{ name: 'management', id: 'C123' }] });
  const mockPostMessage = jest.fn().mockResolvedValue({ ok: true });
  const mockApp = {
    client: {
      conversations: { list: mockConversationsList },
      chat: { postMessage: mockPostMessage },
    },
  };

  beforeAll(() => {
    // Re-init all agents with mock client
    AGENT_FILES.forEach(id => {
      const mod = require(`../agents/${id}`);
      mod.init(mockApp);
    });
  });

  const delegationCases = [
    ['execPM', '[from: CMO → Exec PM] Please update the health check'],
    ['cmo',    '[from: Exec PM → CMO] Generate a marketing brief'],
    ['cco',    '[from: CMO → CCO] Write a GoFundMe social post'],
    ['cuxo',   '[from: CMO → CUXO] Review the transkrybe landing page UX'],
    ['cro',    '[from: CMO → CRO] Research music transcription competitors'],
    ['lawyer', '[from: CFO → Lawyer] Review the consultant agreement'],
    ['cfo',    '[from: Exec PM → CFO] What are our SaaS metrics targets?'],
    ['jobcoach','[from: Exec PM → Job Coach] Run a pipeline report'],
  ];

  delegationCases.forEach(([agentId, message]) => {
    test(`${agentId} responds to its delegation pattern`, async () => {
      const mod = require(`../agents/${agentId}`);
      const result = await mod.handleDelegation(message);
      expect(result).toBe(true);
    });
  });
});

describe('Agent system prompts contain MACF isolation rule', () => {
  const { AGENTS } = require('../config');
  AGENT_FILES.forEach(agentId => {
    test(`${agentId} system prompt mentions isolated memory`, () => {
      expect(AGENTS[agentId].systemPrompt).toContain('isolated memory');
    });
  });
});
