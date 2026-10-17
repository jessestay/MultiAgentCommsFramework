#!/usr/bin/env python3
"""DM Concierge — Instagram DM watcher (narrow poll).

Contract (stdout is always a single JSON object):
  - No Instagram accounts connected for messaging:
      {"status":"awaiting_connection","detail":"..."}            (exit 0)
  - Otherwise:
      {"status":"ok","new_messages":[...]}                      (exit 0)

Each new_message:
  {"platform":"instagram","account":"<username>","thread_fbid":"<id>",
   "sender":"<display/username>","message_text":"<text>","sent_at":"<iso>"}

Safety rules (instagram_messages skill):
  - Narrow reads only: inbox + pending folders, --first 15, --message-count 1.
  - No bulk export/dump of message history. Never sends. Never reacts.
  - FBIDs appear only inside the JSON tool payload (needed downstream);
    never in human-readable logs (stderr carries usernames/folders only).
"""

import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

STATE_DIR = os.path.expanduser("~/workspace/macf/hidden_files/dm-concierge")
WATERMARK_PATH = os.path.join(STATE_DIR, "watermark.json")
FOLDERS = ("inbox", "pending")
FIRST = 15
MESSAGE_COUNT = 1
CLI_TIMEOUT = 60


def run_cli(args):
    """Run instagram-messages-cli; returns (parsed_json, error_str)."""
    try:
        proc = subprocess.run(
            ["instagram-messages-cli"] + args,
            capture_output=True, text=True, timeout=CLI_TIMEOUT,
        )
    except Exception as exc:  # binary missing, timeout, etc.
        return None, "cli failed: %s" % type(exc).__name__
    out = (proc.stdout or "").strip()
    if not out:
        return None, "empty CLI output (exit %d)" % proc.returncode
    if out.startswith("Error"):
        return None, out[:200]
    try:
        return json.loads(out), None
    except json.JSONDecodeError:
        return None, "non-json output: %s" % out[:120]


