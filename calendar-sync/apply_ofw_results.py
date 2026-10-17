#!/usr/bin/env python3
"""Calendar Sync App — apply the CEO/browser OFW write-leg handoff.

Usage:
  python3 apply_ofw_results.py --file <handoff.json>
  python3 apply_ofw_results.py --brief-id <brief_id>   # re-apply a staged handoff

The handoff follows ARCHITECTURE.md section 5 (ofw_result):
  {"brief_id": ..., "completed_at": ...,
   "results": [{"sync_key": ..., "op": ..., "status": "ok|already_exists|failed|not_found",
                "ofw_key": ..., "evidence": ...}, ...]}

Behavior:
  - ok / already_exists  -> write/update id_map entry {google_event_id, ofw_key}.
  - failed               -> leave state untouched (at-least-once: the poller
                            regenerates the spec because the watermark hasn't moved).
  - not_found on update  -> leave state; the next poll re-emits as create.
  - not_found on delete  -> remove the stale id_map entry (tombstone it).
  - ok on delete          -> remove id_map entry (tombstone), append to
                            deletions.log. DELETES ARE NEVER AUTO-APPLIED:
                            the handoff itself is the CEO's verification that
                            the browser actually deleted the entry. A delete
                            result without evidence is treated as failed.
  - watermark_google.json advances only to the newest event timestamp among
    fully-applied specs (ok / already_exists / verified delete). Partial
    success -> watermark advances to the highest contiguous acknowledged
    timestamp; the rest stay queued.

Writes an applied record to applied/applied_<brief_id>.json.
"""

import json
import os
import sys
from datetime import datetime, timezone

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


def append_deletion(record):
    os.makedirs(os.path.dirname(C.DELETIONS_LOG), exist_ok=True)
    record = dict(record)
    record.setdefault("ts", utc_now_iso())
    with open(C.DELETIONS_LOG, "a") as f:
        f.write(json.dumps(record) + "\n")


def find_handoff(brief_id):
    for d in (C.APPLIED_DIR, C.OUTBOUND_DIR, C.STATE_DIR):
        if not os.path.isdir(d):
            continue
        for fn in os.listdir(d):
            if brief_id in fn and fn.endswith(".json"):
                return os.path.join(d, fn)
    return None


def spec_lookup():
    """Map sync_key -> spec across all outbound batches."""
    lookup = {}
    if os.path.isdir(C.OUTBOUND_DIR):
        for fn in sorted(os.listdir(C.OUTBOUND_DIR)):
            if fn.startswith("ofw_task_") and fn.endswith(".json"):
                b = load_json(os.path.join(C.OUTBOUND_DIR, fn), {})
                for s in b.get("specs", []):
                    lookup[s["sync_key"]] = s
    return lookup


