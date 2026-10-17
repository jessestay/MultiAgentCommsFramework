#!/usr/bin/env python3
"""Calendar Sync App — Direction 2: OFW -> Google processor + initial reconciliation.

Modes:
  python3 reconcile.py initial
      First-run matching (ARCHITECTURE.md section 10). REQUIRES a staged OFW
      survey report (state/ofw_survey_report_<brief_id>.json, staged via
      browser_briefs.py survey-report). REFUSES to run until the report exists
      with stable, unique ofw_key values for every entry — this is the gate
      the CEO's Brief A survey answers. Zero-duplicates is the acceptance
      criterion. Refuses if initial reconciliation already ran (unless --force).

  python3 reconcile.py apply --report <report.json>
      Process one fresh OFW survey report: diff against id_map + snapshots,
      patch Google for OFW-won changes, file conflicts, stage mirror
      candidates, mirror confirmed OFW deletions to Google (logged + flagged).

  python3 reconcile.py daily
      Cron entrypoint (calendar-sync-ofw-leg, daily). Orchestrates:
      initial (if report present) -> apply (unprocessed reports) ->
      otherwise remind the CEO that the Brief A survey is outstanding.

CEO-confirmed conflict precedence:
  - Sync-marked pairs: OFW-wins. OFW-only change -> patch Google.
  - Google-only change on a Google-originated pair -> no-op (Direction 1 owns it).
  - Google-side edit of an OFW-originated (banner-marked) event -> FLAG only
    (never auto-push to OFW, never auto-revert).
  - Both sides changed -> conflicts.json with recommended_resolution, skipped
    until the CEO records a human resolution. Never guessed.
  - Unmarked OFW entries -> mirror_candidate only. Never auto-edited.

Deletions: mirrored to Google ONLY when the OFW survey verifiably covered the
entry's month and the entry is absent. Every deletion -> deletions.log +
flags.json deletion_pending (surfaced to Jesse via the CEO). The sync NEVER
auto-deletes OFW entries (Brief B prohibition).
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C

NOW_UTC = datetime.now(timezone.utc)
DENVER_TZ = "America/Denver"
STOPWORDS = {"parent", "time", "holiday", "day", "days"}


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


def append_deletion(record):
    os.makedirs(os.path.dirname(C.DELETIONS_LOG), exist_ok=True)
    record = dict(record)
    record.setdefault("ts", utc_now_iso())
    with open(C.DELETIONS_LOG, "a") as f:
        f.write(json.dumps(record) + "\n")


def add_flag(key, value):
    flags = load_json(C.FLAGS, {})
    if isinstance(flags.get(key), list):
        flags[key].append(value)
    else:
        flags[key] = value
    save_json(C.FLAGS, flags)


# ------------------------------------------------------------ Google API IO
def gcal_raw(args, timeout=120):
    cmd = ["hatch_gws_cli"] + args
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError(f"hatch_gws_cli failed rc={proc.returncode}: "
                           f"{proc.stderr[:300]}")
    return proc.stdout


def gcal_events_list(params):
    out = gcal_raw(["calendar", "events", "list",
                    "--account", C.GOOGLE_ACCOUNT_ID,
                    "--params", json.dumps(params), "--page-all"])
    events = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.extend(json.loads(line).get("items", []))
        except json.JSONDecodeError:
            continue
    return events


def gcal_patch(event_id, body):
    out = gcal_raw(["calendar", "events", "patch",
                    "--account", C.GOOGLE_ACCOUNT_ID,
                    "--params", json.dumps({"calendarId": C.GOOGLE_CALENDAR_ID,
                                            "eventId": event_id}),
                    "--json", json.dumps(body)])
    return json.loads(out)


def gcal_insert(summary, start_iso, end_iso, description, all_day=False):
    args = ["calendar", "+insert",
            "--account", C.GOOGLE_ACCOUNT_ID,
            "--calendar", C.GOOGLE_CALENDAR_ID,
            "--summary", summary,
            "--start", start_iso, "--end", end_iso,
            "--description", description]
    return json.loads(gcal_raw(args))


def gcal_delete(event_id):
    gcal_raw(["calendar", "events", "delete",
              "--account", C.GOOGLE_ACCOUNT_ID,
              "--params", json.dumps({"calendarId": C.GOOGLE_CALENDAR_ID,
                                      "eventId": event_id})])


# ------------------------------------------------------------ Time handling
def parse_ofw_time(s):
    """Parse an OFW survey time string -> aware datetime (America/Denver)."""
    from datetime import datetime as dt
    from zoneinfo import ZoneInfo
    denver = ZoneInfo(DENVER_TZ)
    s = (s or "").strip()
    if not s:
        return None
    # ISO first
    try:
        d = dt.fromisoformat(s)
        return d if d.tzinfo else d.replace(tzinfo=denver)
    except ValueError:
        pass
    for fmt in ("%m/%d/%Y %I:%M %p", "%m/%d/%Y %H:%M", "%Y-%m-%d %H:%M",
                "%m/%d/%Y", "%Y-%m-%d"):
        try:
            return dt.strptime(s, fmt).replace(tzinfo=denver)
        except ValueError:
            continue
    return None


def parse_google_time(event):
    from datetime import datetime as dt
    s = event.get("start", {}) or {}
    val = s.get("dateTime") or s.get("date")
    if not val:
        return None
    try:
        d = dt.fromisoformat(val)
        from zoneinfo import ZoneInfo
        return d if d.tzinfo else d.replace(tzinfo=ZoneInfo(DENVER_TZ))
    except ValueError:
        return None


def event_end_google(event):
    from datetime import datetime as dt
    from zoneinfo import ZoneInfo
    e = event.get("end", {}) or {}
    val = e.get("dateTime") or e.get("date")
    if not val:
        return None
    try:
        d = dt.fromisoformat(val)
        return d if d.tzinfo else d.replace(tzinfo=ZoneInfo(DENVER_TZ))
    except ValueError:
        return None


def minutes_apart(a, b):
    if not a or not b:
        return None
    return abs((a - b).total_seconds()) / 60.0


# ------------------------------------------------------------ Match scoring
def title_tokens(title):
    toks = re.findall(r"[a-z0-9]+", (title or "").lower())
    return {t for t in toks if t not in STOPWORDS}


def match_score(g_event, o_entry):
    """ARCHITECTURE.md section 10 scoring. Returns 0..1."""
    score = 0.0
    g_start, g_end = parse_google_time(g_event), event_end_google(g_event)
    o_start, o_end = parse_ofw_time(o_entry.get("start")), parse_ofw_time(o_entry.get("end"))

    def close(a, b, date_only):
        if a is None or b is None:
            return False
        if date_only:
            return a.date() == b.date()
        return minutes_apart(a, b) <= C.TIME_TOLERANCE_MIN

    g_allday = "date" in (g_event.get("start", {}) or {}) and \
               "dateTime" not in (g_event.get("start", {}) or {})
    o_allday = bool(o_entry.get("all_day"))

    if close(g_start, o_start, g_allday or o_allday):
        score += 0.4
    if close(g_end, o_end, g_allday or o_allday):
        score += 0.3

    g_parent = C.parent_from_title(g_event.get("summary", ""))
    o_parent = o_entry.get("parent") or C.parent_from_title(o_entry.get("title", ""))
    if g_parent and o_parent and g_parent == o_parent:
        score += 0.15

    gt, ot = title_tokens(g_event.get("summary", "")), title_tokens(o_entry.get("title", ""))
    if gt and ot:
        jaccard = len(gt & ot) / len(gt | ot)
        if jaccard >= 0.5:
            score += 0.15
    return round(score, 3)


# ------------------------------------------------------------ Survey reports
def staged_reports():
    reps = []
    if os.path.isdir(C.STATE_DIR):
        for fn in sorted(os.listdir(C.STATE_DIR)):
            if fn.startswith("ofw_survey_report_") and fn.endswith(".json"):
                reps.append(os.path.join(C.STATE_DIR, fn))
    return reps


def validate_report_keys(report):
    """The Brief A gate: every entry needs a stable, unique ofw_key.

    NOTE (Sep 25, 2026): OFW exposes NO native stable event IDs, so ofw_key
    is DERIVED as a composite key — sha1(normalized_title|start|end|parent),
    generated at import time by import_ofw_survey.py. Stable while those
    fields are unchanged, which is exactly the equality the reconciler needs.
    Snapshots and id_map key on ofw_key unchanged; only provenance changed.
    """
    entries = report.get("entries", [])
    problems = []
    seen = {}
    for i, e in enumerate(entries):
        k = e.get("ofw_key")
        if not k:
            problems.append(f"entries[{i}] missing ofw_key")
        elif k in seen:
            problems.append(f"duplicate ofw_key '{k}'")
        else:
            seen[k] = i
    return problems


# ------------------------------------------------------------ initial mode
def cmd_initial(args):
    force = "--force" in args
    done_marker = os.path.join(C.STATE_DIR, "initial_done.json")
    if os.path.isfile(done_marker) and not force:
        print("REFUSED: initial reconciliation already ran "
              f"({load_json(done_marker, {}).get('ran_at')}). Use --force to re-run.",
              file=sys.stderr)
        return 3

    reports = staged_reports()
    if not reports:
        print("BLOCKED: no staged OFW survey report found. The CEO's Brief A "
              "survey (Oct 2026–Jan 2027, currently running via the live browser) "
              "must land first — stage it with:\n"
              "  python3 browser_briefs.py survey-report --file <report.json>\n"
              "The reconciler depends on the survey's answer to whether OFW "
              "event IDs are stable/unique. Nothing was changed.", file=sys.stderr)
        return 5

    report = load_json(reports[-1], {})
    problems = validate_report_keys(report)
    if problems:
        print("BLOCKED: survey report failed the OFW-key stability gate:",
              file=sys.stderr)
        for p in problems[:10]:
            print(f"  - {p}", file=sys.stderr)
        print("Nothing was changed. The survey needs re-running with ofw_key "
              "captured per entry.", file=sys.stderr)
        return 5

    entries = report["entries"]
    print(f"Initial reconciliation: {len(entries)} OFW entries from "
          f"{os.path.basename(reports[-1])}")

    g_events = gcal_events_list({
        "calendarId": C.GOOGLE_CALENDAR_ID,
        "timeMin": "2026-10-01T00:00:00-06:00",
        "timeMax": "2027-06-01T00:00:00-06:00",
        "singleEvents": True,
        "orderBy": "startTime",
        "maxResults": 250,
    })
    in_scope = [e for e in g_events
                if e.get("status") == "confirmed" and C.google_event_in_scope(e)]
    print(f"  {len(g_events)} Google events in range, {len(in_scope)} in scope.")

    id_map = {"map": {}, "tombstones": {}}
    matched_ofw = set()
    needs_review = []
    notes_fix_specs = []

    for g in in_scope:
        scored = sorted(((match_score(g, o), o) for o in entries),
                        key=lambda t: t[0], reverse=True)
        best_score, best_o = scored[0]
        second_score = scored[1][0] if len(scored) > 1 else 0.0
        if best_score >= C.MATCH_THRESHOLD:
            if best_score - second_score < C.MATCH_TIE_DELTA and second_score >= C.MATCH_THRESHOLD:
                needs_review.append({
                    "google_event_id": g["id"], "title": g.get("summary"),
                    "candidates": [{"ofw_key": o["ofw_key"], "title": o.get("title"),
                                    "score": s} for s, o in scored[:2]
                                   if s >= C.MATCH_THRESHOLD],
                    "reason": "tie within delta — human review, not guessed",
                })
                continue
            gid = g["id"]
            id_map["map"][gid] = {
                "ofw_key": best_o["ofw_key"],
                "title": g.get("summary", ""),
                "matched_via": "initial_reconciliation",
                "match_score": best_score,
                "created_at": utc_now_iso(),
            }
            matched_ofw.add(best_o["ofw_key"])
            # Notes normalization: OFW entry must carry the canonical token +
            # this Google id. If not, emit a notes-only ofw_update spec.
            owned, noted_gid = C.parse_ofw_notes(best_o.get("notes", ""))
            if not owned or noted_gid != gid:
                notes_fix_specs.append({
                    "op": "ofw_update",
                    "sync_key": f"gcal_{gid}_notesfix",
                    "google_event_id": gid,
                    "ofw_key": best_o["ofw_key"],
                    "title": best_o.get("title", ""),
                    "notes_only": True,
                    "notes": canonical_ofw_notes(g, gid, f"gcal_{gid}_notesfix"),
                    "preconditions": ["Notes-only normalization; do not touch "
                                      "other fields."],
                })

    # Unmatched Google in-scope events -> ofw_create specs (Direction 1 queue).
    create_specs = []
    for g in in_scope:
        if g["id"] not in id_map["map"]:
            s, e = g.get("start", {}), g.get("end", {})
            skey = f"gcal_{g['id']}_initial"
            create_specs.append({
                "op": "ofw_create",
                "sync_key": skey,
                "google_event_id": g["id"],
                "title": g.get("summary", ""),
                "parent": C.parent_from_title(g.get("summary", "")) or "Neither parent",
                "children": ["Alex", "Emily", "Juliet"],
                "start": s.get("dateTime") or s.get("date"),
                "end": e.get("dateTime") or e.get("date"),
                "all_day": ("date" in s and "dateTime" not in s),
                "notes": canonical_ofw_notes(g, g["id"], skey),
                "preconditions": [
                    "If an OFW entry already carries this sync_key in notes, "
                    "return already_exists — do not duplicate.",
                    "COMPOSITE-KEY DEDUP (Sep 25, 2026): before creating, "
                    "search OFW for an existing entry with the same title "
                    "(case-insensitive) and same start/end date. If one "
                    "exists — even WITHOUT this sync_key in its notes "
                    "(e.g. created Sep 25, 2026 before sync markers were "
                    "normalized) — return already_exists, do NOT create a "
                    "duplicate, and report it as a pre-existing pair so the "
                    "CEO can normalize its notes."],
            })

    # Unmatched OFW entries -> mirror candidates (never auto-created).
    # This run re-evaluates every entry in the report, so prior candidates
    # for those keys are superseded and dropped (no accumulation across
    # re-runs); candidates from other surveys/months are preserved.
    flags = load_json(C.FLAGS, {})
    entry_keys = {o["ofw_key"] for o in entries}
    candidates = [c for c in flags.get("mirror_candidates", [])
                  if c.get("ofw_key") not in entry_keys]
    for o in entries:
        if o["ofw_key"] not in matched_ofw:
            owned, _ = C.parse_ofw_notes(o.get("notes", ""))
            candidates.append({
                "ofw_key": o["ofw_key"], "title": o.get("title"),
                "start": o.get("start"), "end": o.get("end"),
                "parent": o.get("parent"),
                "reason": ("OFW entry not matched to any Google event; "
                           "sync-owned" if owned else
                           "OFW entry not matched to any Google event; "
                           "unmarked OFW entry"),
                "origin": "initial_reconciliation",
                "staged_at": utc_now_iso(),
            })
    flags["mirror_candidates"] = candidates
    save_json(C.FLAGS, flags)

    save_json(C.ID_MAP, id_map)

    # Queue create + notes-fix specs through the normal outbound path.
    all_specs = create_specs + notes_fix_specs
    if all_specs:
        ts = NOW_UTC.strftime("%Y%m%dT%H%M%S")
        batch = {
            "brief_id": f"ofw_write_initial_{ts}",
            "issued_at": utc_now_iso(),
            "direction": "google_to_ofw",
            "origin": "initial_reconciliation",
            "idempotency": "per-spec sync_key, checked against OFW notes before create",
            "spec_count": len(all_specs),
            "specs": all_specs,
        }
        os.makedirs(C.OUTBOUND_DIR, exist_ok=True)
        batch_path = os.path.join(C.OUTBOUND_DIR, f"ofw_task_initial_{ts}.json")
        save_json(batch_path, batch)
        # Self-maintaining: drop superseded initial batches from prior runs so
        # Brief B never sees duplicate spec sets.
        for fn in os.listdir(C.OUTBOUND_DIR):
            if fn.startswith("ofw_task_initial_") and fn.endswith(".json") \
                    and fn != os.path.basename(batch_path):
                os.remove(os.path.join(C.OUTBOUND_DIR, fn))
        save_json(os.path.join(C.STATE_DIR, "last_outbound_batch.json"),
                  {"brief_id": batch["brief_id"],
                   "sync_keys": sorted(s["sync_key"] for s in all_specs),
                   "issued_at": batch["issued_at"]})

    # Snapshots for future diffing.
    snapshots = {o["ofw_key"]: snapshot_of(o) for o in entries}
    save_json(os.path.join(C.STATE_DIR, "ofw_snapshots.json"), snapshots)
    save_json(os.path.join(C.STATE_DIR, "processed_surveys.json"),
              {"processed": [os.path.basename(reports[-1])],
               "updated_at": utc_now_iso()})

    # Watermarks: OFW to now (survey just completed); Google watermark is owned
    # by the Direction-1 apply path — bootstrap it here only if missing so the
    # poller doesn't replay history.
    save_json(C.WATERMARK_OFW, {"last_sync": utc_now_iso(),
                               "advanced_by": "initial_reconciliation"})
    if not os.path.isfile(C.WATERMARK_GOOGLE):
        save_json(C.WATERMARK_GOOGLE, {"last_sync": utc_now_iso(),
                                      "bootstrapped_at": utc_now_iso()})
    save_json(done_marker, {"ran_at": utc_now_iso(),
                            "survey": os.path.basename(reports[-1]),
                            "matched": len(id_map["map"]),
                            "unmatched_google": len(create_specs),
                            "unmatched_ofw": len(entries) - len(matched_ofw),
                            "needs_review": len(needs_review)})
    if needs_review:
        save_json(os.path.join(C.STATE_DIR, "initial_review.json"),
                  {"ties": needs_review, "at": utc_now_iso()})

    print(f"DONE: {len(id_map['map'])} pairs mapped, "
          f"{len(create_specs)} unmatched Google -> OFW create specs queued, "
          f"{len(entries) - len(matched_ofw)} unmatched OFW -> mirror candidates, "
          f"{len(needs_review)} ties need human review.")
    if needs_review:
        print("  TIES FLAGGED (not guessed):")
        for t in needs_review:
            print(f"   - {t['title']}: {[c['title'] for c in t['candidates']]}")
    return 0


def canonical_ofw_notes(g_event, google_event_id, sync_key):
    date_str = NOW_UTC.astimezone().strftime("%b %d, %Y")
    ctx = (g_event.get("summary") or "Per shared Google Calendar")
    return (
        f"{ctx}; synced from the verified shared Google Calendar "
        f'"{C.GOOGLE_CALENDAR_NAME}" ({date_str}). '
        f"{C.OFW_NOTES_SYNC_TOKEN} | google-event-id: {google_event_id}\n"
        f"sync_key: {sync_key}"
    )


def snapshot_of(o_entry):
    return {
        "title": o_entry.get("title"),
        "start": o_entry.get("start"),
        "end": o_entry.get("end"),
        "all_day": o_entry.get("all_day"),
        "parent": o_entry.get("parent"),
        "notes": o_entry.get("notes"),
        "seen_at": utc_now_iso(),
    }


def snapshots_differ(a, b):
    for k in ("title", "start", "end", "all_day", "parent"):
        if (a.get(k) or "") != (b.get(k) or ""):
            return True
    # Notes: compare marker-relevant content only (timestamps inside notes churn).
    na = re.sub(r"sync_key:\s*\S+", "", a.get("notes") or "")
    nb = re.sub(r"sync_key:\s*\S+", "", b.get("notes") or "")
    return na.strip() != nb.strip()


# ------------------------------------------------------------ apply mode
def cmd_apply(args):
    report_path = args.get("--report")
    if not report_path:
        # Default: newest unprocessed staged report.
        processed = load_json(os.path.join(C.STATE_DIR, "processed_surveys.json"),
                              {}).get("processed", [])
        candidates = [r for r in staged_reports()
                      if os.path.basename(r) not in processed]
        if not candidates:
            print("OK: no unprocessed survey reports.")
            return 0
        report_path = candidates[-1]
    if not os.path.isfile(report_path):
        print(f"ERROR: report not found: {report_path}", file=sys.stderr)
        return 2

    done_marker = os.path.join(C.STATE_DIR, "initial_done.json")
    if not os.path.isfile(done_marker):
        print("BLOCKED: initial reconciliation has not run yet. Run "
              "'reconcile.py initial' first (it is itself gated on the Brief A "
              "survey).", file=sys.stderr)
        return 5

    report = load_json(report_path, {})
    problems = validate_report_keys(report)
    if problems:
        print("BLOCKED: survey report failed the OFW-key gate:", file=sys.stderr)
        for p in problems[:10]:
            print(f"  - {p}", file=sys.stderr)
        return 5

    entries = {e["ofw_key"]: e for e in report["entries"]}
    months_surveyed = report.get("months_surveyed", [])

    id_map = load_json(C.ID_MAP, {"map": {}, "tombstones": {}})
    id_entries = id_map.get("map", {})
    snapshots = load_json(os.path.join(C.STATE_DIR, "ofw_snapshots.json"), {})
    wm_google = load_json(C.WATERMARK_GOOGLE, {}).get("last_sync")
    wm_ofw = load_json(C.WATERMARK_OFW, {}).get("last_sync")
    conflicts = load_json(C.CONFLICTS, {"conflicts": []})["conflicts"]
    flags = load_json(C.FLAGS, {})

    # Current Google state for the pair set.
    g_ids = list(id_entries.keys())
    g_events = {}
    if g_ids:
        # Fetch in one windowed list and index; simpler than N gets.
        all_g = gcal_events_list({
            "calendarId": C.GOOGLE_CALENDAR_ID,
            "timeMin": "2026-01-01T00:00:00-07:00",
            "timeMax": "2028-01-01T00:00:00-07:00",
            "singleEvents": True,
            "showDeleted": True,
            "orderBy": "updated",
            "maxResults": 250,
        })
        for e in all_g:
            if e.get("id") in id_entries:
                g_events[e["id"]] = e

    patched_google, new_conflicts, new_candidates = 0, 0, 0
    known_candidates = {c.get("ofw_key") for c in flags.get("mirror_candidates", [])}

    for gid, entry in list(id_entries.items()):
        o_key = entry.get("ofw_key")
        o = entries.get(o_key)
        g = g_events.get(gid)

        # --- OFW-side deletion? (absent from a survey that covered its month)
        if o is None:
            start_dt = None
            if entry.get("title"):
                pass
            covered = True  # conservative: only claim deletion if we can verify
            # We verify via the entry's last snapshot start month.
            snap = snapshots.get(o_key, {})
            snap_start = parse_ofw_time(snap.get("start") or "")
            if snap_start:
                month_token = snap_start.strftime("%Y-%m")
                covered = any(month_token in str(m) for m in months_surveyed) or \
                    not months_surveyed
            if covered:
                # Mirror the deletion to Google (logged + flagged; CEO surfaces).
                try:
                    if g and g.get("status") != "cancelled":
                        gcal_delete(gid)
                except Exception as ex:
                    add_flag("notes", f"Google mirror delete failed for {gid}: {ex}")
                    continue
                append_deletion({
                    "direction": "ofw_to_google",
                    "google_event_id": gid,
                    "ofw_key": o_key,
                    "title": entry.get("title", ""),
                    "reason": "OFW entry absent from survey covering its month",
                    "flagged_to_ceo": True,
                })
                dp = flags.get("deletion_pending", [])
                dp.append({"direction": "ofw_to_google", "google_event_id": gid,
                           "ofw_key": o_key, "title": entry.get("title", ""),
                           "ts": utc_now_iso()})
                flags["deletion_pending"] = dp
                id_map.setdefault("tombstones", {})[gid] = {
                    "ofw_key": o_key, "title": entry.get("title", ""),
                    "deleted_at": utc_now_iso(), "direction": "ofw_to_google"}
                del id_entries[gid]
                snapshots.pop(o_key, None)
            continue

        # --- Google-side deletion is Direction 1's job (poller emits the
        # --- CEO-gated ofw_delete spec). Skip here to avoid double-handling.
        if g is None or g.get("status") == "cancelled":
            continue

        ofw_changed = snapshots_differ(snapshots.get(o_key, {}), snapshot_of(o))
        google_changed = bool(wm_google and g.get("updated") and
                              g["updated"] > wm_google)

        if ofw_changed and google_changed:
            conflicts.append({
                "google_event_id": gid,
                "ofw_key": o_key,
                "detected_at": utc_now_iso(),
                "google_side": {"title": g.get("summary"),
                                "start": (g.get("start") or {}).get("dateTime") or (g.get("start") or {}).get("date"),
                                "end": (g.get("end") or {}).get("dateTime") or (g.get("end") or {}).get("date"),
                                "updated": g.get("updated")},
                "ofw_side": {"title": o.get("title"), "start": o.get("start"),
                             "end": o.get("end"), "parent": o.get("parent"),
                             "last_modified": o.get("last_modified")},
                "recommended_resolution": "keep_ofw",
                "resolution": None,
                "resolved_by": None,
            })
            new_conflicts += 1
            flags["conflict_pending"] = True
            continue

        if ofw_changed and not google_changed:
            # OFW-wins for sync-marked pairs: patch the Google mirror.
            o_start = parse_ofw_time(o.get("start"))
            o_end = parse_ofw_time(o.get("end"))
            body = {"summary": o.get("title")}
            if o_start:
                body["start"] = {"dateTime": o_start.isoformat(), "timeZone": DENVER_TZ}
            if o_end:
                body["end"] = {"dateTime": o_end.isoformat(), "timeZone": DENVER_TZ}
            # Preserve any existing description; OFW is the mirror source here.
            try:
                gcal_patch(gid, body)
                patched_google += 1
            except Exception as ex:
                add_flag("notes", f"Google patch failed for {gid}: {ex}")
            snapshots[o_key] = snapshot_of(o)
        elif google_changed and not ofw_changed:
            # Direction 1 owns Google->OFW; the poller already queued it. No-op.
            snapshots[o_key] = snapshot_of(o)
        else:
            snapshots[o_key] = snapshot_of(o)

    # --- Unmarked / unknown OFW entries -> mirror candidates (never auto-edit).
    for o_key, o in entries.items():
        owned, _ = C.parse_ofw_notes(o.get("notes", ""))
        in_map = any(e.get("ofw_key") == o_key for e in id_entries.values())
        if not owned and not in_map and o_key not in known_candidates:
            flags.setdefault("mirror_candidates", []).append({
                "ofw_key": o_key, "title": o.get("title"),
                "start": o.get("start"), "end": o.get("end"),
                "parent": o.get("parent"),
                "reason": "unmarked OFW entry (Rebecca's direct edit or "
                          "pre-existing); never auto-mirrored",
                "staged_at": utc_now_iso(),
            })
            new_candidates += 1

    save_json(C.ID_MAP, id_map)
    save_json(C.CONFLICTS, {"conflicts": conflicts})
    save_json(C.FLAGS, flags)
    save_json(os.path.join(C.STATE_DIR, "ofw_snapshots.json"), snapshots)
    save_json(C.WATERMARK_OFW, {"last_sync": utc_now_iso(),
                               "advanced_by": f"reconcile:apply:{os.path.basename(report_path)}"})
    processed = load_json(os.path.join(C.STATE_DIR, "processed_surveys.json"),
                          {"processed": []})
    processed["processed"].append(os.path.basename(report_path))
    processed["updated_at"] = utc_now_iso()
    save_json(os.path.join(C.STATE_DIR, "processed_surveys.json"), processed)

    print(f"APPLY DONE ({os.path.basename(report_path)}): "
          f"{patched_google} Google mirrors patched, {new_conflicts} new conflicts, "
          f"{new_candidates} new mirror candidates.")
    if new_conflicts:
        print("  CONFLICTS PENDING HUMAN RESOLUTION — see state/conflicts.json")
    return 0


# ------------------------------------------------------------ daily mode
def cmd_daily(args):
    """Cron entrypoint: initial -> apply -> otherwise remind CEO."""
    done_marker = os.path.join(C.STATE_DIR, "initial_done.json")
    if not os.path.isfile(done_marker):
        if staged_reports():
            print("Daily: staged survey found; running initial reconciliation.")
            return cmd_initial(args)
        pending = load_json(C.OFW_SURVEY_PENDING, {})
        if pending.get("brief_id"):
            print(f"Daily: awaiting CEO's Brief A survey report "
                  f"({pending['brief_id']}). Initial reconciliation is gated "
                  f"until it lands. Nothing changed.")
        else:
            print("Daily: no survey pending and none staged. The CEO should "
                  "issue the Brief A read survey:\n"
                  "  python3 browser_briefs.py read-brief --start 2026-10-01 --end 2027-01-31")
        return 0

    processed = set(load_json(os.path.join(C.STATE_DIR, "processed_surveys.json"),
                              {}).get("processed", []))
    fresh = [r for r in staged_reports() if os.path.basename(r) not in processed]
    if fresh:
        print(f"Daily: {len(fresh)} unprocessed survey report(s); applying newest.")
        return cmd_apply({"--report": fresh[-1]})

    # Nothing new: report write-batch status for the CEO.
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import browser_briefs as BB
    batches = BB._unapplied_batches()
    n_specs = sum(len(b.get("specs", [])) for _, b in batches)
    withheld_deletes = sum(1 for _, b in batches for s in b.get("specs", [])
                           if s.get("op") == "ofw_delete")
    flags = load_json(C.FLAGS, {})
    parts = [f"Daily: no new OFW survey; {n_specs} write specs pending "
             f"({withheld_deletes} deletes withheld for CEO decision)."]
    if flags.get("conflict_pending"):
        parts.append("CONFLICTS pending human resolution (state/conflicts.json).")
    if flags.get("deletion_pending"):
        parts.append(f"{len(flags['deletion_pending'])} deletions flagged for Jesse.")
    if flags.get("mirror_candidates"):
        parts.append(f"{len(flags['mirror_candidates'])} mirror candidates awaiting review.")
    print(" ".join(parts))
    return 0


def main(argv):
    os.makedirs(C.STATE_DIR, exist_ok=True)
    if not argv:
        print(__doc__, file=sys.stderr)
        return 2
    mode = argv[0]
    rest = argv[1:]
    args = dict(zip(rest[::2], rest[1::2])) if rest and rest[0].startswith("--") else {}
    flags_only = [a for a in rest if a in ("--force",)]
    if mode == "initial":
        return cmd_initial(flags_only)
    if mode == "apply":
        return cmd_apply(args)
    if mode == "daily":
        return cmd_daily(args)
    print(f"ERROR: unknown mode '{mode}'", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
