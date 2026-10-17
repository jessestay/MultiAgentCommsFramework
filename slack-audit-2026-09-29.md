# MACF Slack Workspace Audit — 2026-09-29

**Workspace:** Stay N Alive (`staynalive.slack.com`, team `T12P9HMEX`)
**Auditor:** Jarvis Jr. (CEO subagent), acting under Jesse's standing Slack admin authorization
**Method:** Read-only API inspection via the `jarvis_jr` bot token (`custom.slack`), plus
message-payload mining. No messages sent, no DMs to Jesse, nothing posted as Jesse.
**Token acts as:** `jarvis_jr` (`U0C2QE4PGFR` / bot `B0C39F2CNHJ`) — confirmed via `auth.test`.

---

## 1. Identity map

| User ID | Who it is (evidence) | Bot ID | App ID | Kind |
|---|---|---|---|---|
| `U12QFAS8L` | **Jesse Stay** (human) | — | — | Human — investor/chairman |
| `U0C2QE4PGFR` | **jarvis_jr** — the CEO bot (this agent) | `B0C39F2CNHJ` | `A0C37NEKHGR` | Bot (VM-side) |
| `U0AU5GPKRF1` | **MACF desktop team bot user** | `B0AUJU69KK8` | `A0AUEJNGZ4K` | Bot (desktop-side) — posts under per-persona `username`s: `CMO`, `CCO`, `CFO`, `CRO`, `CTO`, `CUXO`, `Exec PM`, `Job Coach`, `Lawyer`, `PM`, `QA`, `Debugging`, `Ops Watchdog` |
| `U0ATU4J0RFA` | **"Exec PM" standalone APP** (browser profile 21:40 MDT) | `B0AT3DYQN76` | unknown | Standalone Slack app — **NOT jarvis_jr**. Silent (never posts); member of 6 channels |
| `U0AT1FNRZ54` | Unidentified app | ? | ? | Silent; in #content, #management, #marketing |
| `U0ATU9CQ0EL` | Unidentified app | ? | ? | Silent; in #cto, #management |
| `U0ASWG2279T` | Unidentified app | ? | ? | Silent; in #management, #marketing, #research |
| `U0AT909PGQ2` | Unidentified app | ? | ? | Silent; in #management, #marketing, #research |
| `U0ATTH0UAA0` | Unidentified app | ? | ? | Silent; in #jobs only |
| `U09CHH52JC8` | Unidentified app | ? | ? | Silent; in #jobs, #management |
| `U12QXPTQX` | Unknown | ? | ? | In #general + #random only; never in work channels |
| `U1HASMMFY` | Unknown | ? | ? | In #general + #random only; never in work channels |

The `U0AT*`/`U09*` apps were created in one batch (IDs cluster) alongside the
Exec PM app — likely setup-era experiments. None has posted in the last 200+
messages of any channel. They cannot be named via API: the token lacks
`users:read` (see §7).

---

## 2. U0ATU4J0RFA resolution (highest-risk item — RESOLVED)

**Definitive answer: `U0ATU4J0RFA` is the standalone "Exec PM" Slack app
(bot `B0AT3DYQN76`), NOT Jarvis Jr.** Jarvis Jr. is and remains `U0C2QE4PGFR`
(bot `B0C39F2CNHJ`).

**Why Jesse believed it was jarvis_jr.** Raw history from #jobs (`C0ASDH56FA6`),
Sep 29 (times MDT):

- **19:43** — Jesse: `<@U0C2QE4PGFR> is our new CEO for both the company and my life…`
  → this mention is the **real** jarvis_jr bot. Correct.
- **19:45** — Jesse: `Please send all communication, needs, and road blocks to
  <@U0ATU4J0RFA> and <@U0C2QE4PGFR> - you report to them.`
  → this names the Exec PM app **plus** jarvis_jr.

