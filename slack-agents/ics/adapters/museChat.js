// ics/adapters/museChat.js — Investor Comms Service: Muse chat surface (STUB).
//
// There is no programmatic mechanism in this runtime for a background process
// to push a message into Jesse's live Muse chat — paired-device commands and
// the available CLIs expose no chat-posting API, and MACF itself has none.
// So this adapter is an honest stub: it implements the adapter contract,
// records every message to an inspectable outbox, and returns
// {status:'stubbed'} — it never claims a delivery that did not happen.
// A background push would require a first-party Muse API that does not exist
// today; the outbox preserves the message until such a path exists.
'use strict';

const outbox = [];

const DETAIL = 'Muse chat delivery is stubbed: this runtime has no background push API for posting into Jesse\u2019s live Muse chat, so the message was NOT delivered. It is preserved in the adapter outbox (getOutbox()) until a first-party Muse chat push mechanism exists. Slack DM and the Slice remain the live surfaces.';

async function send(ctx, message) {
  outbox.push({ ...(message || {}), ts: new Date().toISOString() });
  return { status: 'stubbed', detail: DETAIL };
}

function getOutbox() {
  return outbox.map((m) => ({ ...m }));
}

module.exports = { name: 'muse-chat', send, getOutbox };
