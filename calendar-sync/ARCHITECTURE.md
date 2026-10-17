# Calendar Sync App — Architecture

Bidirectional sync between the Google Calendar **"Jesse and Rebecca Parent Time and Kids Schedule"** and the shared OurFamilyWizard (OFW) calendar.

- **Google leg:** `hatch_gws_cli calendar` API (read + write). Watched by poll job.
- **OFW leg:** NO API. All writes and reads go through live-browser tasks run by the **CEO** (this design specifies the handoff contract only; no browser work here).
- **Investor rule:** Jesse is investor/chairman. He is never approached, tasked, or nagged. Anything that needs him goes via the CEO and must be a decision only he can make.

## 1. Design principles

1. **Idempotent everything.** Every spec and every op can be safely retried. The browser leg is the flaky part; retries must never duplicate.
2. **Watermarks, not full rescans.** Each direction tracks the last-good timestamp (`updatedMin` equivalent) and resumes from there.
3. **Sync owns only what it marked.** An entry is "sync-owned" if and only if it carries a sync marker from the side that created the mirror. Unmarked OFW entries are Rebecca's (or pre-existing); the sync never edits them unreviewed.
4. **Never silent on custody.** Deletions are logged and flagged to Jesse via the CEO. Conflicts are never guessed — they are flagged.
5. **Hard filter on OFW entry types.** Only `Event`-type entries the sync owns or mirrors are eligible. The existing "Weekend Parent Time" parenting schedule and all non-event entries are untouchable.

## 2. Layout

```
~/workspace/macf/calendar-sync/                 # scripts + contracts
├── ARCHITECTURE.md                             # this file
├── poll_google.py                              # Direction 1: Google→OFW watcher (cron, 15 min)
├── reconcile.py                                # Direction 2: OFW→Google processor + initial reconciliation
├── apply_ofw_results.py                        # Consumes CEO/browser write-leg handoff, updates id_map + watermark_ofw
├── browser_briefs.py                           # Generates the JSON write/read task specs for the CEO browser briefs
├── config.py                                   # Constants: calendar names, marker strings, filter allowlists
└── schemas.md                                  # (optional later) formal JSON schemas for specs/handoffs

~/workspace/macf/hidden_files/calendar-sync/    # state — never user-facing, mode 600 where sensitive
├── watermark_google.json                       # {"last_sync": "2026-09-25T10:30:00-06:00"} — newest Google updated ts consumed
├── watermark_ofw.json                          # {"last_sync": "2026-09-25T10:00:00-06:00"} — newest OFW updated ts consumed
├── id_map.json                                 # google_event_id <-> ofw entry key, both directions
├── conflicts.json                              # events changed on BOTH sides since last sync — flagged, skipped until resolved
├── deletions.log                               # append-only; EVERY deletion, both directions
└── flags.json                                  # takeover/conflict/other flags for the CEO (see §9)
```

All times: ISO-8601 with timezone. Google side uses `America/Denver`; OFW side stores what OFW displays and normalizes on read.

## 3. Sync markers (loop prevention)

**Google side** (written into the event `description`):
```
[sync:ofw] ofw:<OFW-ENTRY-KEY>
```
Example: `[sync:ofw] ofw:evt_8f3a2c` appended to the event description, on its own line.