When asked about `U0ATU4J0RFA`, Jesse answered from his memory of appointing
"jarvis_jr" as CEO (the 19:43 message) and conflated the two messages. A
contributing confusion: the desktop bot posts messages with the free-form
`username` **"Exec PM"**, so the string "Exec PM" appears both as a message
author and as the standalone app's mention — easy to mix up in autocomplete.

**Action required:** nothing is wired to `U0ATU4J0RFA`. Do NOT treat it as the
CEO, do NOT route CEO traffic to it. The ceo-watch now flags any message
mentioning it with `[NOTE: mentions the standalone Exec PM app, NOT jarvis_jr]`.
Jesse should confirm the profile himself (one tap: tap the mention → view
profile → shows "Exec PM APP") and decide whether to remove that app from its
6 channels (§7).

---

## 3. Channel map

| Channel | ID | Members | jarvis_jr in? | Purpose (set/confirmed this audit) |
|---|---|---|---|---|
| #management | `C0ASH4TF604` | 9 | ✅ | Exec team coordination: standups, priorities, escalations, investor updates |
| #marketing | `C0ASDH1HC1Y` | 7 | ✅ | Marketing team: campaigns, workshop promo, growth experiments |
| #content | `C0ASA532BGD` | 5 | ✅ | Content team: drafts, content pipeline, publishing calendar |
| #research | `C0ASH4ZHGQL` | 6 | ✅ | Research team: market intel, prospect research, learning notes |
| #jobs | `C0ASDH56FA6` | 6 | ✅ (joined 19:41 MDT) | Job search: tracking Jesse's job hunt — targets, applications, interviews |
| #cto | `C0ASBF3TMTQ` | 5 | ✅ | Engineering: builds, deploys, test results, infrastructure |
| #legal | `C0BGBGQRT0V` | 3 | ✅ (joined Sep 29) | Legal: counsel coordination, filings, disputes (Jesse is self-represented) |
| #ceo-board | `C0BAL2VLACR` | 3 | ✅ | CEO board: briefings, decisions, investor-level updates |
| #exec-pm | `C0AUHTH4YTX` | 1 (desktop bot only) | ❌ | — (desktop-bot-only channel) |
| #transkrybe | `C0AUEUF515Z` | 1 (desktop bot only) | ❌ | — (desktop-bot-only channel) |
| #general | `C12QWE8MP` | 3 (Jesse + 2 unknown) | ❌ | Team-wide communication and announcements (pre-existing) |
| #random | `C12P9HRQT` | 3 (Jesse + 2 unknown) | ❌ | Non-work-related (pre-existing) |

Rename archaeology (from `previous_names`): **#management was "exec-pm"**,
**#cto was "transkrybe"** — the workspace was reorganized and old names
recycled into the new #exec-pm / #transkrybe channels. No archived channels.

Notable membership facts:
- The desktop team bot (`U0AU5GPKRF1`) is in all 10 work channels — full coverage. ✅
- **No bot at all is in #general or #random** — Jesse's team-wide announcements
  there are invisible to the team. Tried to add jarvis_jr: blocked, token lacks
  `channels:join` (and self-invite via `channels:manage` fails with
  `not_in_channel`). Needs Jesse (§7).
- #exec-pm / #transkrybe are desktop-bot-only; jarvis_jr can't read them
  (`not_in_channel`).

---

## 4. Human-team realism verdict

**Verdict: YES, it largely works like a real human team — with specific gaps,
most now fixed.**

What works like humans:
- Personas post under human-style names (`CMO`, `Job Coach`, `Lawyer`…) via one
  shared bot — reads naturally in-channel. ✅
- `[work engine → X] Task #N:` delegation headers + plain-language narration of
  work as it happens. ✅