def main(argv):
    args = dict(zip(argv[::2], argv[1::2]))
    path = args.get("--file")
    if not path and args.get("--brief-id"):
        path = find_handoff(args["--brief-id"])
    if not path or not os.path.isfile(path):
        print("ERROR: provide --file <handoff.json> or --brief-id <id>", file=sys.stderr)
        return 2

    handoff = load_json(path, None)
    if not isinstance(handoff, dict) or not isinstance(handoff.get("results"), list):
        print("ERROR: handoff is not a valid ofw_result object.", file=sys.stderr)
        return 2

    brief_id = handoff.get("brief_id", "unknown")
    specs = spec_lookup()
    id_map = load_json(C.ID_MAP, {"map": {}, "tombstones": {}})
    id_entries = id_map.setdefault("map", {})
    tombstones = id_map.setdefault("tombstones", {})

    applied, failed, skipped = [], [], []
    newest_acked_updated = None

    for r in handoff["results"]:
        skey = r.get("sync_key")
        op = r.get("op")
        status = r.get("status")
        ofw_key = r.get("ofw_key")
        evidence = (r.get("evidence") or "").strip()
        spec = specs.get(skey, {})
        gid = r.get("google_event_id") or spec.get("google_event_id")

        if status in ("ok", "already_exists"):
            if op == "ofw_delete":
                if not evidence:
                    failed.append({"sync_key": skey, "reason":
                                   "delete result without evidence — not applied"})
                    continue
                # Verified delete: tombstone the map entry.
                if gid and gid in id_entries:
                    tombstones[gid] = {
                        "ofw_key": id_entries[gid].get("ofw_key"),
                        "title": id_entries[gid].get("title", ""),
                        "deleted_at": utc_now_iso(),
                        "direction": "google_to_ofw",
                    }
                    del id_entries[gid]
                append_deletion({
                    "direction": "google_to_ofw",
                    "google_event_id": gid,
                    "ofw_key": ofw_key,
                    "title": spec.get("title", ""),
                    "reason": "CEO-verified browser delete",
                    "flagged_to_ceo": True,
                })
                applied.append({"sync_key": skey, "op": op, "status": status})
            else:
                if not gid or not ofw_key:
                    failed.append({"sync_key": skey, "reason":
                                   "ok result missing google_event_id or ofw_key"})
                    continue
                id_entries[gid] = {
                    "ofw_key": ofw_key,
                    "title": spec.get("title", r.get("title", "")),
                    "matched_via": "browser_write_leg",
                    "created_at": utc_now_iso(),
                    "sync_key": skey,
                }
                applied.append({"sync_key": skey, "op": op, "status": status})
        elif status == "not_found" and op == "ofw_delete":
            # Stale map entry: the OFW side never had it. Tombstone quietly.
            if gid and gid in id_entries:
                tombstones[gid] = {
                    "ofw_key": id_entries[gid].get("ofw_key"),
                    "title": id_entries[gid].get("title", ""),
                    "deleted_at": utc_now_iso(),
                    "direction": "google_to_ofw",
                    "note": "not_found in browser; stale map entry removed",
                }
                del id_entries[gid]
            applied.append({"sync_key": skey, "op": op, "status": status})
        elif status == "not_found":
            # Update target missing -> next poll re-emits as create. No state change.
            skipped.append({"sync_key": skey, "op": op, "status": status,
                            "note": "will be re-emitted as create on next poll"})
        else:  # failed or unknown
            failed.append({"sync_key": skey, "op": op, "status": status,
                           "reason": r.get("reason", "browser reported failure")})

    # Watermark advance: only past fully-applied specs. We advance to "now"
    # conservatively ONLY if every result was applied or benignly skipped;
    # otherwise we do not advance (at-least-once: poller regenerates).
    watermark = load_json(C.WATERMARK_GOOGLE, {})
    if not failed:
        watermark["last_sync"] = utc_now_iso()
        watermark["advanced_by"] = f"apply_ofw_results:{brief_id}"
        save_json(C.WATERMARK_GOOGLE, watermark)
        wm_note = f"watermark_google advanced to {watermark['last_sync']}"
    else:
        wm_note = (f"watermark NOT advanced ({len(failed)} failed) — "
                   f"poller will regenerate those specs")

    save_json(C.ID_MAP, id_map)

    record = {
        "brief_id": brief_id,
        "applied_at": utc_now_iso(),
        "applied": applied,
        "failed": failed,
        "skipped_reemit": skipped,
        "watermark_note": wm_note,
    }
    os.makedirs(C.APPLIED_DIR, exist_ok=True)
    save_json(os.path.join(C.APPLIED_DIR, f"applied_{brief_id}.json"), record)

    # Clear the deletion_pending flags that were just verified.
    if applied:
        flags = load_json(C.FLAGS, {})
        verified_ids = {a.get("sync_key", "") for a in applied}
        flags["deletion_pending"] = [
            d for d in flags.get("deletion_pending", [])
            if not any(v in json.dumps(d) for v in verified_ids)
        ]
        save_json(C.FLAGS, flags)

    print(f"APPLIED {brief_id}: {len(applied)} applied, {len(skipped)} re-queued, "
          f"{len(failed)} failed. {wm_note}")
    for f in failed:
        print(f"  FAILED: {f['sync_key']}: {f.get('reason')}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
