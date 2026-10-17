"""Calendar Sync App — shared configuration.

Bidirectional sync between the Google Calendar
"Jesse and Rebecca Parent Time and Kids Schedule"
and the shared OurFamilyWizard (OFW) calendar.

CEO-confirmed decisions encoded here:
  1. SCOPE: parent-time/holiday blocks + already-marked events only.
     Routine school/Scouts/robotics recurring series are NEVER synced.
     The sibling calendar "Parent Time (Court Order) - NOT synced to OFW"
     is never touched (we only ever query the one calendarId below).
     Weekend blocks stay excluded until Jesse authorizes expansion.
  2. CONFLICT PRECEDENCE: OFW-wins for sync-marked events,
     Google-wins for unmarked events. Both-sides-changed always goes to
     conflicts.json for human resolution — never guessed.
  3. NOTIFICATION BATCHING: at most one OFW browser write session per day.
  4. DELETIONS: logged + flagged to Jesse via the CEO. The sync never
     auto-deletes OFW entries.
"""

import os
import re

# ---------------------------------------------------------------- Google leg
GOOGLE_ACCOUNT_ID = "a2f3d29a56da4c1694eeb0d4eaee1dd9"  # jessestay@gmail.com
GOOGLE_CALENDAR_ID = "gv02prguf93osbqcr7tedrq6is@group.calendar.google.com"
GOOGLE_CALENDAR_NAME = "Jesse and Rebecca Parent Time and Kids Schedule"
TIMEZONE = "America/Denver"

# Sibling calendar that must NEVER be touched (name says it all; we never
# query it, but the id is recorded here as a guard).
FORBIDDEN_CALENDAR_ID = (
    "ec19af785149ebfeceab2e31449cdb15be88002e8df54b8e73ad3fbacaba281e"
    "@group.calendar.google.com"
)
FORBIDDEN_CALENDAR_NAME = "Parent Time (Court Order) - NOT synced to OFW"

# ------------------------------------------------------------------ Markers
# OFW-side notes marker (established by the Sep 25, 2026 write work; the 17
# entries carry this). The sync owns ONLY OFW entries containing this token.
OFW_NOTES_SYNC_TOKEN = "MACF-SYNC: ofw-event"
OFW_NOTES_GOOGLE_ID_RE = re.compile(r"google-event-id:\s*(\S+)")
OFW_NOTES_TOKEN_RE = re.compile(r"MACF-SYNC:\s*ofw-event")

# Google-side marker for OFW-originated mirrors. KEEP AND EXTEND the existing
# convention (do not invent a second one):
#   [Synced from OurFamilyWizard — do not edit here; edit in OFW]
#   ofwKey:<ofw-event-id>|<iso-start>|<iso-end> (OFW event id <ofw-event-id>)
# The parenthesised OFW event id is the authoritative join key.
GOOGLE_OFW_BANNER = "[Synced from OurFamilyWizard \u2014 do not edit here; edit in OFW]"
GOOGLE_OFW_BANNER_RE = re.compile(r"\[Synced from OurFamilyWizard")
GOOGLE_OFW_KEY_RE = re.compile(r"ofwKey:([^\s|]+)")
GOOGLE_OFW_ID_RE = re.compile(r"\(OFW event id ([^)]+)\)")


def google_ofw_marker(ofw_event_id: str, start_iso: str, end_iso: str) -> str:
    """Canonical Google-side marker block for an OFW-originated mirror."""
    return (
        f"{GOOGLE_OFW_BANNER} "
        f"ofwKey:{ofw_event_id}|{start_iso}|{end_iso} "
        f"(OFW event id {ofw_event_id})"
    )


def parse_google_ofw_marker(description: str):
    """Return the authoritative OFW event id from a Google description, or None."""
    if not description:
        return None
    m = GOOGLE_OFW_ID_RE.search(description)
    if m:
        return m.group(1).strip()
    m = GOOGLE_OFW_KEY_RE.search(description)
    return m.group(1).strip() if m else None


def parse_ofw_notes(notes: str):
    """Return (is_sync_owned, google_event_id_or_None) for OFW notes text."""
    if not notes:
        return False, None
    owned = bool(OFW_NOTES_TOKEN_RE.search(notes))
    m = OFW_NOTES_GOOGLE_ID_RE.search(notes)
    return owned, (m.group(1).strip() if m else None)


