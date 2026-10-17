# Google Leg — calendar-sync findings

Date: 2026-09-25. Author: Google-leg engineer (subagent).
Task: characterize the Google side of the bidirectional sync between Google
Calendar **"Jesse and Rebecca Parent Time and Kids Schedule"** and the shared
OurFamilyWizard (OFW) calendar (OFW has no API; its leg is handled by live-browser
work — NOT by this leg).

## Calendar identity
- **Name:** Jesse and Rebecca Parent Time and Kids Schedule
- **calendarId:** `gv02prguf93osbqcr7tedrq6is@group.calendar.google.com`
- **Linked account:** jessestay@gmail.com (account_id `a2f3d29a56da4c1694eeb0d4eaee1dd9`) — all Google-leg commands must pass `--account a2f3d29a56da4c1694eeb0d4eaee1dd9`
- **accessRole:** owner

## Write-access verdict: GRANTED
`calendar status --for-command events.insert|patch|delete` with the account above
all returned `scope_status: granted`. The connector can create, patch, and delete
events on this calendar today — no consent URL needed, no action for the investor.

(Rule for this leg: read-only except skill status checks unless the sync engine is
authorized to write. No test events were created/updated/deleted during this work.)

## Event shapes (sample window 2026-10-01 → 2027-06-01)

Three populations on this calendar:

1. **Recurring routine series (expanded as instances)** — school start/end for
   Juliet/Alex/Emily, Emily Scouts, "Pick up Alex from robotics", plus recurring
   holiday instances (Halloween - Jesse Parent Time, Veteran's Day Holiday -
   Rebecca Parent Time). Instance IDs are `<seriesId>_<dateZ>` (e.g.
   `rtqvlbrci1r16erjob7gnlfolg_20261002T210000Z`). Descriptions empty. All timed
   `dateTime` in `America/Denver` (offset shifts -06:00 → -07:00 at DST).
2. **One-off parent-time / holiday events (Google-authoritative)** — titles like
   "Jesse Parent Time - Weekend", "Rebecca Parent Time - Fall Break (Part 1 of 2)",
   "Jesse Parent Time - Columbus Day", "Thanksgiving Holiday - Jesse Parent Time",
   "Christmas Holiday - Jesse Parent Time". Descriptions are prose decree/agreement
   citations ("Per Utah Code 81-9-302: ...", "Per parent agreement (Rebecca
   approved, per Jesse Sep 25, 2026): ..."). Multi-day events are timed ranges
   (`dateTime` start/end, NOT all-day `date`).
3. **OFW-originated events (already carry a sync marker)** — at least one exists:
   "orthodontist Emily and Juliet" (2026-10-12 15:30–16:00) with description:

   ```
   [Synced from OurFamilyWizard — do not edit here; edit in OFW] ofwKey:orthodontist-emily-and-juliet|2026-10-12T15:30:00|2026-10-12T16:00:00 (OFW event id 129648862)
   ```

   So a prior/manual sync run already established this marker convention: an
   em-dash bracketed banner + `ofwKey:<slug>|<start>|<end>` + `(OFW event id <n>)`.
   The sync engine should keep and extend THIS convention, not invent a second one.

Other facts:
- No all-day `date` events observed in the window; everything is `dateTime`.
- `updated`/`created` fields are present and reliable (sample: updated
  2026-09-05T15:13:09.069Z).
- There is a sibling Google calendar named **"Parent Time (Court Order) - NOT
  synced to OFW"** (`ec19af785149ebfeceab2e31449cdb15be88002e8df54b8e73ad3fbacaba281e@group.calendar.google.com`) —
  its own name says keep it out of the sync. Never touch it from the sync engine.

## Marker / ownership proposal

