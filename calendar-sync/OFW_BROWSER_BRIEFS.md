# OFW Calendar-Sync Browser Task Briefs

**Author:** OFW-leg researcher (subagent, no live-browser capability — research only)
**Date:** Fri 2026-09-25 (MDT)
**Audience:** Acting CEO (holds the live-browser route)
**Hard rule reminder:** Jesse Stay is investor/chairman — never approach him. This work routes through the CEO only.
**Verified prior work (Sep 25, 2026):** A browser task signed in as Jesse to ourfamilywizard.com (saved credentials exist) created **17 event entries** via New → Event. The existing **"Weekend Parent Time" parenting schedule (Aug 2026–Jun 2033) must NEVER be touched**; read-only for everything except event entries the sync owns or mirrors.

---

## 1. RESEARCH VERDICT: OFW→Google read path

**Verdict: OurFamilyWizard offers NO pollable live calendar subscription / ICS feed. The OFW→Google read leg MUST be browser-based.**

**Verified from OFW's own support docs** (https://support.ourfamilywizard.com/hc/en-us/articles/26041969274637-Can-I-export-the-Calendar, fetched and read 2026-09-25):

- OFW has one feature named **"Export (.ics)"**, located in the Calendar view (website only — **not available on the mobile app**), to the left of the calendar.
- It is a **one-time manual file download**: pick a date range → click "Export .ics" → an `.ics` file downloads to your device → you manually open/import it into an outside calendar.
- **It is static, not a feed.** OFW's docs state verbatim: *"Any events that are exported are static and will not update if changes are made within OurFamilyWizard."* There is no tokenized URL, no webcal:// link, no refresh interval, and no documented auto-update behavior of any kind.
- **It excludes the parenting schedule**: *"You will not be able to export your parenting schedule."* Only event-type entries export.
- Update latency for a script polling this: **none — there is nothing to poll.** It requires a logged-in interactive session each time.

**Also checked (search 2026-09-25):**
- No OFW public API exists (consistent with the project constraint). A 2020 OFW Q&A answer confirms only the static `.ics` export/import option; no iCal *send* capability.
- OFW docs mention a separate article, **"How do I connect an outside calendar to OurFamilyWizard?"** — this is the **inbound** direction (an outside calendar displayed as an overlay inside OFW), not an outbound feed. Its detailed behavior was not fetched; it is not a substitute for the read leg.
- The OFW New menu's **"New Calendar Subscription"** option (observed in the prior browser session) was not documented in any public support article found. **Inferred (not verified):** it is almost certainly the inbound subscription described in the "connect an outside calendar" article — i.e., subscribing OFW *to* an outside calendar — not an outbound OFW feed URL. The CEO can confirm this with a visual check during Brief A if the menu is visible, but **do not create one** — creating a subscription would change OFW state and is outside the read leg's scope.

**Consequence for the sync architecture:**
- The OFW→Google read leg is a **screen-scrape survey** (Brief A below), run on a schedule or on demand, extracting event entries from the OFW calendar month views. There is no script-only read path.

---

## 2. BRIEF A — OFW→GOOGLE READ LEG (read-only survey)

> **Copy-paste header for the browser operator:** You are performing a READ-ONLY calendar survey on OurFamilyWizard.com as Jesse Stay. Do not create, edit, or delete anything. Pace every action like a human (1–3 seconds between steps). If you hit a login wall, CAPTCHA/verification challenge, or session expiry, STOP immediately, report exactly what you saw, and do not retry.

### Preconditions
1. Fresh login check: confirm the saved-credential sign-in to ourfamilywizard.com succeeds and the Calendar loads before any survey work. (If the session from the Sep 25 work is still alive, do not re-login; just verify the calendar renders.)
2. Know the date range to survey (the CEO supplies it, e.g. Oct 2026 – Jan 2027). Survey **one month view at a time**; use the calendar's month navigation arrows only.

### Steps
1. Go to **Calendar** from the main navigation. Confirm the **Month view** is shown.
2. Navigate to the first month of the survey range.
3. For **every event tile on the month grid** (NOT the background "Weekend Parent Time" parenting-schedule shading — only clickable event entries):
   - Open the event's **read/view detail** (click the tile to view it; this is read-only).
   - Record: **Title**, **Start date & time**, **End date & time** (all times in America/Denver unless the event shows otherwise), **All Day flag**, **"Event for" parent** (Neither parent / Rebecca / Jesse), **Location**, **Reminder**, **Recurrence**, **full Notes text** (verbatim — needed for sync-marker detection, see §4), **Children** selection (All Children (3) / per-child).
   - Close the detail view **without touching Edit/Save/Delete**. If any dialog with an edit form opens accidentally, click **Cancel** and note it in the report.
4. Repeat for every month in the range. Never click **New → Event**, **Add**, **Save**, **Edit**, or **Delete** at any point.
5. If a month view shows a "New Calendar Subscription" or "Holiday" item in the New menu while navigating, **do not click it**; note its exact label in the report (helps verify the §1 inference).

### Run report format (return this to the Exec PM)
- For each event found, one block: `Title | Start (with tz) | End (with tz) | AllDay yes/no | Event-for | Location | Reminder | Recurrence | Children | Notes (verbatim, full)`
- A "months surveyed" list, any months that could not be read and why, and any unexpected dialogs or auth interruptions with the exact on-screen text.

### Hard stop conditions (no retries)
- Login wall, CAPTCHA/verification challenge, session expiry/logout, any dialog you did not expect → stop, screenshot if possible, report verbatim.

---

## 3. BRIEF B — GOOGLE→OFW WRITE LEG (create/update events)

