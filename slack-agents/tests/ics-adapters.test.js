// tests/ics-adapters.test.js — Investor Comms Service: surface adapters
//
// Adapter contract: {name, send(ctx, message) -> Promise<{status, detail?}>}
//   status in delivered|failed|stubbed|queued.
//
//   slackDm  (ics/adapters/slackDm.js):  LIVE-shape {name:'slack-dm'} wrapping
//            utils/dm.js dmJesse() — the CEO-role gate stays enforced.
//   slice    (ics/adapters/slice.js):    {name:'slice'} posts
//            `bacon notify <message>` to the #bacon channel via
//            client.chat.postMessage({channel: ctx.baconChannelId, text}).
//            Bacon's contract: message 1-280 chars, control chars stripped.
//   museChat (ics/adapters/museChat.js): STUB {name:'muse-chat'} — returns
//            {status:'stubbed'} with an explanatory detail and records the
//            message to an inspectable outbox. Never fakes a delivery.
'use strict';

jest.mock('../utils/state', () => ({
  get: jest.fn(),
  set: jest.fn(),
}));

const state = require('../utils/state');
const { JESSE_SLACK_ID } = require('../config');
const slackDm = require('../ics/adapters/slackDm');
const slice = require('../ics/adapters/slice');

function mockClient() {
  return {
    conversations: { open: jest.fn(async ({ users }) => ({ channel: { id: `D_${users}` } })) },
    chat: { postMessage: jest.fn(async () => ({ ok: true })) },
  };
}

const CEO_AGENT = { id: 'execPM', slackName: 'Exec PM', icon: ':briefcase:' };
const MESSAGE = {
  subject: 'Approval needed',
  body: 'the body text with https://example.com/approve',
  idempotency_key: '123e4567-e89b-42d3-a456-426614174000',
  engine_id: 'execPM',
  type: 'immediate',
  priority: 1,
};

beforeEach(() => jest.clearAllMocks());

describe('slackDm adapter (wraps dmJesse)', () => {
  test('is named slack-dm', () => {
    expect(slackDm.name).toBe('slack-dm');
  });

  test('CEO agent: opens Jesse’s DM and posts via chat.postMessage -> delivered', async () => {
    state.get.mockReturnValue(null);
    const client = mockClient();

    const res = await slackDm.send({ client, agent: CEO_AGENT }, MESSAGE);

    expect(res).toEqual({ status: 'delivered' });
    expect(JESSE_SLACK_ID).toBeTruthy();
    expect(client.conversations.open).toHaveBeenCalledWith({ users: JESSE_SLACK_ID });
    expect(client.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: `D_${JESSE_SLACK_ID}`,
      text: expect.stringContaining('the body text'),
    }));
    // persona stamping is preserved through dmJesse -> sendAgentDM -> postAs
    expect(client.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      username: 'Exec PM',
    }));
  });

  test('message text carries the subject as well as the body', async () => {
    state.get.mockReturnValue(null);
    const client = mockClient();
    await slackDm.send({ client, agent: CEO_AGENT }, MESSAGE);
    const { text } = client.chat.postMessage.mock.calls[0][0];
    expect(text).toContain('Approval needed');
    expect(text).toContain('the body text');
  });

  test('non-CEO agent: dmJesse gate refuses -> {status:failed}, nothing posted', async () => {
    const client = mockClient();
    const res = await slackDm.send({ client, agent: { id: 'cmo', slackName: 'CMO' } }, MESSAGE);

    expect(res.status).toBe('failed');
    expect(res.detail).toMatch(/CEO/i);
    expect(client.chat.postMessage).not.toHaveBeenCalled();
    expect(client.conversations.open).not.toHaveBeenCalled();
  });

  test('Slack API errors become {status:failed} with the error detail', async () => {
    state.get.mockReturnValue(null);
    const client = mockClient();
    client.chat.postMessage.mockRejectedValueOnce(new Error('slack down'));
    const res = await slackDm.send({ client, agent: CEO_AGENT }, MESSAGE);
    expect(res).toEqual({ status: 'failed', detail: 'slack down' });
  });
});

