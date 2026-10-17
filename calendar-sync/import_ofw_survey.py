#!/usr/bin/env python3
"""Import the Sep 25, 2026 OFW read-only survey into the staged-report format.

BACKGROUND: OFW exposes NO native stable event IDs (verified by the Brief A
survey: detail dialogs and tile HTML contain none). The reconciler's original
gate demanded native ofw_key stability, which can never be satisfied.

COMPOSITE-KEY STRATEGY (CEO-authorized adaptation, Sep 25 2026):
  ofw_key is DERIVED, not native:
      ofw_key = "CK-" + sha1(normalized_title | start_iso | end_iso | parent)[:16]
  Stable as long as title/start/end/parent don't change — which is exactly the
  equality the reconciler needs. Snapshots and id_map continue to key on
  ofw_key unchanged; only the provenance changed (documented here and in
  reconcile.py's validate_report_keys docstring).

USAGE:
  python3 import_ofw_survey.py   # writes state/ofw_survey_report_<brief_id>.json

The raw survey (from the Cowork Brief A browser report, 2026-09-25 17:55 UTC)
is embedded below as RAW_ENTRIES. Entries whose exact fields were NOT
retained by the survey are listed in PARTIAL_INVENTORY (documented, never
matched — re-survey required before they can join the pair set). Transition
tiles that open no dialog are listed in UNREADABLE_TILES.
"""

import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C

NOW_UTC = datetime.now(timezone.utc)
BRIEF_ID = "ofw_read_20250925T175500"   # survey completed 2026-09-25 17:55 UTC
MONTHS_SURVEYED = ["2026-10", "2026-11", "2026-12", "2027-01"]