**OFW side** (written into the entry's notes field):
```
Synced from the verified shared Google Calendar "Jesse and Rebecca Parent Time and Kids Schedule".
Google event ID: <GOOGLE-EVENT-ID>
```

**Loop rule (hard):** When polling side A, any entry carrying a marker *written by the sync from side A* is skipped. The sync NEVER re-syncs an entry carrying its own marker from the side it just wrote. Concretely:

- `poll_google.py` skips Google events whose description contains `[sync:ofw]` **only** if the embedded `ofw:` key matches a known id_map entry in good standing. If the marker references an unknown/absent OFW key (OFW entry deleted out-of-band), it becomes a recreate candidate, not a skip.
- `reconcile.py` (OFW→Google) skips OFW entries whose notes contain the provenance string **and** whose embedded Google event ID exists in id_map. Unmarked OFW entries are treated as Rebecca's direct edits (see §6).

## 4. Direction 1 — Google→OFW (reliable, 15-min cron)

**Script:** `poll_google.py` (cron `calendar-sync-google-leg`, every 15 min)

1. Load `watermark_google.json` → `since`.
2. Query Google Calendar API (`hatch_gws_cli calendar`): events in "Jesse and Rebecca Parent Time and Kids Schedule" with `updatedMin=since`, `singleEvents=true`, `orderBy=updated`.
3. For each changed event:
   - **Filtered out (skip, log):** entry matches the OFW-exclusion patterns below (weekend-only blocks that duplicate the "Weekend Parent Time" schedule; see §9) — the initial 17-entry scope was holiday/break/birthday only, and the filter stays until Jesse authorizes broader sync.
   - **Carries own marker in good standing** → skip (no-op, avoids loops).
   - **New/updated, no marker** → emit an `ofw_create` or `ofw_update` spec (see §5).
   - **Deleted (Google returns status=cancelled / `deleted` in the changes feed)** → emit an `ofw_delete` spec, BUT also append to `deletions.log` and set a flag in `flags.json` for the CEO to surface to Jesse (see §8).
4. Write the pending specs to `~/workspace/macf/calendar-sync/outbound/ofw_task_<ts>.json` (one file per batch; also posted to the CEO channel per the team's handoff convention). **Do NOT advance `watermark_google.json` past the newest *acknowledged* event.** Watermark advances only in step 6 of the apply path below.

**Apply path** (`apply_ofw_results.py`, run when the CEO hands back the browser report):

1. Validate the handoff against the result schema (§5, `ofw_result`).
2. For each `ok` result: write `id_map` entry `{google_event_id, ofw_key, matched_via, created_at, marker}`; for `ofw_delete` results, remove the map entry and log to `deletions.log`.
3. For each `failed`/`not_found` result: leave state untouched (at-least-once: the spec is regenerated on the next poll because the watermark hasn't moved).
4. **Verification before destructive ops:** `ofw_delete` specs are never auto-applied from a partial batch — the CEO must confirm the OFW entry was actually located and deleted in the browser before `id_map`/`deletions.log` are updated.
5. Only after every spec in the batch is applied (or explicitly marked failed-with-evidence) does `watermark_google.json` advance to the newest event timestamp in the batch. Partial success → watermark advances only to the highest contiguous acknowledged timestamp; the rest stay queued.

## 5. Browser-task spec schema (the CEO contract)

`browser_briefs.py` emits this JSON. The CEO's browser brief consumes it verbatim. Every spec is **idempotent**: create specs carry a client-supplied idempotency key (`sync_key`) that the browser checks against the OFW notes field before creating.

```json
{
  "brief_id": "ofw_write_20260925T110000",
  "issued_at": "2026-09-25T11:00:00-06:00",
  "direction": "google_to_ofw",
  "idempotency": "per-spec sync_key, checked against OFW notes before create",
  "specs": [
    {
      "op": "ofw_create | ofw_update | ofw_delete",
      "sync_key": "gcal_<google_event_id>_v<updated_revision>",
      "google_event_id": "abc123def",
      "title": "Rebecca Parent Time - Fall Break (Part 1 of 2)",
      "parent": "Rebecca",
      "children": ["Alex", "Emily", "Juliet"],
      "start": "2026-10-09T17:30:00-06:00",
      "end": "2026-10-11T18:00:00-06:00",
      "all_day": false,
      "notes": "Synced from the verified shared Google Calendar \"Jesse and Rebecca Parent Time and Kids Schedule\".\nGoogle event ID: abc123def\nsync_key: gcal_abc123def_v3",
      "ofw_key": "evt_8f3a2c",
      "preconditions": [
        "If op=ofw_create and an OFW entry already carries this sync_key in notes, return already_exists — do not duplicate.",
        "If op=ofw_update and ofw_key not found, return not_found — do not create; the apply path will re-emit as create.",
        "If op=ofw_delete and ofw_key not found, return not_found — apply path removes the stale map entry."
      ]
    }
  ]
}
```

**OFW read-leg spec** (consumed by the read browser brief, used for Direction 2):

```json
{
  "brief_id": "ofw_read_20260925T120000",
  "issued_at": "2026-09-25T12:00:00-06:00",
  "direction": "ofw_to_google",
  "since": "2026-09-25T10:00:00-06:00",
  "entry_type_allowlist": ["Event"],
  "report_fields": ["ofw_key", "title", "start", "end", "all_day", "parent", "notes", "last_modified", "entry_type"]
}
```

**Browser handoff result schema** (what `apply_ofw_results.py` consumes):

```json
{
  "brief_id": "ofw_write_20260925T110000",
  "completed_at": "2026-09-25T11:22:00-06:00",
  "results": [
    {"sync_key": "gcal_abc123def_v3", "op": "ofw_create", "status": "ok | already_exists | failed | not_found", "ofw_key": "evt_8f3a2c", "evidence": "OFW confirmation text / screenshot ref"}
  ]
}
```

## 6. Direction 2 — OFW→Google (slower, hourly or daily)

**Script:** `reconcile.py` in `apply` mode (cron `calendar-sync-ofw-leg`, hourly; daily is acceptable)

1. CEO runs the read browser brief (§5) against OFW since `watermark_ofw.json`; handoff returns the report.
2. For each reported OFW entry (`entry_type == "Event"` only — hard filter, §9):
   - **Sync-owned (notes carry the provenance string + Google event ID in id_map):**
     - If only OFW side changed since last sync → update the Google event (title/start/end/description), preserving the `[sync:ofw]` marker in the description.
     - If only Google side changed → no-op (Direction 1 owns it; watermark comparison decides).
     - If BOTH changed → **conflict**: write to `conflicts.json`, set CEO flag, skip until resolved (see §7).
   - **NOT sync-owned (no marker):**
     - This is Rebecca's direct edit or a pre-existing entry. **Never auto-edit.** Candidate action: create/update the Google mirror WITH the `[sync:ofw]` marker — but only after review. Default: stage as a `mirror_candidate` in `flags.json` for CEO/Exec PM review on first occurrence; after explicit authorization per title-pattern (e.g., "all future *Birthday* entries auto-mirror"), subsequent matches may auto-mirror. Deletion candidates for unmarked OFW entries are never auto-applied.
3. OFW deletions (entry present in id_map but absent from OFW read, or reported deleted): mirror the deletion to Google, **log to `deletions.log`, flag to Jesse via CEO** (§8).
4. Advance `watermark_ofw.json` only after the Google-side writes are confirmed (Google API returns the updated event).

**If the ICS research comes back positive** (OFW exposes an ICS subscription URL for the shared calendar), it becomes the **preferred read path**: replace the hourly browser-read brief with an ICS fetch + parse (same report fields; `last_modified` may not exist in ICS — fall back to `DTSTAMP`/sequence, and treat any change in the VEVENT body vs. last-seen snapshot as "changed"). Browser-read remains the fallback.

## 7. Conflict rule

An event is in conflict if, at reconciliation time:

- `google_event.updated > watermark_google.last_sync` **AND** `ofw_entry.last_modified > watermark_ofw.last_sync`, and
- the event is sync-owned (in `id_map`), and
- the two sides differ in title/start/end/parent attribution.

On conflict: **do not guess**. Write to `conflicts.json`:

```json
{
  "google_event_id": "abc123def",
  "ofw_key": "evt_8f3a2c",
  "detected_at": "2026-09-25T12:05:00-06:00",
  "google_side": {"title": "...", "start": "...", "end": "...", "updated": "..."},
  "ofw_side":    {"title": "...", "start": "...", "end": "...", "last_modified": "..."},
  "resolution": null,
  "resolved_by": null
}
```

Set `flags.json.conflict_pending = true`. The sync **skips the event entirely** (both directions) until `resolution` is filled (`keep_google | keep_ofw | merged_manual`) with `resolved_by` recorded (CEO confirms Jesse's decision). Only then does the losing side get overwritten and watermarks move past it.

## 8. Deletions — never silent

Every deletion, either direction:

1. Appended to `deletions.log` (append-only, one JSON line per deletion):
   ```
   {"ts": "2026-09-25T12:10:00-06:00", "direction": "google_to_ofw", "google_event_id": "abc123def", "ofw_key": "evt_8f3a2c", "title": "Rebecca Parent Time - Fall Break (Part 1 of 2)", "reason": "deleted on Google", "flagged_to_ceo": true}
   ```
2. `flags.json.deletion_pending` set with the entry details — the CEO surfaces it to Jesse. These are custody entries; Jesse must always know when one disappears from either calendar.
3. Verification step: the deleting side must have actually been observed (Google `status=cancelled` in the feed, or OFW entry confirmed absent/deleted in the browser report). No speculative deletes.
4. Tombstones: deleted `id_map` entries are kept in `id_map.json` under `"tombstones"` for 90 days so a re-created event with the same identity matches the tombstone rather than creating a duplicate.

## 9. Hard filters — what the sync never touches

Encoded in `config.py`, checked before any spec is emitted or applied:

- **OFW entry-type allowlist:** only `"Event"`. Parenting schedules, journal entries, expense entries, info banks, and any other type are never read for sync purposes and never written to.
- **"Weekend Parent Time" schedule:** the active custom parenting schedule (Aug 13, 2026 – Jun 11, 2033) is explicitly excluded by name match (case-insensitive substring `weekend parent time`). No spec may reference it; the browser brief preconditions forbid editing it.
- **Pre-existing OFW entries the sync didn't create** (school schedules, Scouts, robotics, Labor Day entry, recurring transition entries found in the Sep 25 survey): unmatched and unmarked → treated as Rebecca's/out-of-scope; surfaced as `mirror_candidate`s at most, never auto-edited.
- **Google-side scope:** only the "Jesse and Rebecca Parent Time and Kids Schedule" calendar. Within it, the initial sync scope is holiday/break/birthday entries (the 17). Weekend blocks stay excluded until Jesse authorizes expanding scope — the filter is a named pattern list in `config.py`, not a hardcoded guess.

## 10. Initial reconciliation algorithm (first run — zero duplicates is the acceptance criterion)

Input: all Google events in range (Oct 2026 – May 2027, plus buffer) and the 17 known OFW entries (from the confirmed write handoff; verified visually Oct 2026 – May 2027).

```
for each google_event G in scope:
    for each ofw_entry O in the 17:
        score = match(G, O)
    best = highest score
    if best.score >= 0.80:
        → MATCH: write id_map entry {google_event_id: G.id, ofw_key: O.key,
            matched_via: "initial_reconciliation", match_score: best.score,
            marker: "present_in_ofw_notes"}
        → ensure markers are consistent (G.description gets [sync:ofw] marker if missing —
            marker backfill is a Google-side write, safe and idempotent)
    else:
        → UNMATCHED GOOGLE: emit ofw_create spec (Direction 1 queue)

for each ofw_entry O in the 17 not matched above:
    → UNMATCHED OFW: stage as mirror_candidate in flags.json for review.
       Do NOT auto-create a Google mirror — Rebecca may own it.
       (Expectation: zero unmatched OFW, since all 17 were mirrored from Google today.)
```

**`match(G, O)` scoring:**

- `start` equal within 5 minutes → 0.4 (all-day events: same date → 0.4)
- `end` equal within 5 minutes → 0.3 (all-day: same date → 0.3)
- parent attribution equal (Jesse vs Rebecca, parsed from title prefix) → 0.15
- title keyword overlap: tokenize both titles, lowercase, strip stopwords ("parent", "time", "holiday", "day"); Jaccard similarity ≥ 0.5 → 0.15; Jaccard ≥ 0.8 → additional confidence flag
- threshold: **0.80** to match. Known title divergences are expected (e.g. OFW "Rebecca Parent Time - Fall Break (Part 1 of 2)" vs a Google title that may say it differently); the (start, end, parent) triple carries most of the weight precisely for this reason.

**Tie-breaking:** if two OFW entries score ≥ 0.80 against one Google event (e.g. "Part 1 of 2" / "Part 2 of 2" splits), pick the higher score; if within 0.05, flag for human review rather than guessing.

**Marker backfill note:** the 17 OFW entries were created with provenance notes today ("retained its provenance note" per the write confirmation). The reconciliation run verifies the notes contain the Google event ID; where the note format differs from §3, it is normalized to the canonical format (OFW-side edit via browser spec `ofw_update`, notes-only).

## 11. Failure handling

- **Browser leg failure / no handoff:** state stays at last-good watermarks. Specs are at-least-once and idempotent (`sync_key` checked before create; `not_found` never creates on update path). Next poll regenerates the same specs; the CEO re-runs.
- **Partial batch:** `apply_ofw_results.py` applies `ok` results, records failures, and advances watermarks only to the highest contiguous acknowledged timestamp. Failed specs stay queued.
- **Google API errors (rate limit / auth):** `poll_google.py` exits non-zero without touching state; next cron retries. Auth failures raise a CEO flag (credential issue, not a sync issue).
- **OFW read returns garbage / session expired:** `reconcile.py` validates the report against the read schema and refuses to process a malformed handoff (no watermark advance, CEO flag).
- **Destructive ops (delete, conflict resolution):** always require the verification step in §4/§8 — no delete is applied to state until the remote side confirms it.

## 12. Vikunja-first

Per the standing MACF rule: the build itself is tracked in Vikunja (task #44 "Parent-time calendar sync" / related #40) before any work runs. Sync runs log a brief activity entry (direction, specs emitted/applied, conflicts, deletions) so the PM sees outcomes, never raw tasks.

## 13. Open questions

1. **ICS read path:** pending the sibling's OFW ICS/subscription research. If positive, Direction 2 becomes ICS-fetch + diff (preferred); if negative, the hourly browser-read brief stands.
2. **Google write scope:** pending the sibling's verification of `hatch_gws_cli calendar` write scope. Direction 2's Google-side writes (mirror create/update/delete + marker backfill) are blocked until write access is confirmed.
3. **OFW entry keys:** RESOLVED Sep 25, 2026 — OFW exposes no native stable event IDs (verified by the Brief A survey). `ofw_key` is now a DERIVED composite key: `CK-` + sha1(normalized_title|start_iso|end_iso|parent), generated at import time by `import_ofw_survey.py`. Stable while those fields are unchanged. See `reconcile.py::validate_report_keys` docstring.
4. **OFW `last_modified`:** unconfirmed whether OFW exposes per-entry modification timestamps in the UI. If not, Direction 2 conflict detection falls back to content-diff against last-seen snapshots stored in state.
5. **All-day vs timed normalization:** the 17 include all-day entries (MLK Jr. Day 01/18/2027, Presidents Day 02/15/2027) and timed entries; confirm OFW stores all-day as date-only so the matcher doesn't penalize.
6. **Scope expansion to weekend blocks:** currently out of scope (the "Weekend Parent Time" schedule covers them). Expanding requires Jesse's explicit authorization via the CEO.
7. **Notification behavior:** OFW sends Rebecca notifications on entry changes; batching strategy for bulk updates (to avoid notification storms) needs CEO guidance.
8. **"Part 1 of 2" splits:** confirm Google holds matching split events (Fall Break Part 1/Part 2) so the tie-break rule in §10 rarely triggers.
