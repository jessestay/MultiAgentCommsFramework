#!/usr/bin/env python3
"""CEO watch: poll Slack for DMs to the bot and @mentions in team channels.

The MACF Bolt server isn't deployed yet, so nothing listens for Slack events.
This script is the acting CEO's eyes: every run it checks for new bot DMs
(message.im/mpim equivalent) and @jarvis_jr mentions in #marketing/#content
since the last run, and prints a digest. It never replies on its own —
the CEO triages the digest.

State: state.json next to this script (last_ts + seen message ids).
"""
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

HERE = os.path.dirname(os.path.abspath(__file__))
STATE_PATH = os.path.join(HERE, "state.json")
API = "https://slack.com/api/"
BOT_USER_ID = "U0C2QE4PGFR"
WATCH_CHANNELS = {
    "C0ASDH1HC1Y": "#marketing",
    "C0ASA532BGD": "#content",
}


def api(method, params=None):
    req = urllib.request.Request(
        API + method,
        data=json.dumps(params or {}).encode(),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    add_surrogate_to_request(req, "custom.slack", allowed_hosts=["slack.com"])
    with urllib.request.urlopen(req, timeout=30) as resp:
        return read_json_response(resp)


def load_state():
    try:
        with open(STATE_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"last_ts": 0, "seen": []}


def save_state(state):
    state["seen"] = state["seen"][-500:]
    with open(STATE_PATH, "w") as f:
        json.dump(state, f)


def is_bot_msg(m):
    return m.get("bot_id") or m.get("user") == BOT_USER_ID or m.get("subtype") == "bot_message"


def main():
    state = load_state()
    first_run = state["last_ts"] == 0
    last_ts = state["last_ts"]
    seen = set(state["seen"])
    new_ts = last_ts
    findings = []

    # 1. Bot DMs
    try:
        ims = api("conversations.list", {"types": "im", "limit": 50})
        for ch in ims.get("channels", []):
            try:
                hist = api("conversations.history",
                           {"channel": ch["id"], "oldest": str(last_ts), "limit": 50})
            except Exception as e:
                findings.append(f"[warn] DM history failed for {ch['id']}: {e}")
                continue
            for m in hist.get("messages", []):
                ts = m.get("ts", "0")
                if ts in seen or is_bot_msg(m) or float(ts) <= last_ts:
                    continue
                seen.add(ts)
                user = m.get("user", "?")
                findings.append(f"DM from {user} @ {ts}: {m.get('text','')[:300]}")
                new_ts = max(new_ts, float(ts))
    except Exception as e:
        findings.append(f"[warn] DM list failed: {e}")

    # 2. @mentions in watched channels
    for cid, name in WATCH_CHANNELS.items():
        try:
            hist = api("conversations.history",
                       {"channel": cid, "oldest": str(last_ts), "limit": 50})
        except Exception as e:
            findings.append(f"[warn] {name} history failed: {e}")
            continue
        for m in hist.get("messages", []):
            ts = m.get("ts", "0")
            if ts in seen or is_bot_msg(m) or float(ts) <= last_ts:
                continue
            text = m.get("text", "")
            if f"<@{BOT_USER_ID}>" not in text:
                continue
            seen.add(ts)
            findings.append(f"mention in {name} from {m.get('user','?')} @ {ts}: {text[:300]}")
            new_ts = max(new_ts, float(ts))

    state["last_ts"] = max(new_ts, time.time() if first_run else new_ts)
    save_state(state)

    if first_run:
        print("CEO watch initialized. No backlog reported on first run.")
        return
    if not findings:
        print("CEO watch: nothing new — no DMs, no mentions.")
        return
    print("CEO WATCH DIGEST (needs triage):")
    for f in findings:
        print("-", f)


if __name__ == "__main__":
    main()
