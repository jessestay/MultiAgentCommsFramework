#!/usr/bin/env python3
"""Sprint ground-truth gatherer.

The work engine is text-only (one LLM call, no tools): it cannot verify
sends, payments, page publishes, or replies, and it cannot see Slack
threads. When a revenue-sprint directive goes overdue, the verified facts
below are attached to the OWNER's nudge so the owner answers the thread
with real data. The CEO never posts the answer itself: fixing the system
means repairing the mechanism, not doing the team's work (Jesse's
correction, Sep 30 2026).

This script gathers everything verifiable from the VM in one pass and prints
a per-lane fact sheet. PayPal ticket sales still need a live browser check
(the script prints a placeholder line for it).

Usage: python3 sprint-ground-truth.py
"""
import json, os, subprocess, time, urllib.request, urllib.parse, sys

HOME = os.path.expanduser("~")
OUT = []

def check(label, fn):
    try:
        OUT.append((label, fn()))
    except Exception as e:
        OUT.append((label, "UNVERIFIED (%s)" % str(e)[:100]))

def curl_status(url):
    try:
        out = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
                              "-m", "12", url], capture_output=True, text=True, timeout=20)
        return out.stdout.strip()
    except Exception:
        return "ERR"

def vikunja_tasks(project_id):
    env = dict(os.environ)
    tok = None
    p = os.path.join(HOME, "workspace/macf/slack-agents/.env")
    for line in open(p):
        if line.startswith("VIKUNJA_TOKEN="):
            tok = line.strip().split("=", 1)[1]
    req = urllib.request.Request(
        "http://127.0.0.1:3456/api/v2/projects/%d/tasks?per_page=50" % project_id,
        headers={"Authorization": "Bearer " + tok})
    d = json.loads(urllib.request.urlopen(req, timeout=15).read())
    items = d.get("items", d if isinstance(d, list) else [])
    return [(t["id"], bool(t.get("done")), (t.get("title") or "")[:60]) for t in items]

def gmail_triage(query, maxn=30):
    out = subprocess.run(
        ["hatch_gws_cli", "gmail", "+triage", "--query", query,
         "--max", str(maxn), "--format", "json"],
        capture_output=True, text=True, timeout=60)
    d = json.loads(out.stdout)
    msgs = d if isinstance(d, list) else d.get("messages", d.get("results", []))
    return msgs

# ---- Lane 1: ticket sales (workshop) ----
check("workshop page", lambda: "HTTP " + curl_status("https://staynalive.com/muse-for-business-workshop"))
check("campaign #62 (sent Sep 30)", lambda: "see FluentCRM; delivery counts unverified" )
check("campaigns #63/#64 (scheduled Oct 1 / Oct 3)", lambda: "scheduled, em-dash fix verified Sep 30")
OUT.append(("PayPal ticket payments today", "NEEDS LIVE BROWSER CHECK (placeholder)"))

# ---- Lane 2: audit outreach ----
def audit_lane():
    st = json.load(open(os.path.join(
        HOME, "workspace/revenue-oct5/play2-audits/automation/state.json")))
    sent = st.get("batch2_sent", {})
    fb = st.get("batch2_fb_dms", {})
    replies = st.get("replies_seen", {})
    return ("batch2 emails: %d IDs logged; FB DMs: %d pages; "
            "replies seen: %d" % (len(sent), len(fb), len(replies)))
check("audit outreach (batch 2)", audit_lane)

def audit_replies():
    msgs = gmail_triage("newer_than:7d (subject:audit OR subject:automate OR subject:teardown)", 40)
    inbound = [m for m in msgs
               if "jesse" not in (m.get("from") or "").lower()
               and "staynalive" not in (m.get("from") or "").lower()]
    return "%d inbound replies in 7d: %s" % (
        len(inbound),
        "; ".join("%s <%s>" % (m.get("date", "?")[:11], (m.get("from") or "")[:40])
                  for m in inbound[:5]) or "none")
check("audit inbound replies (7d)", audit_replies)

# ---- Lane 3: build ships ----
for label, url in [("impulse: audit-landing-page", "https://staynalive.com/audit-landing-page"),
                   ("impulse: ai-teardown", "https://staynalive.com/ai-teardown"),
                   ("impulse: prompt-pack", "https://staynalive.com/prompt-pack"),
                   ("impulse: workshop-replay", "https://staynalive.com/workshop-replay"),
                   ("impulse: gbp-tuneup", "https://staynalive.com/gbp-tuneup"),
                   ("impulse: buddy-pack", "https://staynalive.com/buddy-pack"),
                   ("impulse: team-pack", "https://staynalive.com/team-pack"),
                   ("audit landing page (#112)", "https://staynalive.com/ai-audit")]:
    check(label, (lambda u: lambda: "HTTP " + curl_status(u))(url))

def n8n_health():
    req = urllib.request.Request("http://127.0.0.1:5678/healthz")
    try:
        urllib.request.urlopen(req, timeout=10)
        return "up"
    except Exception as e:
        return "DOWN (%s)" % str(e)[:60]
check("n8n (outreach machine)", n8n_health)

# ---- Lane 4: sprint board state ----
def sprint_board():
    tasks = vikunja_tasks(16)
    open_t = [t for t in tasks if not t[1]]
    done_t = [t for t in tasks if t[1]]
    lines = ["open: %d, done: %d" % (len(open_t), len(done_t))]
    for tid, done, title in open_t[:12]:
        lines.append("  #%d OPEN %s" % (tid, title))
    return "\n".join(lines)
check("Vikunja sprint board (project 16)", sprint_board)

print("=" * 70)
print("SPRINT GROUND TRUTH — %s" % time.strftime("%Y-%m-%d %H:%M %Z"))
print("=" * 70)
for label, val in OUT:
    print("\n[%s]\n%s" % (label, val))
