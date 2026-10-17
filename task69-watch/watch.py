#!/usr/bin/env python3
"""Watch Vikunja task #69 for changes; report only what changed since last check."""
import hashlib, json, os, urllib.request

BASE = os.path.expanduser("~/workspace/goals/macf-24-7-work-engine-operation/hidden_files/task69-watch")
STATE = os.path.join(BASE, "state.json")
ENV_PATH = os.path.expanduser("~/workspace/macf/slack-agents/.env")
API = "http://127.0.0.1:3456/api/v1"
TASK_ID = 69

def get_token():
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if line.startswith("VIKUNJA_") and "TOKEN" in line and "=" in line:
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("vikunja token not found")

def api_get(path):
    req = urllib.request.Request(API + path,
                                headers={"Authorization": "Bearer " + get_token()})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

def main():
    os.makedirs(BASE, exist_ok=True)
    task = api_get("/tasks/%d" % TASK_ID)
    comments = api_get("/tasks/%d/comments" % TASK_ID)
    if not isinstance(comments, list):
        comments = []
    snap = {
        "done": bool(task.get("done")),
        "priority": task.get("priority"),
        "title": task.get("title"),
        "updated": task.get("updated"),
        "desc_sha": hashlib.sha256((task.get("description") or "").encode()).hexdigest()[:16],
        "comment_ids": sorted(c.get("id") for c in comments if isinstance(c, dict)),
        "comment_count": len(comments),
    }
    prev = {}
    if os.path.exists(STATE):
        try:
            prev = json.load(open(STATE))
        except Exception:
            prev = {}
    events = []
    if prev:
        if prev.get("done") != snap["done"]:
            events.append("TASK DONE" if snap["done"] else "task reopened")
        if prev.get("priority") != snap["priority"]:
            events.append("priority %s -> %s" % (prev.get("priority"), snap["priority"]))
        if prev.get("desc_sha") != snap["desc_sha"]:
            events.append("description updated")
        new_ids = set(snap["comment_ids"]) - set(prev.get("comment_ids") or [])
        for cid in sorted(new_ids):
            c = next((x for x in comments if isinstance(x, dict) and x.get("id") == cid), {})
            author = (c.get("author") or {}).get("username") or "?"
            text = (c.get("comment") or "")[:300]
            events.append("new comment from %s: %s" % (author, text))
    json.dump(snap, open(STATE, "w"), indent=1)
    print(json.dumps({
        "changed": bool(events),
        "events": events,
        "done": snap["done"],
        "title": snap["title"],
        "comment_count": snap["comment_count"],
    }))

main()
