// tests/dm.test.js — Direct message helpers
'use strict';

jest.mock('../utils/state', () => ({
  get: jest.fn(),
  set: jest.fn(),
}));

const state = require('../utils/state');
const { AGENTS, JESSE_SLACK_ID } = require('../config');
const dm = require('../utils/dm');

function mockClient() {
  return {
    conversations: { open: jest.fn(async ({ users }) => ({ channel: { id: `D_${users}` } })) },
    chat: { postMessage: jest.fn(async () => ({ ok: true })) },
  };
}

beforeEach(() => jest.clearAllMocks());

describe('isDMChannelId / isDMEvent', () => {
  test('D-prefixed IDs are DMs', () => {
    expect(dm.isDMChannelId('D12345')).toBe(true);
    expect(dm.isDMChannelId('C12345')).toBe(false);
    expect(dm.isDMChannelId(null)).toBe(false);
  });

  test('isDMEvent checks channel_type first, then ID prefix', () => {
    expect(dm.isDMEvent({ channel_type: 'im', channel: 'D1' })).toBe(true);
    expect(dm.isDMEvent({ channel_type: 'mpim', channel: 'D2' })).toBe(true);
    expect(dm.isDMEvent({ channel_type: 'channel', channel: 'C1' })).toBe(false);
    expect(dm.isDMEvent({ channel: 'D9' })).toBe(true); // fallback
    expect(dm.isDMEvent(null)).toBe(false);
  });
});

describe('openDM', () => {
  test('opens a DM and caches the channel', async () => {
    state.get.mockReturnValue(null);
    const client = mockClient();
    const ch = await dm.openDM(client, 'U999');
    expect(ch).toBe('D_U999');
    expect(client.conversations.open).toHaveBeenCalledWith({ users: 'U999' });
    expect(state.set).toHaveBeenCalledWith('dm', 'dm_channel_U999', 'D_U999');
  });

  test('reuses cached channel without API call', async () => {
    state.get.mockReturnValue('D_CACHED');
    const client = mockClient();
    const ch = await dm.openDM(client, 'U999');
    expect(ch).toBe('D_CACHED');
    expect(client.conversations.open).not.toHaveBeenCalled();
  });
});

describe('sendAgentDM / sendGroupDM', () => {
  test('sendAgentDM posts stamped as the agent persona', async () => {
    state.get.mockReturnValue('D_U1');
    const client = mockClient();
    await dm.sendAgentDM(client, AGENTS.cmo, 'U1', 'quiet heads-up');
    expect(client.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'D_U1',
      text: 'quiet heads-up',
      username: 'CMO',
      icon_emoji: ':bar_chart:',
    }));
  });

  test('sendGroupDM opens an mpim with all users', async () => {
    const client = mockClient();
    await dm.sendGroupDM(client, AGENTS.execPM, ['U1', 'U2'], 'huddle');
    expect(client.conversations.open).toHaveBeenCalledWith({ users: 'U1,U2' });
    expect(client.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      username: 'Exec PM',
    }));
  });

  test('dmJesse targets Jesse’s Slack ID', async () => {
    state.get.mockReturnValue('D_JESSE');
    const client = mockClient();
    const ch = await dm.dmJesse(client, AGENTS.execPM, 'morning');
    expect(JESSE_SLACK_ID).toBeTruthy();
    expect(state.get).toHaveBeenCalledWith('dm', `dm_channel_${JESSE_SLACK_ID}`);
    expect(ch).toBe('D_JESSE');
  });
});
