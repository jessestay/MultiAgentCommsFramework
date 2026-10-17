// engine/directiveState.js — Phase F (Vikunja #789): the shared
// directive-poll state store.
//
// The poll state file (engine/.directive-poll-state.json) holds the
// channel watermarks, the received-directives dedupe ledger, the retry
// queue, the retries counters, and the dead-letter list. Through Phase B
// only the poller touched it. Phase F makes the ENGINE a second writer
// (its scan advances the watermarks; its finalize loop drives the retry
// bookkeeping), with the poller writing again only in fallback mode.
//
// Two writers owned by two different OS users (the poller runs as root,
// the engine as macf) make file mode a correctness issue, not hygiene:
// the Phase B deployment proved that a state file one side cannot write
// wedges the handoff silently (durable-b3). Saves are therefore atomic
// (tmp + rename, so a concurrent reader never sees a torn file) and the
// saved file is chmod 0666 — either user can always replace it,
// regardless of who wrote it last. The file carries no secrets (its
// contents already flowed through Slack), so world-writability inside
// the repo tree is the honest mechanism for a two-user handoff.
'use strict';

const fs = require('fs');
const path = require('path');

const POLL_STATE_PATH = path.join(__dirname, '.directive-poll-state.json');
const STATE_FILE_MODE = 0o666;

function loadPollState(statePath = POLL_STATE_PATH) {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); }
  catch { return {}; }
}

let seq = 0;
function savePollState(state, statePath = POLL_STATE_PATH) {
  const tmp = `${statePath}.tmp-${process.pid}-${++seq}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  try { fs.chmodSync(tmp, STATE_FILE_MODE); } catch { /* best effort */ }
  fs.renameSync(tmp, statePath);
  try { fs.chmodSync(statePath, STATE_FILE_MODE); } catch { /* best effort */ }
  return state;
}

module.exports = { POLL_STATE_PATH, STATE_FILE_MODE, loadPollState, savePollState };
