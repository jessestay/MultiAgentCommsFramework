#!/usr/bin/env python3
"""Directive watch: check CEO directive threads for replies.

Reads WATCHLIST below, fetches thread replies (form-encoded, per AGENTS.md),
prints single-line JSON: {"threads":[{label, replies, latest_reply_ts, silent_hours}], ...}
"""
import sys, json, time, datetime, urllib.request, urllib.parse

import os as _os
for _p in ('/opt/hatch/skills/skill-creator/bin', '/opt/muse/skills/custom-connector-setup/bin', '/opt/hatch/workflow-skills/custom-connector-setup/bin'):
    if _os.path.exists(_p + '/dynamic_credentials.py'):
        sys.path.insert(0, _p)
        break
from dynamic_credentials import add_surrogate_to_request, read_json_response

WATCHLIST = [
    # FIX (Oct 2, 2026): Cleared 4 stale entries from Sep 30/Oct 1. Parent messages
    # no longer exist at those TS values, threads were already escalated.
    # Only tracking active directives now.
    # FIX (Oct 7, 2026 ~23:45 MDT): The Oct 6 re-issue (parent 1791287246.607069)
    # was superseded: a 18:15 MDT Oct 7 re-issue (1791418512.070739) went out
    # with no artifact paths and was dead-lettered as missing_artifacts by the
    # evidence gate. Root cause found: no re-issue ever carried the PDF/template
    # paths. The CEO re-issued AGAIN with all 20 verified artifact paths attached
    # (ts 1791438542.937259). Now tracking the live corrected re-issue.
    {"label": "CMO product PDF review (re-issued Oct 11, text content inline)",
     "channel": "C0ASDH1HC1Y", "parent_ts": "1791733868.886459",
     "max_silent_h": 12},
]

def api(method, params):
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request("https://slack.com/api/" + method, data=data,
                                 method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    add_surrogate_to_request(req, "custom.slack", allowed_hosts=["slack.com"])
    with urllib.request.urlopen(req, timeout=30) as resp:
        return read_json_response(resp)

now = time.time()
out = []
for w in WATCHLIST:
    try:
        d = api("conversations.replies",
                {"channel": w["channel"], "ts": w["parent_ts"], "limit": 30})
        msgs = d.get("messages", [])
        replies = msgs[1:]
        latest = max((float(m["ts"]) for m in replies), default=float(w["parent_ts"]))
        silent_h = round((now - latest) / 3600, 1)
        out.append({"label": w["label"], "replies": len(replies),
                    "silent_hours": silent_h,
                    "overdue": silent_h >= w["max_silent_h"],
                    "latest_snippet": (replies[-1].get("text", "")[:160].replace("\n", " ")
                                       if replies else "")})
    except Exception as e:
        out.append({"label": w["label"], "error": str(e)[:120]})
print(json.dumps({"threads": out}))
