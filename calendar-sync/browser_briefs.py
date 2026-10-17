#!/usr/bin/env python3
"""Calendar Sync App — browser brief generator (CEO contract).

Subagents never touch the live browser. This script generates the JSON
specs the CEO consumes verbatim for the two OFW browser briefs:

  python3 browser_briefs.py read-brief [--start YYYY-MM-DD] [--end YYYY-MM-DD]
      -> emits the Brief A (OFW read survey) spec JSON to stdout AND saves it
         as state/ofw_survey_pending.json (refuses if one is already pending).

  python3 browser_briefs.py write-brief [--force] [--include-deletes]
      -> collects unapplied outbound/ofw_task_*.json specs and emits the
         Brief B (OFW write) spec JSON to stdout. Enforces the CEO's
         notification-batching rule: at most one write batch per day
         (tracked in state/last_ofw_write_batch.json). Refuses if a batch
         was already issued today. ofw_delete specs are WITHHELD by default
         (the sync never auto-deletes OFW entries); --include-deletes adds
         them only after an explicit CEO decision.

  python3 browser_briefs.py survey-report --file <report.json>
      -> validates a CEO-dropped OFW survey report (from Brief A) against the
         read schema and stages it as state/ofw_survey_report_<brief_id>.json
         for reconcile.py. Prints VALID or a list of problems.

The read-brief spec follows OFW_BROWSER_BRIEFS.md section 2; the write-brief
spec follows section 3 + ARCHITECTURE.md section 5.
"""

import json
import os
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C

NOW_UTC = datetime.now(timezone.utc)


def utc_now_iso():
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


READ_REPORT_FIELDS = ["ofw_key", "title", "start", "end", "all_day", "parent",
                      "notes", "last_modified", "entry_type",
                      "location", "reminder", "recurrence", "children"]


def cmd_read_brief(args):
    # Default window: next 4 months from today (rolling survey horizon).
    start = args.get("--start") or NOW_UTC.strftime("%Y-%m-%d")
    end = args.get("--end") or (NOW_UTC + timedelta(days=120)).strftime("%Y-%m-%d")

    pending = load_json(C.OFW_SURVEY_PENDING, None)
    if pending and pending.get("brief_id"):
        print(f"REFUSED: survey {pending['brief_id']} already pending since "
              f"{pending.get('issued_at')}. Awaiting CEO report before re-issuing.",
              file=sys.stderr)
        return 3

    watermark = load_json(C.WATERMARK_OFW, {})
    brief_id = f"ofw_read_{NOW_UTC.strftime('%Y%m%dT%H%M%S')}"
    spec = {
        "brief_id": brief_id,
        "issued_at": utc_now_iso(),
        "direction": "ofw_to_google",
        "since": watermark.get("last_sync"),
        "survey_range": {"start": start, "end": end},
        "entry_type_allowlist": ["Event"],
        "report_fields": READ_REPORT_FIELDS,
        "absolute_prohibitions": [
            "Never open or edit the 'Weekend Parent Time' parenting schedule.",
            "Never create/edit/delete Holidays or Calendar Subscriptions.",
            "Never delete any entry. Deletes are a CEO decision, never an "
            "automated sync action.",
            "Read-only: if any edit dialog opens accidentally, Cancel and note it.",
        ],
        "hard_stops": [
            "Login wall, CAPTCHA/verification challenge, session expiry, or "
            "any unexpected dialog -> STOP immediately, report verbatim, no retries.",
        ],
        "report_format": (
            "One block per event: Title | Start (with tz) | End (with tz) | "
            "AllDay yes/no | Event-for | Location | Reminder | Recurrence | "
            "Children | Notes (verbatim, full). Plus: months surveyed, any "
            "months that could not be read and why, unexpected dialogs/auth "
            "interruptions with exact on-screen text. NOTE (Sep 25, 2026): OFW "
            "exposes no native stable event IDs; ofw_key is a DERIVED "
            "composite key (sha1 of normalized title|start|end|parent), "
            "generated at import time by import_ofw_survey.py — stable while "
            "those fields are unchanged."
        ),
        "report_delivery": (
            "Save the survey report JSON as "
            f"{C.OFW_SURVEY_REPORT_PREFIX}<brief_id>.json "
            "under ~/workspace/macf/hidden_files/calendar-sync/ "
            "(fields per report_fields above, plus brief_id and months_surveyed), "
            "or hand the report to the Exec PM to stage it."
        ),
    }
    save_json(C.OFW_SURVEY_PENDING, spec)
    print(json.dumps(spec, indent=2))
    return 0


def _unapplied_batches():
    """Return outbound batch files not yet recorded as applied."""
    applied = set()
    if os.path.isdir(C.APPLIED_DIR):
        for fn in os.listdir(C.APPLIED_DIR):
            if fn.startswith("applied_") and fn.endswith(".json"):
                rec = load_json(os.path.join(C.APPLIED_DIR, fn), {})
                for b in rec.get("batches", []):
                    applied.add(b)
    batches = []
    if os.path.isdir(C.OUTBOUND_DIR):
        for fn in sorted(os.listdir(C.OUTBOUND_DIR)):
            if fn.startswith("ofw_task_") and fn.endswith(".json"):
                b = load_json(os.path.join(C.OUTBOUND_DIR, fn), None)
                if b and b.get("brief_id") not in applied:
                    batches.append((fn, b))
    return batches


