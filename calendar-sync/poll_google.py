#!/usr/bin/env python3
"""Calendar Sync App — Direction 1: Google -> OFW watcher.

Cron: calendar-sync-google-leg, every 15 minutes.

Polls the Google Calendar "Jesse and Rebecca Parent Time and Kids Schedule"
with updatedMin + showDeleted and emits idempotent OFW write specs for
new/updated/deleted in-scope events.

At-least-once design:
  - Specs are written to outbound/ofw_task_<ts>.json (one file per batch).
  - watermark_google.json advances ONLY in apply_ofw_results.py, after the
    CEO's browser leg confirms each spec. This poller never advances it.
  - If the freshly computed specs are identical to the last emitted batch
    (same sync_keys), the poller stays quiet so the CEO isn't nagged every
    15 minutes about the same pending work.

First run: bootstraps watermark_google.json to NOW and emits nothing, so
today's historical corrections are not replayed as deletions.

Exit codes: 0 = ok (status line on stdout). Non-zero = Google API failure;
state untouched, next cron retries.
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C

NOW_UTC = datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return NOW_UTC.isoformat(timespec="seconds")


def load_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=2)
    os.replace(tmp, path)


def append_deletion(record: dict):
    os.makedirs(os.path.dirname(C.DELETIONS_LOG), exist_ok=True)
    record = dict(record)
    record.setdefault("ts", utc_now_iso())
    with open(C.DELETIONS_LOG, "a") as f:
        f.write(json.dumps(record) + "\n")


def gcal_events_list(params: dict):
    """Run hatch_gws_cli calendar events list --page-all; return list of events."""
    cmd = [
        "hatch_gws_cli", "calendar", "events", "list",
        "--account", C.GOOGLE_ACCOUNT_ID,
        "--params", json.dumps(params),
        "--page-all",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        print("ERROR: hatch_gws_cli timed out", file=sys.stderr)
        sys.exit(2)
    if proc.returncode != 0:
        print(f"ERROR: hatch_gws_cli failed rc={proc.returncode}: {proc.stderr[:300]}",
              file=sys.stderr)
        sys.exit(2)
    events = []
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            page = json.loads(line)
        except json.JSONDecodeError:
            continue
        events.extend(page.get("items", []))
    return events


def event_times(event):
    """Return (start_iso, end_iso, all_day) normalized strings."""
    s = event.get("start", {}) or {}
    e = event.get("end", {}) or {}
    start = s.get("dateTime") or s.get("date")
    end = e.get("dateTime") or e.get("date")
    return start, end, ("date" in s and "dateTime" not in s)


def sync_key_for(event_id: str, updated: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", updated or "noudate")
    return f"gcal_{event_id}_v{safe}"


def ofw_notes_text(source_context: str, google_event_id: str, sync_key: str) -> str:
    date_str = NOW_UTC.astimezone().strftime("%b %d, %Y")
    return (
        f"{source_context}; synced from the verified shared Google Calendar "
        f'"{C.GOOGLE_CALENDAR_NAME}" ({date_str}). '
        f"{C.OFW_NOTES_SYNC_TOKEN} | google-event-id: {google_event_id}\n"
        f"sync_key: {sync_key}"
    )


def source_context_for(event: dict) -> str:
    desc = (event.get("description") or "").strip().splitlines()
    if desc and desc[0].strip():
        first = desc[0].strip()
        if len(first) <= 120 and "MACF-SYNC" not in first and "Synced from" not in first:
            return first
    return "Per shared Google Calendar"


def main() -> int:
    os.makedirs(C.STATE_DIR, exist_ok=True)
    os.makedirs(C.OUTBOUND_DIR, exist_ok=True)

    watermark = load_json(C.WATERMARK_GOOGLE, None)
    if not watermark or not watermark.get("last_sync"):
        # First run: bootstrap to now, emit nothing.
        save_json(C.WATERMARK_GOOGLE, {"last_sync": utc_now_iso(),
                                      "bootstrapped_at": utc_now_iso()})
        print("FIRST RUN: watermark_google.json bootstrapped to now; no specs emitted.")
        return 0
    since = watermark["last_sync"]

    id_map = load_json(C.ID_MAP, {"map": {}, "tombstones": {}})
    id_entries = id_map.get("map", {})

    # Poll a wide time window; updatedMin is the delta filter.
    params = {
        "calendarId": C.GOOGLE_CALENDAR_ID,
        "updatedMin": since,
        "timeMin": "2026-01-01T00:00:00-07:00",
        "timeMax": "2028-01-01T00:00:00-07:00",
        "singleEvents": True,
        "showDeleted": True,
        "orderBy": "updated",
        "maxResults": 250,
    }
    events = gcal_events_list(params)

    specs = []
    skipped_marked_google_edits = []

    for ev in events:
        gid = ev.get("id")
        status = ev.get("status")
        updated = ev.get("updated")

        if status == "cancelled":
            # Delete detection: only meaningful if we ever synced this id.
            if gid in id_entries:
                entry = id_entries[gid]
                specs.append({
                    "op": "ofw_delete",
                    "sync_key": sync_key_for(gid, updated) + "_del",
                    "google_event_id": gid,
                    "ofw_key": entry.get("ofw_key"),
                    "title": entry.get("title", ev.get("summary", "")),
                    "preconditions": [
                        "CEO must confirm the OFW entry was actually located "
                        "and deleted in the browser before state is updated.",
                    ],
                })
                append_deletion({
                    "direction": "google_to_ofw",
                    "google_event_id": gid,
                    "ofw_key": entry.get("ofw_key"),
                    "title": entry.get("title", ""),
                    "reason": "deleted on Google (status=cancelled in changes feed)",
                    "flagged_to_ceo": True,
                })
                flags = load_json(C.FLAGS, {})
                pending = flags.get("deletion_pending", [])
                if not any(p.get("google_event_id") == gid for p in pending):
                    pending.append({"direction": "google_to_ofw", "google_event_id": gid,
                                    "title": entry.get("title", ""), "ts": utc_now_iso()})
                flags["deletion_pending"] = pending
                save_json(C.FLAGS, flags)
            continue

        # Out of scope (routine series, weekend blocks, non-parent-time) -> skip.
        if not C.google_event_in_scope(ev):
            continue

        # OFW-originated mirror edited in Google: Direction 2 owns it.
        # Never push Google-side edits of marked events to OFW here; flag it.
        ofw_origin_id = C.parse_google_ofw_marker(ev.get("description", ""))
        if ofw_origin_id:
            skipped_marked_google_edits.append(
                {"google_event_id": gid, "ofw_event_id": ofw_origin_id,
                 "updated": updated, "title": ev.get("summary", "")})
            continue

        start, end, all_day = event_times(ev)
        parent = C.parent_from_title(ev.get("summary", ""))
        if gid in id_entries:
            op = "ofw_update"
            ofw_key = id_entries[gid].get("ofw_key")
        else:
            op = "ofw_create"
            ofw_key = None

        skey = sync_key_for(gid, updated)
        spec = {
            "op": op,
            "sync_key": skey,
            "google_event_id": gid,
            "title": ev.get("summary", ""),
            "parent": parent or "Neither parent",
            "children": ["Alex", "Emily", "Juliet"],
            "start": start,
            "end": end,
            "all_day": all_day,
            "notes": ofw_notes_text(source_context_for(ev), gid, skey),
            "preconditions": [
                "If op=ofw_create and an OFW entry already carries this "
                "sync_key in notes, return already_exists \u2014 do not duplicate.",
                "If op=ofw_update and ofw_key not found, return not_found \u2014 "
                "do not create; the apply path will re-emit as create.",
                "If op=ofw_delete and ofw_key not found, return not_found \u2014 "
                "apply path removes the stale map entry.",
            ],
        }
        if ofw_key:
            spec["ofw_key"] = ofw_key
        specs.append(spec)

    if skipped_marked_google_edits:
        flags = load_json(C.FLAGS, {})
        flags["google_edited_marked"] = skipped_marked_google_edits
        save_json(C.FLAGS, flags)

    if not specs:
        print(f"OK: polled {len(events)} changed events since {since}; "
              f"nothing in scope to sync.")
        return 0

    # Idempotency against the last emitted batch: stay quiet if unchanged.
    new_keys = sorted(s["sync_key"] for s in specs)
    last_batch_path = os.path.join(C.STATE_DIR, "last_outbound_batch.json")
    last_batch = load_json(last_batch_path, {})
    if last_batch.get("sync_keys") == new_keys:
        print(f"OK: {len(specs)} specs pending (unchanged since last batch); "
              f"CEO already has them. Staying quiet.")
        return 0

    ts = NOW_UTC.strftime("%Y%m%dT%H%M%S")
    batch = {
        "brief_id": f"ofw_write_{ts}",
        "issued_at": utc_now_iso(),
        "direction": "google_to_ofw",
        "idempotency": "per-spec sync_key, checked against OFW notes before create",
        "spec_count": len(specs),
        "specs": specs,
    }
    out_path = os.path.join(C.OUTBOUND_DIR, f"ofw_task_{ts}.json")
    save_json(out_path, batch)
    save_json(last_batch_path, {"brief_id": batch["brief_id"],
                                "sync_keys": new_keys,
                                "path": out_path,
                                "issued_at": batch["issued_at"]})
    print(f"NEW SPECS: {len(specs)} OFW write specs queued -> {out_path} "
          f"(brief {batch['brief_id']}). Watermark NOT advanced (advances on apply).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