def load_watermark():
    try:
        with open(WATERMARK_PATH) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_watermark(watermark):
    os.makedirs(STATE_DIR, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=STATE_DIR, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(watermark, f, indent=2)
            f.write("\n")
        os.replace(tmp, WATERMARK_PATH)
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def as_iso(ts):
    """Normalize a timestamp field to a comparable ISO-8601 string, or None.

    Handles the CLI's semantic forms: {"utc": ..., "user_local": ...} dicts,
    ISO strings, and epoch seconds/milliseconds.
    """
    if ts is None:
        return None
    if isinstance(ts, dict):
        for key in ("utc", "iso", "iso8601", "user_local", "local"):
            val = ts.get(key)
            if val:
                return str(val)
        return None
    if isinstance(ts, bool):
        return None
    if isinstance(ts, (int, float)):
        val = float(ts)
        if val > 1e12:  # millis
            val /= 1000.0
        return datetime.fromtimestamp(val, tz=timezone.utc).isoformat()
    if isinstance(ts, str):
        s = ts.strip()
        if not s:
            return None
        if s.replace(".", "", 1).isdigit():
            return as_iso(float(s))
        return s
    return None


def get_threads(payload):
    if isinstance(payload, dict):
        for key in ("threads", "inbox_threads", "items", "results"):
            val = payload.get(key)
            if isinstance(val, list):
                return [t for t in val if isinstance(t, dict)]
    if isinstance(payload, list):
        return [t for t in payload if isinstance(t, dict)]
    return []


def get_thread_fbid(thread):
    for key in ("thread_fbid", "thread_id", "id", "fbid"):
        val = thread.get(key)
        if val:
            return str(val)
    return None


def get_thread_messages(thread):
    """Preview messages attached to a thread (respects --message-count 1)."""
    for key in ("messages", "recent_messages", "message_preview", "preview_messages"):
        val = thread.get(key)
        if isinstance(val, dict):
            return [val]
        if isinstance(val, list):
            return [m for m in val if isinstance(m, dict)]
    last = thread.get("last_message")
    if isinstance(last, dict):
        return [last]
    return []


def get_message_text(msg):
    for key in ("text", "message_text", "body", "snippet", "preview_text", "content"):
        val = msg.get(key)
        if isinstance(val, str) and val.strip():
            return val
    return None


def get_sender(msg):
    """Return (display_name_or_username, user_fbid_or_None)."""
    name = None
    fbid = None
    sender = msg.get("sender")
    if isinstance(sender, dict):
        for key in ("display_name", "full_name", "name", "username", "handle"):
            if sender.get(key):
                name = str(sender[key])
                break
        for key in ("user_fbid", "fbid", "id"):
            if sender.get(key):
                fbid = str(sender[key])
                break
    for key in ("sender_username", "from_username", "author_username", "username"):
        if msg.get(key):
            name = name or str(msg[key])
            break
    for key in ("sender_user_fbid", "sender_fbid", "from_user_fbid", "author_fbid"):
        if msg.get(key):
            fbid = fbid or str(msg[key])
            break
    return name, fbid


def is_own_message(msg, account_fbid, account_username):
    for key in ("is_own", "is_me", "from_me", "own"):
        if msg.get(key) is True:
            return True
    name, fbid = get_sender(msg)
    if fbid and account_fbid and fbid == account_fbid:
        return True
    if name and account_username and name.lower() == account_username.lower():
        return True
    return False


def get_message_ts(msg):
    for key in ("message_sent_at", "sent_at", "created_at", "timestamp", "time"):
        iso = as_iso(msg.get(key))
        if iso:
            return iso
    return None


def poll_account(account):
    """Poll inbox + pending for one connected account.

    Returns (new_messages, newest_seen) where newest_seen maps
    "<username>:<folder>" -> latest seen message timestamp.
    """
    username = account.get("username") or "unknown"
    account_fbid = str(account.get("user_fbid") or "")
    new_messages = []
    newest_seen = {}
    seen = set()

    for folder in FOLDERS:
        payload, err = run_cli([
            "inbox", "--account-id", account_fbid,
            "--folder", folder, "--first", str(FIRST),
            "--message-count", str(MESSAGE_COUNT),
        ])
        if err:
            print("ig poll: %s/%s skipped (%s)" % (username, folder, err),
                  file=sys.stderr)
            continue
        key = "%s:%s" % (username, folder)
        watermark_ts = watermark.get(key) or ""
        newest = watermark_ts
        for thread in get_threads(payload):
            thread_fbid = get_thread_fbid(thread) or ""
            for msg in get_thread_messages(thread):
                ts = get_message_ts(msg)
                if ts is None:
                    continue  # cannot order it; skip emission and watermark
                if ts > newest:
                    newest = ts
                if is_own_message(msg, account_fbid, username):
                    continue  # Jesse's own sent messages are never emitted
                if ts <= watermark_ts:
                    continue  # already seen
                text = get_message_text(msg)
                if not text:
                    continue
                name, _ = get_sender(msg)
                dedupe = (thread_fbid, ts, text)
                if dedupe in seen:
                    continue
                seen.add(dedupe)
                new_messages.append({
                    "platform": "instagram",
                    "account": username,
                    "thread_fbid": thread_fbid,
                    "sender": name or "unknown",
                    "message_text": text,
                    "sent_at": ts,
                })
        newest_seen[key] = newest
    return new_messages, newest_seen


def emit(obj):
    print(json.dumps(obj, ensure_ascii=False))
    sys.stdout.flush()


if __name__ == "__main__":
    accounts_payload, err = run_cli(["accounts"])
    if err:
        # Cannot even list accounts: stay quiet, report awaiting connection.
        emit({"status": "awaiting_connection",
              "detail": "Instagram messaging accounts could not be listed."})
        sys.exit(0)

    accounts = (accounts_payload or {}).get("accounts") or []
    connected = [a for a in accounts if a.get("connected") is True]

    if not connected:
        emit({"status": "awaiting_connection",
              "detail": "No Instagram accounts are connected for messaging; "
                        "DM polling is paused until an account is linked."})
        sys.exit(0)

    watermark = load_watermark()
    all_new = []
    for account in connected:
        new_messages, newest_seen = poll_account(account)
        all_new.extend(new_messages)
        for key, ts in newest_seen.items():
            if ts and ts > (watermark.get(key) or ""):
                watermark[key] = ts
    save_watermark(watermark)
    emit({"status": "ok", "new_messages": all_new})