def cmd_write_brief(args):
    force = args.get("--force", False)
    include_deletes = args.get("--include-deletes", False)

    last = load_json(C.LAST_OFW_WRITE_BATCH, {})
    today = NOW_UTC.strftime("%Y-%m-%d")
    if not force and last.get("date") == today:
        print(f"REFUSED: write batch {last.get('brief_id')} already issued today "
              f"({today}). Notification-batching rule: at most one OFW browser "
              f"write session per day. Re-run with --force to override "
              f"(CEO decision only).", file=sys.stderr)
        return 3

    batches = _unapplied_batches()
    if not batches:
        print("OK: no unapplied outbound specs; nothing to brief.")
        return 0

    specs = []
    withheld_deletes = []
    source_batches = []
    for fn, b in batches:
        source_batches.append(b.get("brief_id"))
        for s in b.get("specs", []):
            # CEO decision: the sync NEVER auto-deletes OFW entries. Delete
            # specs are withheld from the routine Brief B batch and listed
            # separately for an explicit CEO decision (re-run with
            # --include-deletes once approved).
            if s.get("op") == "ofw_delete" and not include_deletes:
                withheld_deletes.append(s)
            else:
                specs.append(s)

    if not specs and withheld_deletes:
        print(f"OK: {len(withheld_deletes)} delete spec(s) withheld pending an "
              f"explicit CEO decision (re-run with --include-deletes to brief "
              f"them). Nothing else pending.")
        for s in withheld_deletes:
            print(f"  WITHHELD DELETE: {s.get('title')} "
                  f"(google_event_id={s.get('google_event_id')})")
        return 0
    if not specs:
        print("OK: no unapplied outbound specs; nothing to brief.")
        return 0

    brief_id = f"ofw_write_{NOW_UTC.strftime('%Y%m%dT%H%M%S')}"
    brief = {
        "brief_id": brief_id,
        "issued_at": utc_now_iso(),
        "direction": "google_to_ofw",
        "source_batches": source_batches,
        "idempotency": "per-spec sync_key, checked against OFW notes before create",
        "spec_count": len(specs),
        "withheld_deletes": [
            {"sync_key": s.get("sync_key"), "title": s.get("title"),
             "google_event_id": s.get("google_event_id")}
            for s in withheld_deletes
        ],
        "absolute_prohibitions": [
            "Create or update event entries ONLY. Never touch the "
            "'Weekend Parent Time' parenting schedule (Aug 2026 - Jun 2033).",
            "Never create/edit/delete Holidays or Calendar Subscriptions.",
            "NEVER delete any entry via this brief. Deletes are a separate "
            "CEO decision with its own verification step.",
            "Human pacing: pause 2-5 seconds between saved entries.",
            "On login wall / CAPTCHA / verification challenge / unexpected "
            "dialog: STOP, do not retry, report verbatim.",
        ],
        "specs": specs,
        "result_contract": {
            "deliver_to": "apply_ofw_results.py",
            "schema": "ARCHITECTURE.md section 5 (ofw_result): per spec "
                      "sync_key, op, status (ok | already_exists | failed | "
                      "not_found), ofw_key, evidence",
        },
    }
    save_json(C.LAST_OFW_WRITE_BATCH,
              {"date": today, "brief_id": brief_id,
               "source_batches": source_batches,
               "issued_at": utc_now_iso()})
    print(json.dumps(brief, indent=2))
    return 0


def cmd_survey_report(args):
    path = args.get("--file")
    if not path or not os.path.isfile(path):
        print("ERROR: --file <report.json> required.", file=sys.stderr)
        return 2
    report = load_json(path, None)
    if not isinstance(report, dict):
        print("ERROR: report is not a JSON object.", file=sys.stderr)
        return 2

    problems = []
    brief_id = report.get("brief_id")
    if not brief_id:
        problems.append("missing brief_id")
    entries = report.get("entries")
    if not isinstance(entries, list):
        problems.append("missing or non-list 'entries'")
        entries = []

    seen_keys = {}
    for i, e in enumerate(entries):
        if not isinstance(e, dict):
            problems.append(f"entries[{i}]: not an object")
            continue
        key = e.get("ofw_key")
        if not key:
            problems.append(f"entries[{i}] ({e.get('title','?')}): missing ofw_key "
                            "— reconciler requires stable unique OFW keys")
        elif key in seen_keys:
            problems.append(f"entries[{i}]: duplicate ofw_key '{key}' "
                            f"(also entries[{seen_keys[key]}])")
        else:
            seen_keys[key] = i
        for f in ("title", "start", "end"):
            if f not in e:
                problems.append(f"entries[{i}]: missing '{f}'")

    if problems:
        print("INVALID survey report:")
        for p in problems:
            print(f"  - {p}")
        return 4

    dest = f"{C.OFW_SURVEY_REPORT_PREFIX}{brief_id}.json"
    save_json(dest, report)
    # Clear the pending marker if it matches this brief.
    pending = load_json(C.OFW_SURVEY_PENDING, {})
    if pending.get("brief_id") == brief_id:
        os.remove(C.OFW_SURVEY_PENDING)
    print(f"VALID: {len(entries)} entries, {len(seen_keys)} unique ofw_keys. "
          f"Staged -> {dest}")
    return 0


def parse_args(argv):
    args = {"_pos": []}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a.startswith("--") and i + 1 < len(argv) and not argv[i + 1].startswith("--"):
            args[a] = argv[i + 1]
            i += 2
        elif a.startswith("--"):
            args[a] = True
            i += 1
        else:
            args["_pos"].append(a)
            i += 1
    return args


def main(argv):
    os.makedirs(C.STATE_DIR, exist_ok=True)
    args = parse_args(argv)
    pos = args["_pos"]
    if not pos:
        print(__doc__, file=sys.stderr)
        return 2
    cmd = pos[0]
    if cmd == "read-brief":
        return cmd_read_brief(args)
    if cmd == "write-brief":
        return cmd_write_brief(args)
    if cmd == "survey-report":
        return cmd_survey_report(args)
    print(f"ERROR: unknown command '{cmd}'", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