describe('slice adapter (Bacon #bacon channel)', () => {
  const PREFIX = 'bacon notify ';

  test('is named slice', () => {
    expect(slice.name).toBe('slice');
  });

  test('posts "bacon notify <message>" to the bacon channel -> delivered', async () => {
    const client = mockClient();
    const res = await slice.send({ client, baconChannelId: 'C_BACON' }, MESSAGE);

    expect(res).toEqual({ status: 'delivered' });
    expect(client.chat.postMessage).toHaveBeenCalledWith({
      channel: 'C_BACON',
      text: expect.stringMatching(/^bacon notify /),
    });
    const { text } = client.chat.postMessage.mock.calls[0][0];
    expect(text).toContain('the body text');
  });

  test('truncates the message portion to 280 chars', async () => {
    const client = mockClient();
    const longMsg = { ...MESSAGE, subject: '', body: `x${'y'.repeat(500)}` };
    const res = await slice.send({ client, baconChannelId: 'C_BACON' }, longMsg);

    expect(res.status).toBe('delivered');
    const { text } = client.chat.postMessage.mock.calls[0][0];
    expect(text.startsWith(PREFIX)).toBe(true);
    expect(text.length).toBe(PREFIX.length + 280);
  });

  test('does not truncate a message already within 280 chars', async () => {
    const client = mockClient();
    await slice.send({ client, baconChannelId: 'C_BACON' }, MESSAGE);
    const { text } = client.chat.postMessage.mock.calls[0][0];
    expect(text).toContain('the body text');
    expect(text.length).toBeLessThan(PREFIX.length + 280);
  });

  test('strips control characters (incl. newlines/tabs)', async () => {
    const client = mockClient();
    const dirty = { ...MESSAGE, subject: '', body: 'a\x00b\x1fc\n\td' };
    await slice.send({ client, baconChannelId: 'C_BACON' }, dirty);
    const { text } = client.chat.postMessage.mock.calls[0][0];
    expect(text).not.toMatch(/[\x00-\x1f]/);
    expect(text).toContain('abcd');
  });

  test('Slack ok:false -> {status:failed}', async () => {
    const client = mockClient();
    client.chat.postMessage.mockResolvedValueOnce({ ok: false, error: 'channel_not_found' });
    const res = await slice.send({ client, baconChannelId: 'C_BACON' }, MESSAGE);
    expect(res.status).toBe('failed');
    expect(res.detail).toMatch(/channel_not_found/);
  });

  test('missing baconChannelId -> {status:failed} without calling Slack', async () => {
    const client = mockClient();
    const res = await slice.send({ client }, MESSAGE);
    expect(res.status).toBe('failed');
    expect(res.detail).toMatch(/channel/i);
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });
});

describe('museChat adapter (stub)', () => {
  let museChat;
  beforeEach(() => {
    jest.resetModules();
    museChat = require('../ics/adapters/museChat');
  });

  test('is named muse-chat', () => {
    expect(museChat.name).toBe('muse-chat');
  });

  test('returns stubbed with an explanatory detail — never claims delivery', async () => {
    const res = await museChat.send({}, MESSAGE);
    expect(res.status).toBe('stubbed');
    expect(res.status).not.toBe('delivered');
    expect(typeof res.detail).toBe('string');
    expect(res.detail.length).toBeGreaterThan(30);
    // explains that no background-to-chat push mechanism exists in this runtime
    expect(res.detail).toMatch(/push/i);
    expect(res.detail).toMatch(/muse chat/i);
  });

  test('records the message to an inspectable outbox', async () => {
    await museChat.send({}, MESSAGE);
    const outbox = museChat.getOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toEqual(expect.objectContaining({
      subject: 'Approval needed',
      body: expect.stringContaining('the body text'),
    }));
  });

  test('outbox accumulates across sends', async () => {
    await museChat.send({}, MESSAGE);
    await museChat.send({}, { ...MESSAGE, subject: 'Second' });
    expect(museChat.getOutbox()).toHaveLength(2);
  });

  test('never touches a Slack client even when one is provided', async () => {
    const client = mockClient();
    const res = await museChat.send({ client }, MESSAGE);
    expect(res.status).toBe('stubbed');
    expect(client.chat.postMessage).not.toHaveBeenCalled();
    expect(client.conversations.open).not.toHaveBeenCalled();
  });
});
