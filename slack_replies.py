import sys, json, urllib.request, urllib.parse
import os as _os
for _p in ('/opt/hatch/skills/skill-creator/bin', '/opt/muse/skills/custom-connector-setup/bin', '/opt/hatch/workflow-skills/custom-connector-setup/bin'):
    if _os.path.exists(_p + '/dynamic_credentials.py'):
        sys.path.insert(0, _p)
        break
from dynamic_credentials import add_surrogate_to_request, read_json_response

channel, ts = sys.argv[1], sys.argv[2]
data = urllib.parse.urlencode({"channel": channel, "ts": ts}).encode()
req = urllib.request.Request(
    "https://slack.com/api/conversations.replies",
    data=data,
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    method="POST",
)
add_surrogate_to_request(req, "custom.slack", allowed_hosts=["slack.com"])
with urllib.request.urlopen(req, timeout=30) as resp:
    out = read_json_response(resp)
msgs = out.get("messages", [])
print("ok:", out.get("ok"), "count:", len(msgs))
for m in msgs:
    print("---", m.get("ts"), m.get("user") or m.get("bot_id"))
    print((m.get("text") or "")[:3000])