- **Detect sync-owned events on the Google side** by matching the description
  banner `[Synced from OurFamilyWizard — do not edit here; edit in OFW]` (the
  existing convention). The task's suggested marker form
  `[synced:ofw:<ofw-event-ref>]` should NOT be used — one calendar, one marker;
  keep the banner and append/augment the `ofwKey:` segment, e.g.
  `ofwKey:<ofw-event-id>` where OFW event id is authoritative (the existing
  sample's slug+times key is fragile: times change on reschedule).
- Recommended write format (description): first line = human title/context as
  entered on OFW; marker block appended:
  ```
  [Synced from OurFamilyWizard — do not edit here; edit in OFW] ofwKey:<ofw-event-id>|<iso-start>|<iso-end> (OFW event id <ofw-event-id>)
  ```
- Never overwrite the non-marker portion of a sync-owned event's description if a
  human edited it in Google; patch only marker-managed fields or flag the
  conflict. (Direction of precedence TBD with OFW leg.)
- Human-edited events in Google carry NO marker → treat as Google-authoritative
  and push toward OFW (via the browser leg) or flag.

## Watcher design (Google → sync engine)

Poll `events list` with both `timeMin` and `updatedMin`:
- Keep a persistent watermark `lastSync` (RFC3339, stored in sync state).
- Poll: `events list --params '{"calendarId":"<id>","updatedMin":"<lastSync>","timeMin":"<window-start>","maxResults":250,"showDeleted":true,"singleEvents":true,"orderBy":"updated"}'`
- `showDeleted: true` returns `status: "cancelled"` stubs for deleted events —
  that's the **delete detection**. Compare returned event IDs against the sync
  engine's ID map.
- **Create detection:** event whose Google event ID is not in the sync map and
  lacks the OFW marker.
- **Update detection:** known ID with `updated > lastSync` (or compare
  `updated` to the stored fingerprint). For recurring instances, the instance ID
  (`seriesId_dateZ`) is stable; a modified single instance appears with
  `recurringEventId` — treat per-instance overrides as updates keyed by instance ID.
- **Watermark strategy:** after each successful poll batch, set `lastSync` to
  the max `updated` seen in the batch (not wall-clock) to avoid skipping
  events updated mid-poll; page through `nextPageToken` before advancing the
  watermark past the full batch.
- **Polling cadence:** every 10–15 minutes via cron. Event volume is low
  (a few hundred per quarter); `updatedMin` polls are cheap and return only
  deltas. No sub-minute urgency — parent-time changes are planned hours/days out.
- Note: `hatch_gws_cli` runs against the connected `jessestay@gmail.com` account;
  always pass the `--account` flag (it is not the default account).

## Push-notification (webhook) verdict: INFEASIBLE

Google Calendar push notifications (`events.watch`) require registering a
publicly reachable **HTTPS** webhook URL (`address` must be HTTPS and
Google must verify it via a sync POST). Our VM is localhost-only with no public
HTTPS ingress (no tunnel/proxy approved and none should be improvised). Setting
up a stable public endpoint would be new infrastructure with a security surface
the investor has not approved. **Verdict: do not use push notifications; use
the `updatedMin` polling watcher above.** Revisit only if a sanctioned public
HTTPS endpoint ever exists.

## Sample event shapes

Timed recurring instance (no marker):
```json
{"id":"rtqvlbrci1r16erjob7gnlfolg_20261002T210000Z","summary":"Emily Scouts",
 "start":{"dateTime":"2026-10-02T15:00:00-06:00","timeZone":"America/Denver"},
 "end":{"dateTime":"2026-10-02T16:15:00-06:00","timeZone":"America/Denver"},
 "status":"confirmed"}
```
Multi-day parent-time event (Google-authoritative prose description):
```json
{"summary":"Rebecca Parent Time - Fall Break (Part 1 of 2)",
 "start":{"dateTime":"2026-10-09T17:30:00-06:00","timeZone":"America/Denver"},
 "end":{"dateTime":"2026-10-11T18:00:00-06:00","timeZone":"America/Denver"},
 "description":"Per Utah Code 81-9-302: Fall break, even years = custodial parent (Rebecca). ..."}
```
OFW-synced event (existing marker convention):
```json
{"summary":"orthodontist Emily and Juliet",
 "start":{"dateTime":"2026-10-12T15:30:00-06:00","timeZone":"America/Denver"},
 "end":{"dateTime":"2026-10-12T16:00:00-06:00","timeZone":"America/Denver"},
 "description":"[Synced from OurFamilyWizard — do not edit here; edit in OFW] ofwKey:orthodontist-emily-and-juliet|2026-10-12T15:30:00|2026-10-12T16:00:00 (OFW event id 129648862)",
 "updated":"2026-09-05T15:13:09.069Z"}
```

## Window counts (2026-10-01 → 2027-06-01)
- (pagination run in progress; to be filled in)

## Open questions for the OFW leg / Exec PM
1. OFW event IDs: are they stable and unique across the shared calendar? The
   marker embeds them as the match key.
2. Conflict policy: when the same OFW event is edited in both Google (despite
   the banner) and OFW, which wins? Recommend OFW-wins for marked events,
   Google-wins for unmarked.
3. Recurring OFW events: does OFW expand instances or expose RRULEs? Determines
   whether the engine syncs one Google recurring series or per-instance events.
4. Do we sync all events on the Google calendar, or only holiday/parent-time
   blocks (populations 1 vs 2 vs 3)? Recommend scoping to parent-time/holiday +
   already-marked events; routine school series don't belong in a court calendar.