# -------------------------------------------------------------------- Scope
# A Google event is in sync scope iff:
#   - it carries the OFW-origin banner (already-marked), OR
#   - its title matches the parent-time/holiday pattern AND is not a weekend
#     block AND is not a frequent routine series (school/Scouts/robotics).
# Recurring instances are NOT blanket-excluded: the holiday/birthday blocks
# live on the Google calendar as yearly recurring series, and those
# recurrences are exactly what the sync pairs with OFW one-offs
# (fixed Sep 25, 2026 — the old blanket exclusion silently dropped
# Christmas/Thanksgiving/MLK/birthdays from the pair set).
SCOPE_INCLUDE_RE = re.compile(
    r"parent\s*time|fall break|spring break|columbus|veteran'?s?\s*day|"
    r"thanksgiving|christmas|halloween|\bmlk\b|martin luther|presidents?\s*day|"
    r"birthday|holiday",
    re.IGNORECASE,
)
# Frequent routine series: never synced, recurring or not. The negative
# lookahead exempts the phrase "school holiday" (as in "end of School
# holiday" on the MLK parent-time block) — that is a holiday, not a series.
SCOPE_ROUTINE_EXCLUDE_RE = re.compile(
    r"\bschool\b(?!\s+holiday)|scouts?|robotics", re.IGNORECASE)
# Weekend blocks stay excluded until Jesse authorizes broader sync
# (the OFW "Weekend Parent Time" schedule already covers them).
SCOPE_WEEKEND_EXCLUDE_RE = re.compile(r"\bweekend\b", re.IGNORECASE)
# Recurring-instance ids look like <seriesId>_20261002T210000Z
RECURRING_INSTANCE_ID_RE = re.compile(r"_20\d{6}T\d{6}Z?$")


def is_recurring_instance(event: dict) -> bool:
    if event.get("recurringEventId"):
        return True
    return bool(RECURRING_INSTANCE_ID_RE.search(event.get("id", "")))


def google_event_in_scope(event: dict) -> bool:
    """True iff this Google event is eligible for syncing to OFW."""
    if parse_google_ofw_marker(event.get("description", "")):
        return True  # already-marked OFW-originated mirrors stay in scope
    title = event.get("summary", "") or ""
    if SCOPE_WEEKEND_EXCLUDE_RE.search(title):
        return False  # weekend blocks excluded pending Jesse's authorization
    if not SCOPE_INCLUDE_RE.search(title):
        return False
    # Frequent routine series are never synced, recurring or not. Yearly
    # holiday/parent-time recurrences (Christmas, Thanksgiving, birthdays…)
    # stay in scope: they are the pair set.
    if SCOPE_ROUTINE_EXCLUDE_RE.search(title):
        return False
    return True


def parent_from_title(title: str):
    """Parse 'Jesse' / 'Rebecca' parent attribution from a title, else None."""
    t = (title or "").lower()
    # "Rebecca Parent Time - ..." / "... - Rebecca Parent Time" / "Rebecca's ..."
    if re.search(r"\brebecca\b", t):
        return "Rebecca"
    if re.search(r"\bjesse\b", t):
        return "Jesse"
    return None


# ------------------------------------------------------------- State paths
WORKSPACE_ROOT = os.path.expanduser("~/workspace/macf")
SYNC_DIR = os.path.join(WORKSPACE_ROOT, "calendar-sync")
# Overridable for dry-run testing: CALENDAR_SYNC_STATE_DIR
STATE_DIR = os.environ.get(
    "CALENDAR_SYNC_STATE_DIR",
    os.path.join(WORKSPACE_ROOT, "hidden_files", "calendar-sync"),
)
OUTBOUND_DIR = os.path.join(SYNC_DIR, "outbound")
APPLIED_DIR = os.path.join(SYNC_DIR, "applied")

WATERMARK_GOOGLE = os.path.join(STATE_DIR, "watermark_google.json")
WATERMARK_OFW = os.path.join(STATE_DIR, "watermark_ofw.json")
ID_MAP = os.path.join(STATE_DIR, "id_map.json")
CONFLICTS = os.path.join(STATE_DIR, "conflicts.json")
DELETIONS_LOG = os.path.join(STATE_DIR, "deletions.log")
FLAGS = os.path.join(STATE_DIR, "flags.json")
LAST_OFW_WRITE_BATCH = os.path.join(STATE_DIR, "last_ofw_write_batch.json")
OFW_SURVEY_PENDING = os.path.join(STATE_DIR, "ofw_survey_pending.json")
OFW_SURVEY_REPORT_PREFIX = os.path.join(STATE_DIR, "ofw_survey_report_")

# ------------------------------------------------------------- Misc tuning
MATCH_THRESHOLD = 0.80          # initial-reconciliation match score to accept
MATCH_TIE_DELTA = 0.05          # within this of the best score -> human review
TIME_TOLERANCE_MIN = 5          # start/end equality tolerance for matching
TOMBSTONE_DAYS = 90             # how long deleted id_map entries are kept
OFW_WRITE_BATCHES_PER_DAY = 1   # notification-batching: max one browser
                                # write session per day
