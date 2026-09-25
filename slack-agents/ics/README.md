# Investor Comms Service (ICS)

One submission from the CEO engine fans out to every registered investor
surface in a single relay cycle. The bus sends only supplied, send-ready
content — it never invents messaging.

## Architecture

```
engine --createSubmit()--> payload --notify_investor()/bus.submit()-->
                                                          +--> slack-dm   (LIVE via dmJesse)
                                                          +--> slice     (LIVE via #bacon `bacon notify`)
                                                          +--> muse-chat (STUB — outbox only)
                                                          +--> audit.jsonl (append-only)
                                                          +--> Vikunja addComment (best-effort mirror)
```

Modules (`slack-agents/ics/`):

| Module | Role |
|---|---|
| `schema.js` | `validateSubmission()` — schema v1 validation |
| `registry.js` | active-CEO resolution (`ACTING_CEO_ID` → `CEO_SUCCESSION[0]`), `isAuthorizedEngine()`, surface plugin registry |
| `audit.js` | `createAudit(path)` — append-only JSONL log + disk-backed idempotency seen-store |
| `bus.js` | `createBus({config, audit, surfaces, vikunja})` — `submit()`, `replayIncomplete()`, `getDigestQueue()` |
| `digest.js` | outcome queue + `buildDigest()` / `drainDigest()` (morning digest) |
| `client.js` | `createSubmit()` — per-engine payload builder, fresh `crypto.randomUUID()` key per call |
| `mcp.js` | MCP-style interface: `notify_investor`, `delivery_status`, `investor_reply`, `getCeoInbox()` |
| `adapters/slackDm.js` | wraps `utils/dm.js dmJesse()` — CEO-role gate enforced |
| `adapters/slice.js` | posts `bacon notify <msg>` to the #bacon channel |
| `adapters/museChat.js` | **stub** — records to an outbox, returns `status:'stubbed'` |

Submission schema v1:

```js
{idempotency_key, engine_id, type, priority, vikunja_task_id, subject, body, actions[]}
```

- `type`: `immediate` (Jesse-gated, deliver now) · `approval` (approval-ready drafts)
  · `outcome` (queued for the digest, never fanned out directly)
- `priority`: 1–3. `vikunja_task_id`: number|null. `actions[]`: `{label, url}` (http/https).

Submit pipeline: validate → active-CEO check → dedupe by idempotency key
(disk-backed, survives restarts) → lane routing → fan-out → per-channel audit
→ best-effort Vikunja mirror (mirror failure never blocks delivery) →
dead-letter when every attempted channel failed (never silent, never lost).

Crash recovery: `replayIncomplete(ctx)` re-sends only channels whose latest
audit status is non-terminal (`failed`/`queued`) and whose adapter is still
registered. Fully-delivered keys and uninstalled surfaces are skipped.

## Plugin contract

```js
// {name, send(ctx, message) -> Promise<{status, detail?}>}
// status: 'delivered' | 'failed' | 'stubbed' | 'queued'
registerSurface('my-surface', adapter);
unregisterSurface('my-surface');
listSurfaces();      // string[]
getSurface(name);     // adapter | undefined
```

Re-registering a name replaces the adapter. The bus passes `ctx` through
opaque — adapters declare their own needs (`slackDm` wants `{client, agent}`;
`slice` wants `{client, baconChannelId}`).

## Surface states

- **slack-dm — live-capable, NOT cut over.** Wraps the existing `dmJesse()`;
  the CEO-role gate stays enforced. Existing `dmJesse()` call sites are
  untouched — nothing in the live engine routes through the ICS yet.
- **slice — live-capable, NOT cut over.** Posts `bacon notify <message>`
  (Bacon's documented contract: message portion 1–280 chars, control chars
  stripped) to the private #bacon channel via the Slack Web API. Requires
  `ctx.baconChannelId`.
- **muse-chat — STUB.** There is no programmatic mechanism in this runtime
  for a background process to push a message into Jesse's live Muse chat
  (verified: device commands, bundled CLIs, and MACF expose no chat-posting
  API). The adapter records to an inspectable outbox (`getOutbox()`) and
  returns `status:'stubbed'` with an explanatory detail. It never claims a
  delivery that did not happen. Cutover waits on a first-party Muse chat push
  API.

## Bacon / MACF independence

Bacon and MACF remain fully independent: either installs and runs without the
other, and neither ships inside the other. The comms bus lives in MACF; the
Slice adapter is an optional plugin — a missing/unregistered Bacon changes
nothing except that the `slice` surface isn't in the fan-out. Delivery
continues on the remaining surfaces.

## Dry-run / cutover procedure

1. **Dry run (no Jesse contact):** register the real adapters against test
   sinks — a mock Slack client for `slack-dm`/`slice`, and the real
   `muse-chat` stub. Submit `immediate`, `approval`, and `outcome` payloads;
   assert fan-out, queueing, per-channel audit entries, idempotent
   re-submission, and digest drain. (Covered by `tests/ics-*.test.js`.)
2. **Staged cutover:** register adapters with the live Slack client in a
   maintenance window; submit one `immediate` test payload and confirm
   `delivery_status()` shows `delivered` on `slack-dm` and `slice`, and
   `stubbed` on `muse-chat`.
3. **Live:** point the CEO engine's Jesse-gated sends at
   `notify_investor()`; keep the legacy `dmJesse()` call sites until the
   three-surface relay is verified end to end, then retire them.
4. **Rollback:** `unregisterSurface()` removes a surface instantly; the audit
   log retains every delivery record for replay.

Audit log location is deployer-chosen (pass the path to `createAudit`);
keep it on persistent disk next to the engine state.