- Work gets narrated in home channels (#cto test results, #jobs search updates,
  #management standup-ish traffic). ✅
- CEO→investor dual delivery is live: the Jesse↔jarvis_jr DM (`D0C2QE4PQJK`)
  carries the "Heads up — this needs you" pings matching the sprint work. ✅
- @mentions, replies, and human/bot turn-taking all look normal in history. ✅

Gaps found (and status):
1. **No channel purposes** on any work channel — FIXED: purposes set on all 8
   work channels, verified by read-back (§6).
2. **Raw IDs in watcher output** (`<@U0ATU4J0RFA>`, `DM from U12QFAS8L`) — no
   `users:read` on the token. MITIGATED: static identity map in ceo-watch;
   full fix needs Jesse (§7).
3. **Tool-call markup leaking into channels** (`<|tool_call_start|>…`) — 11
   instances in the last 100 messages of #management/#jobs, from the desktop
   bot. Filed **Vikunja #115 [CTO]** (desktop-side sanitizer). Not yet fixed.
4. **#content (11h) and #research (10.7h) quiet** — the Sep 29 no-idle trigger.
   Members are active in other channels (#cto, #jobs, #management, #marketing
   all <1h), so this is a narration-coverage gap, not idleness. execPM should
   enforce home-channel narration per the standing no-idle rule.
5. **#general invisible to the team** — needs Jesse (§7).
6. Teammate↔teammate `[from: X → Y]` DM format — **not verifiable via API**
   (no `im:read`); no evidence for or against.

---

## 5. Defect status

| # | Defect | Status |
|---|---|---|
| (a) | Raw `<\|tool_call_start\|>` markup posted by desktop bot in #jobs (~19:53, ~20:04 MDT Sep 29) | **STILL OCCURRING** — 11 instances in last 100 msgs across #management/#jobs. Filed **Vikunja #115 [CTO]**: strip `<\|…\|>` control tokens in the desktop Slack post path. Desktop-side fix; VM cannot apply it. |
| (b) | Work-engine double-post to #management (~14:00/14:01 MDT Sep 29, task #12) | **Confirmed, not recurring.** Vikunja #102 is closed; the four recent "Task #102" posts are distinct updates, not duplicates. Dedupe appears to hold. |
| (c) | ceo-watch health | **FIXED this audit** (see §6). Cron `ceo-slack-watch` healthy: every 15 min, 0 failures, last run 21:40 MDT. |
| (d) | #103: bot absent from #jobs | **Resolved** — jarvis_jr joined #jobs 19:41 MDT Sep 29 (join message in history). Task closed. |
| (e) | ceo-watch DM section mislabeling channel messages as "DMs" | **FIXED** — root-caused: `conversations.list(types=im)` without `im:read` returns regular channels via JSON; every channel message was scanned as a "DM". Rewrote to monitor the known DM channel directly. |
| (f) | ceo-watch only watched #marketing + #content | **FIXED** — now watches all 8 operating channels + thread replies (form-encoded `conversations.replies`) + flags any message from Jesse. |

---

## 6. Fixes applied (before → after)

**A. `~/workspace/macf/ceo-watch/ceo_watch.py` — rewritten and tested.**
- Before: "DM" discovery via `conversations.list(types=im)` silently scanned all
  12 regular channels and labeled every new message `DM from <raw ID>`; watched
  only #marketing + #content; no thread coverage; raw IDs everywhere.
- After: DMs read directly from the known Jesse↔jarvis_jr channel
  `D0C2QE4PQJK` (works with existing `im:history` scope — the supportable path
  without `im:read`); watches all 8 operating channels; checks thread replies
  via form-encoded `conversations.replies`; flags any Jesse message and any
  `@jarvis_jr` mention; static `NAMES` map resolves known IDs; any mention of
  `U0ATU4J0RFA` gets an explicit NOT-jarvis_jr warning.
- Verified: rewound state to 01:23 UTC and re-ran — both of Jesse's CEO
  messages were correctly reported as `#jobs from Jesse` (not DMs), with the
  Exec PM confusion note on the second. State restored afterward. Runtime ~7s
  (cron budget 300s).

**B. Channel purposes** — set on #management, #marketing, #content, #research,
   #jobs, #cto, #legal, #ceo-board; verified persisted via read-back.

**C. Vikunja #115** — `[CTO] Strip raw tool-call markup from desktop bot Slack
   posts`, with evidence (timestamps, channel, bot/app IDs) and acceptance
   criteria. (Side note: this Vikunja's task-create route takes POST, not PUT —
   the `utils/vikunja.js` comment saying PUT is stale.)

**D. Attempted: join #general** — blocked (`channels:join` scope missing;
   self-invite rejected). Moved to §7.

Nothing was sent, posted, or DM'd as part of this audit. No messages to Jesse.

---

## 7. What still needs Jesse (one-tap steps)

1. **Confirm the Exec PM app's identity (30 seconds).** In Slack, tap the
   `@Exec PM` mention from the 19:45 message → view profile → confirm it shows
   "Exec PM APP", not jarvis_jr. Then say the word: keep it in its 6 channels
   or remove it.
2. **Add Jarvis Jr to #general (one tap).** Open #general → channel header →
   "Add members" → add `jarvis_jr`. (I tried; the bot token can't join by
   itself — needs a human/admin invite.) This makes team-wide announcements
   visible to the team.
3. **Who are the other two people in #general/#random?** Two unknown users
   (`U12QXPTQX`, `U1HASMMFY`) are in #general and #random with you but no work
   channels. Quick sanity check that they're supposed to be there.
4. **Slack app scopes (5 minutes, one-time).** To let the watcher resolve names
   (`users:read`), discover DMs (`im:read`), and join channels (`channels:join`):
   open `api.slack.com/apps` → the **jarvis_jr** app → *OAuth & Permissions* →
   add scopes `users:read`, `im:read`, `channels:join` → *Reinstall to workspace*.
   Then tell me so I can reconnect the stored credential. (Do NOT add scopes to
   the Exec PM app — that's the wrong identity.)
5. **Unidentified silent apps** (`U0AT1FNRZ54`, `U0ATU9CQ0EL`, `U0ASWG2279T`,
   `U0AT909PGQ2`, `U0ATTH0UAA0`, `U09CHH52JC8`) — once `users:read` lands I can
   name them; until then, they're silent members, likely setup-era experiments.

---

## 8. DM-reading architecture (Jesse's "set yourself up to read them")

The supportable design with current scopes:
- **jarvis_jr's DMs: YES, readable.** The bot's DM with Jesse is channel
  `D0C2QE4PQJK`; `conversations.history` works with the existing `im:history`
  scope (verified live — the dual-delivery pings are visible there). The
  rewritten ceo-watch polls it every 15 min and surfaces Jesse's messages.
- **DM discovery: NO** — `conversations.list(types=im)` needs `im:read`, which
  the token lacks (returns `missing_scope` when form-encoded; misleadingly
  returns regular channels when JSON-encoded — the bug fixed in §6E).
  In practice this is fine: Jesse is the only human, and his DM channel is
  known and fixed.
- **Explicitly NOT wired:** the Exec PM app's (`U0ATU4J0RFA`) DMs or identity.
  That would be a different app's token and the wrong "CEO".
- **Teammate↔teammate DMs:** not readable without `im:read` on a user token;
  the `[from: X → Y]` delegation format remains convention-based, unverified.

---

## 9. Open questions / follow-ups for the team

- CTO: deploy the #115 markup sanitizer on the desktop work engine; note build ID.
- execPM: enforce home-channel narration for #content / #research (no-idle rule);
  consider whether the 6 silent `U0AT*`/`U09*` apps should stay in work channels.
- CEO-watch: when Jesse completes item 4 above, extend the watcher to use
  `users:read` (drop the static map) and `im:read` (real DM discovery).
- #exec-pm and #transkrybe are desktop-bot-only — decide if jarvis_jr needs
  read access there too.