def composite_key(title, start, end, parent):
    norm = re.sub(r"\s+", " ", (title or "").strip().lower())
    blob = "|".join([norm, start or "", end or "", (parent or "").strip().lower()])
    return "CK-" + hashlib.sha1(blob.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Transcribed verbatim from the Brief A survey report. Times America/Denver.
# entry_type: "ofw_native" | "mirror" | "mirror_duplicate"
# ---------------------------------------------------------------------------
RAW_ENTRIES = [
    # ---------------- OCTOBER 2026 ----------------
    dict(title="Rebecca Parent Time Fall Break Part 2",
         start="2026-10-12T19:00:00-06:00", end="2026-10-13T20:30:00-06:00",
         all_day=False, parent="Rebecca", privacy="unknown",
         entry_type="ofw_native", reminder="None",
         children=["Alex Stay", "Emily Stay", "Juliet Stay"],
         notes="Per decree/modification order holiday schedule; synced from "
               "the verified shared Google Calendar (Sep 25, 2026)."),
    dict(title="orthodontist Emily and Juliet",
         start="2026-10-12T15:30:00-06:00", end="2026-10-12T16:00:00-06:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", location="simister white done", notes=""),
    # ---------------- NOVEMBER 2026 ----------------
    dict(title="Thanksgiving Holiday Jesse Parent Time",
         start="2026-11-25T19:00:00-07:00", end="2026-11-29T19:00:00-07:00",
         all_day=False, parent="Jesse", privacy="Public",
         entry_type="ofw_native", reminder="None",
         children=["Alex Stay", "Emily Stay", "Juliet Stay"],
         notes="Per decree/modification order holiday schedule; synced from "
               "the verified shared Google Calendar (Sep 25, 2026)."),
    dict(title="Thanksgiving Google-mirror duplicate",
         start="2026-11-25T19:00:00-07:00", end="2026-11-29T19:00:00-07:00",
         all_day=False, parent="Jesse", privacy="Private",
         entry_type="mirror_duplicate", notes="",
         title_uncertain=True,
         note="Exact OFW title not retained by survey; pre-existing duplicate "
              "of the native Thanksgiving entry. CEO decision needed "
              "(likely delete the duplicate)."),
    # ---------------- DECEMBER 2026 ----------------
    dict(title="Christmas Holiday - Jesse Parent Time",
         start="2026-12-26T19:00:00-07:00", end="2027-01-04T19:00:00-07:00",
         all_day=False, parent="Jesse", privacy="Public",
         entry_type="ofw_native", reminder="None",
         children=["Alex Stay", "Emily Stay", "Juliet Stay"],
         notes="Per parent agreement (Rebecca approved, per Jesse Sep 25, 2026); "
               "synced from the verified shared Google Calendar."),
    dict(title="Juliet School Ends",
         start="2026-12-28T14:00:00-07:00", end="2026-12-28T14:30:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    # ---------------- JANUARY 2027 ----------------
    dict(title="Juliet school ends",
         start="2027-01-01T11:20:00-07:00", end="2027-01-01T11:50:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Alex school ends (lunch)",
         start="2027-01-01T11:20:00-07:00", end="2027-01-01T11:50:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Emily school ends (lunch)",
         start="2027-01-01T12:25:00-07:00", end="2027-01-01T12:55:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Emily Scouts",
         start="2027-01-01T15:00:00-07:00", end="2027-01-01T16:15:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Juliet School start",
         start="2027-01-04T07:45:00-07:00", end="2027-01-04T08:15:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Juliet School Ends",
         start="2027-01-04T14:00:00-07:00", end="2027-01-04T14:30:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Alex School Ends",
         start="2027-01-04T14:10:00-07:00", end="2027-01-04T14:40:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Emily School ends",
         start="2027-01-04T14:40:00-07:00", end="2027-01-04T15:10:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Pick up Alex from robotics",
         start="2027-01-04T17:00:00-07:00", end="2027-01-04T17:30:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Emily Scouts",
         start="2027-01-08T15:00:00-07:00", end="2027-01-08T16:15:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Jesse Weekly Parent Time",
         start="2027-01-11T15:00:00-07:00", end="2027-01-11T20:30:00-07:00",
         all_day=False, parent="Jesse", privacy="Public",
         entry_type="ofw_native", reminder="None", recurrence="Yes",
         children=["Alex Stay", "Emily Stay", "Juliet Stay"], notes=""),
    dict(title="Juliet School Ends",
         start="2027-01-11T14:00:00-07:00", end="2027-01-11T14:30:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Alex School Ends",
         start="2027-01-11T14:10:00-07:00", end="2027-01-11T14:40:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Emily School ends",
         start="2027-01-11T14:40:00-07:00", end="2027-01-11T15:10:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Pick up Alex from robotics",
         start="2027-01-11T17:00:00-07:00", end="2027-01-11T17:30:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Juliet school ends",
         start="2027-01-15T11:20:00-07:00", end="2027-01-15T11:50:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Alex school ends (lunch)",
         start="2027-01-15T11:20:00-07:00", end="2027-01-15T11:50:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Emily school ends (lunch)",
         start="2027-01-15T12:25:00-07:00", end="2027-01-15T12:55:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Emily Scouts",
         start="2027-01-15T15:00:00-07:00", end="2027-01-15T16:15:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Jesse Parent Time - Weekend",
         start="2027-01-15T15:00:00-07:00", end="2027-01-18T20:30:00-07:00",
         all_day=False, parent="Jesse", privacy="Private",
         entry_type="mirror",
         notes="Regular alternating-weekend parent time per Decree of Divorce "
               "4 (Nov 2, 2018) and Order Modifying D... [truncated in survey]"),
    dict(title="MLK Jr. Holiday - Jesse Parent Time",
         start="2027-01-18", end="2027-01-19",
         all_day=True, parent="Jesse", privacy="Public",
         entry_type="ofw_native", partial_fields=True,
         note="Full dialog fields not retained by survey; all-day Jan 18 confirmed."),
    dict(title="MLK Jr. Holiday - Jesse Parent Time - 6pm Friday before to 7pm "
               "end of School holiday",
         start="2027-01-18T00:00:00-07:00", end="2027-01-18T23:59:00-07:00",
         all_day=True, parent="Jesse", privacy="Private",
         entry_type="mirror",
         notes="Martin Luther King, Jr. beginning 6 p.m. on Friday until Monday "
               "at 7 p.m. unless the holiday extends for a lengthier period of "
               "time to which the noncustodial parent is completely entitled;"),
    dict(title="Juliet School start",
         start="2027-01-18T07:45:00-07:00", end="2027-01-18T08:15:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Juliet School Ends",
         start="2027-01-18T14:00:00-07:00", end="2027-01-18T14:30:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Alex School Ends",
         start="2027-01-18T14:10:00-07:00", end="2027-01-18T14:40:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Emily School ends",
         start="2027-01-18T14:40:00-07:00", end="2027-01-18T15:10:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Pick up Alex from robotics",
         start="2027-01-18T17:00:00-07:00", end="2027-01-18T17:30:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Emily Scouts",
         start="2027-01-22T15:00:00-07:00", end="2027-01-22T16:15:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Jesse Weekly Parent Time",
         start="2027-01-25T15:00:00-07:00", end="2027-01-25T20:30:00-07:00",
         all_day=False, parent="Jesse", privacy="Public",
         entry_type="ofw_native", reminder="None", recurrence="Yes",
         children=["Alex Stay", "Emily Stay", "Juliet Stay"], notes=""),
    dict(title="Juliet School Ends",
         start="2027-01-25T14:00:00-07:00", end="2027-01-25T14:30:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Alex School Ends",
         start="2027-01-25T14:10:00-07:00", end="2027-01-25T14:40:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Emily School ends",
         start="2027-01-25T14:40:00-07:00", end="2027-01-25T15:10:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Pick up Alex from robotics",
         start="2027-01-25T17:00:00-07:00", end="2027-01-25T17:30:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Juliet school ends",
         start="2027-01-29T11:20:00-07:00", end="2027-01-29T11:50:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Alex school ends (lunch)",
         start="2027-01-29T11:20:00-07:00", end="2027-01-29T11:50:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Emily school ends (lunch)",
         start="2027-01-29T12:25:00-07:00", end="2027-01-29T12:55:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes=""),
    dict(title="Emily Scouts",
         start="2027-01-29T15:00:00-07:00", end="2027-01-29T16:15:00-07:00",
         all_day=False, parent=None, privacy="Private",
         entry_type="mirror", notes="",
         location="2683 3070 E St, St. George, UT 84790"),
    dict(title="Jesse Parent Time - Weekend",
         start="2027-01-29T15:00:00-07:00", end="2027-02-01T20:30:00-07:00",
         all_day=False, parent="Jesse", privacy="Private",
         entry_type="mirror",
         notes="Regular alternating-weekend parent time per Decree of Divorce "
               "4 (Nov 2, 2018) and Order Modifying D... [truncated in survey]"),
]

# Observed in OFW but exact fields NOT retained -> documented, never matched.
PARTIAL_INVENTORY = [
    dict(title="Christmas tile (Google-mirror duplicate)",
         note="Dec 26, 2026 7:00 PM tile; full fields not retained. Likely "
              "pre-existing duplicate of the native Christmas entry. "
              "CEO decision needed."),
    dict(title="Christmas event Dec 27 - Jan 6",
         note="Third Christmas event, Dec 27 2026 - Jan 6 2027; full fields not "
              "retained. Likely the pre-agreement Christmas entry. CEO decision "
              "needed (delete or correct)."),
    dict(title="Family Reunion",
         start="2026-12-28", end="2027-01-02", all_day=True,
         note="All-day Dec 28 2026 - Jan 1 2027; location 'Orlando FL' per "
              "prior work. Not sync scope."),
    dict(title="Weekend event",
         start="2026-12-04T15:00:00-07:00", end="2026-12-07T20:30:00-07:00",
         note="Dec 4-7 weekend parent-time block; weekend blocks excluded "
              "from sync scope pending Jesse's authorization."),
    dict(title="Dec 30/31 hidden '+1 more' tiles",
         note="Popover-expanded only; Christmas continuation tiles of "
              "already-recorded events."),
]

# Clickable-looking tiles that open no detail dialog (no href / stable id).
UNREADABLE_TILES = [
    "Oct 9, 2026 3 PM Transition", "Dec 4, 2026 Transition",
    "Jan 1, 2027 3 PM Transition", "Jan 4, 2027 8:30 PM Transition",
    "Jan 15, 2027 3 PM Transition", "Jan 18, 2027 8:30 PM Transition",
    "Jan 29, 2027 3 PM Transition",
]


def build_report():
    entries = []
    seen = {}
    for raw in RAW_ENTRIES:
        e = dict(raw)
        e["ofw_key"] = composite_key(e["title"], e["start"], e["end"],
                                     e.get("parent"))
        e["key_derivation"] = ("composite: sha1(normalized_title|start|end|"
                               "parent) — OFW exposes no native event IDs")
        if e["ofw_key"] in seen:
            raise SystemExit(f"DUPLICATE composite key for {e['title']}")
        seen[e["ofw_key"]] = e["title"]
        entries.append(e)
    return {
        "brief_id": BRIEF_ID,
        "issued_at": NOW_UTC.isoformat(timespec="seconds"),
        "direction": "ofw_to_google",
        "months_surveyed": MONTHS_SURVEYED,
        "key_strategy": ("composite — OFW exposes no native stable event IDs; "
                         "ofw_key is derived as sha1(normalized_title|start|"
                         "end|parent), stable while those fields are unchanged"),
        "entries": entries,
        "partial_inventory": PARTIAL_INVENTORY,
        "unreadable_tiles": UNREADABLE_TILES,
        "survey_notes": (
            "Read-only survey of OurFamilyWizard.com as Jesse Stay, month view, "
            "America/Denver, 2026-09-25. January 2027 fully surveyed; December "
            "2026 substantially surveyed; October/November inventory complete "
            "with key parent-time fields preserved. No login wall, CAPTCHA, or "
            "session expiry. Nothing created, edited, or deleted."),
    }


def main():
    report = build_report()
    dest = os.path.join(C.STATE_DIR,
                        f"ofw_survey_report_{BRIEF_ID}.json")
    tmp = dest + ".tmp"
    with open(tmp, "w") as f:
        json.dump(report, f, indent=2)
    os.replace(tmp, dest)
    print(f"STAGED: {len(report['entries'])} entries "
          f"({len(set(e['ofw_key'] for e in report['entries']))} unique "
          f"composite keys) -> {dest}")
    print(f"  partial_inventory: {len(PARTIAL_INVENTORY)} items "
          f"(documented, not matched)")
    print(f"  unreadable_tiles: {len(UNREADABLE_TILES)}")


if __name__ == "__main__":
    sys.exit(main())
