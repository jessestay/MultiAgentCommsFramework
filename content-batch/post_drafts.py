#!/usr/bin/env python3
"""Post a weekly draft-only content batch to #content for Jesse's approval.

Usage: python3 post_drafts.py drafts.json
drafts.json: {"week_of": "2026-09-28", "drafts": [{"label": "1", "platform": "LinkedIn", "hook": "...", "body": "..."}, ...]}

Posts ONE message to #content with all drafts, framed as approve/edit/skip.
Never publishes anywhere public. Drafts only.
"""
import json
import os
import sys
import urllib.request

import os as _os
for _p in ('/opt/hatch/skills/skill-creator/bin', '/opt/muse/skills/custom-connector-setup/bin', '/opt/hatch/workflow-skills/custom-connector-setup/bin'):
    if _os.path.exists(_p + '/dynamic_credentials.py'):
        sys.path.insert(0, _p)
        break
from dynamic_credentials import add_surrogate_to_request, read_json_response

API = "https://slack.com/api/"
CONTENT_CHANNEL = "C0ASA532BGD"  # #content


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


def main():
    if len(sys.argv) != 2:
        print("usage: post_drafts.py drafts.json", file=sys.stderr)
        sys.exit(2)
    with open(sys.argv[1]) as f:
        batch = json.load(f)
    drafts = batch.get("drafts", [])
    if not drafts:
        print("no drafts to post", file=sys.stderr)
        sys.exit(1)

    lines = [
        ":pencil2: *Weekly content drafts — week of %s*" % batch.get("week_of", "?"),
        "_Drafts only. Nothing is published. Reply with approve / edit / skip per draft._",
        "",
    ]
    for d in drafts:
        lines.append("*Draft %(label)s — %(platform)s*" % d)
        if d.get("hook"):
            lines.append("_Hook: %s_" % d["hook"])
        lines.append(d["body"])
        lines.append("")
    text = "\n".join(lines).strip()

    res = api("chat.postMessage", {"channel": CONTENT_CHANNEL, "text": text})
    if not res.get("ok"):
        print("post failed: %s" % json.dumps(res), file=sys.stderr)
        sys.exit(1)
    print("posted %d drafts to #content (ts=%s)" % (len(drafts), res.get("ts")))


if __name__ == "__main__":
    main()