> **Copy-paste header for the browser operator:** You are creating/updating calendar EVENTS on OurFamilyWizard.com as Jesse Stay from a supplied spec list. Create or update event entries only. Never touch the "Weekend Parent Time" parenting schedule or any holiday/schedule entry. Pace like a human: pause 2–5 seconds between saved entries. On any login wall, CAPTCHA, verification challenge, or unexpected dialog: STOP, do not retry, report verbatim.

### Preconditions
1. Fresh login check: confirm sign-in to ourfamilywizard.com succeeds and the Calendar loads.
2. The CEO supplies the spec list: per entry — **title, start (date + time, America/Denver), end (date + time, America/Denver), all-day yes/no, parent (Rebecca / Jesse / Neither parent), notes**. The provenance note text is generated by the sync (§4), not improvised.

### Steps (per entry)
1. Click **New → Event**. (Never "Holiday" or "New Calendar Subscription".)
2. Fill the form, exactly:
   - **Title:** as specified (required).
   - **Start Date & Time / End Date & Time:** MM/DD/YYYY + time; timezone America/Denver. If all-day: check the **All Day** checkbox.
   - **Recurrence:** as specified (default: none/one-time).
   - **Location / Reminder:** as specified (leave default if the spec has none).
   - **"Event for"** dropdown: set to the **named parent** from the spec.
   - **"Drop Off Parent" / "Pick Up Parent":** leave at **"Neither parent"** (default) unless the spec explicitly says otherwise.
   - **Children:** check **All Children (3)**.
   - **Private Event checkbox:** leave unchecked unless the spec says otherwise.
   - **Notes:** the full provenance text from §4 (contains the sync marker + Google event ID). Nothing else in Notes.
3. Click **Add**. Confirm the **"Event saved" confirmation** appears, then glance at the month view to see the new tile.
4. Pause 2–5 seconds before the next entry (human pacing).
5. For an **update** (entry already exists in OFW and is sync-owned per §4): open the event → Edit → change only the fields in the spec → Save → confirm "Event saved". If the event is NOT sync-owned (no marker), do **not** edit it — flag it in the report instead.

### Run report format (return this to the Exec PM)
- Per entry: `created | updated | skipped-flagged` + title + start/end + the on-screen confirmation seen ("Event saved" yes/no).
- Any skipped/flagged items with reasons; any auth/challenge interruptions with verbatim text.

### Hard stop conditions (no retries)
- Login wall, CAPTCHA, verification challenge, any unexpected dialog (e.g. conflict prompt, subscription upsell) → STOP, report verbatim, no retries.

### Absolute prohibitions
- Never open or edit the **"Weekend Parent Time"** parenting schedule (Aug 2026–Jun 2033).
- Never create/edit/delete **Holidays** or **Calendar Subscriptions**.
- Never delete any entry. Deletes are a CEO decision, never an automated sync action.

---

## 4. SYNC-MARKER CONVENTION (OFW entries)

### Provenance note format (the sync owns these)
Every event entry created or updated by the sync carries this exact Notes format:

```
<source-context line>; synced from the verified shared Google Calendar (<sync date>). MACF-SYNC: ofw-event | google-event-id: <google_event_id>
```

Example (matches the established pattern from the Sep 25 write work):
`Per decree/modification order holiday schedule; synced from the verified shared Google Calendar (Sep 25, 2026). MACF-SYNC: ofw-event | google-event-id: abc123def456`

Rules:
- `<source-context line>` is one short clause naming the authority (e.g. `Per decree/modification order holiday schedule`, `Per shared Google Calendar`).
- `MACF-SYNC: ofw-event` is the fixed ownership token. The sync owns **only** entries containing this token.
- `google-event-id:` carries the Google Calendar event ID this OFW entry mirrors — the join key for the diff.
- Notes are never edited by hand; the sync rewrites them wholesale on update.

### How the read leg (Brief A) classifies entries
1. **Sync-owned** — Notes contain `MACF-SYNC: ofw-event` **and** a `google-event-id:`.
   - Action: mirror back — compare fields (title/start/end/all-day/event-for/location/notes/children) against the Google entry with that ID; field diffs are conflicts to report, not to auto-fix.
2. **Rebecca's direct edit** — no `MACF-SYNC` token, **but** title + start/end closely match a Google spec entry (or an existing sync-owned entry's other fields).
   - Action: **new inbound** — do not touch the OFW entry; report it as inbound for the Exec PM to reconcile into the Google side per the conflict policy.
3. **Rebecca's new event** — no token, no match to any Google entry.
   - Action: **new inbound** — report it; the Google side decides whether to adopt it.
4. **Sync-owned but missing from Google** — token present, Google ID no longer exists.
   - Action: report as orphan; never auto-delete (deletes are a CEO decision).
5. **Parenting schedule / Holiday entries** — never in scope; ignore entirely.

---

## 5. PRECONDITIONS THE CEO MUST MEET BEFORE RUNNING

1. **Fresh login check** — verify saved-credential sign-in to ourfamilywizard.com works and the Calendar renders. Re-authenticate if the session expired; do not proceed on a stale session.
2. **Brief A (read):** a defined date range for the survey. Confirm the month view navigation works before extracting.
3. **Brief B (write):** a finalized spec list (title, start/end in America/Denver, all-day flag, parent, notes) with Google event IDs for every entry; nothing is improvised in the Notes field.
4. **Both briefs:** human pacing is mandatory; if OFW shows any bot/CAPTCHA/verification challenge at any point, stop — do not retry or route around it.
5. **Standing:** Jesse is not involved in any step of either brief; all reports flow to the acting CEO → Exec PM.
