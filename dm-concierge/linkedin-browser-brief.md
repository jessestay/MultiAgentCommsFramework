# LinkedIn Browser Brief — MACF DM Concierge Leg

**Owner:** CEO-role holder (execPM). **Draft-only:** nothing is ever SENT on LinkedIn without Jesse Stay's explicit approval. This leg is DRAFT-ONLY — the runner produces drafts in the run report; sending is out of scope (a later takeover flag may authorize it, handled separately).

There is **no LinkedIn skill, API, or CLI** for this leg. The runner performs it via the live-browser task in Jesse's authenticated browser profile.

---

## 1. Objective

Check Jesse's LinkedIn messaging inbox for new/unread messages since the last check, and produce DRAFT replies in Jesse's voice (professional, warm, concise — no invented facts, no invented commitments, no spend/save/send/publish) for anything worth answering. Drafts go into the task report; they are never typed into LinkedIn's compose box during the check.

## 2. Preconditions — verify BEFORE touching the inbox

1. Open `https://www.linkedin.com/messaging/`.
2. **First check:** confirm you are looking at Jesse Stay's account (his profile photo/name in the nav) and NOT a login wall or sign-in page.
3. If LinkedIn shows a login/sign-up wall: **STOP immediately.** Report `Login status: LOGIN REQUIRED — LinkedIn login required`. **Never attempt to log in, never type credentials, never mention or request credentials in the report.** The run ends there.

## 3. Exact steps

> ⚠️ **Auto-open trap:** the messaging page auto-opens the newest thread on load, which marks it read before you've reviewed it. Prefer the Unread-filtered view below so the inbox page itself doesn't destroy the signal you're checking.

1. Navigate to `https://www.linkedin.com/messaging/?filter=unread` (the **Unread** filter shows only unread threads; an empty state reads "No unread messages" — that is a valid result).
2. Also glance at both inbox categories: **Focused** and **Other** (LinkedIn splits inboxes; requests from non-connections often land in Other). If the Unread filter already covers both, a quick tab check is enough.
3. Review only threads **newer than the watermark** (see §4). Human-paced: a few threads per run — never click through dozens in a row.
4. For each unread thread you open, capture:
   - **Sender name + headline** (e.g. "Name — Head of Growth at Acme")
   - **Whether it's a connection** (1st-degree) or an InMail / message request
   - **The latest 2–3 inbound messages**, each with its timestamp (date + time as shown; note timezone if displayed)
   - **Your draft reply** (short, in Jesse's voice: professional, warm; no invented facts, no commitments, no links unless already contextually known)
   - **Classification:** one of `business opportunity` | `recruiter-noise` | `spam/sales-pitch` | `personal/networking` | `needs context`
5. **Do NOT mark threads read/unread, mute, archive, or change anything.** Read-only: observe and record.
6. Notes on LinkedIn quirks worth knowing while reading:
   - Read receipts appear as the sender's tiny profile picture under a message (not blue ticks); grey check = delivered, not read. Only read, don't infer.
   - The bottom-right mini messaging window can pop over pages — dismiss it if it interferes; the full page is `/messaging/`.

### What counts as a business opportunity (draft carefully)
Legitimate inbound: potential clients, partners, speaking/podcast invites, media, investors, Bacon/Muse product inquiries, mutual-connection intros. Draft a reply that acknowledges, asks one short qualifying question, and leaves the door open — never commits to meetings, calls, pricing, or deliverables.

### What counts as noise (note, don't draft)
Recruiter spam ("exciting opportunity" for a role Jesse doesn't hold), bulk sales pitches, crypto/SEO lead-gen, InMail blasts with no personalization, obvious phishing. Note the sender and move on.

## 4. Watermark — recording "last checked"

After each successful run (login verified, inbox checked), write a single line to:

`~/workspace/macf/hidden_files/dm-concierge/linkedin-watermark.txt`

Format: ISO-8601 UTC timestamp of the check, e.g. `2026-09-25T17:15:00Z`.

Next run: only review threads with inbound activity **after** that timestamp. If the file is missing or empty, treat it as a first run and review the current unread set (cap at ~10 threads; note the cap in the report).

## 5. Fragility warnings — read before you start

- **Layouts shift.** LinkedIn redesigns the messaging UI regularly; if selectors/labels don't match this brief, describe what you see and adapt — don't force it.
- **Bot detection is real.** Aggressive clicking, bulk thread-opening, or scraping-style behavior can trigger a verification challenge (CAPTCHA, email/phone verification) or a **temporary account restriction** on Jesse's account.
  - Keep the session **human-paced**: a few threads per run, pause between clicks, no rapid navigation, no bulk scraping.
  - If a **CAPTCHA or any verification challenge** appears: **STOP and report.** Do NOT attempt to solve it. (Jesse has a standing permission to solve CAPTCHAs on his own browser tasks — this leg overrides it: stopping protects his LinkedIn account.)
  - If a **rate-limit or restriction notice** appears: STOP and report it verbatim.
- **Don't type drafts into LinkedIn.** Drafts live only in the run report. Typing into the compose box risks an accidental send (Enter-to-send is a real LinkedIn behavior).
- **Timezone awareness:** timestamps in LinkedIn display in the browser's locale; report what you see without guessing the timezone.

## 6. Suggested cadence

**Manual / on-request runs by the CEO for now** (not a 15-minute cron like Instagram). Tradeoff:

| Cadence | Pros | Cons |
|---|---|---|
| On-request/manual | Zero standing bot-detection risk; each run is deliberate and human-paced; drafts are fresh when Jesse asks | Messages can sit unread for days; opportunities age |
| Weekly | Predictable; low detection risk (one short session/week); matches LinkedIn's slow DM tempo | Still lets hot inbound cool for up to 7 days |
| 15-min cron (NOT recommended) | Fastest | Repeated logins/sessions look automated; high CAPTCHA/restriction risk on a high-value account; LinkedIn DM volume doesn't justify it |

Recommendation: **on-request, plus a light weekly sweep** until volume proves otherwise. Escalate to a more frequent cadence only if missed opportunities are actually observed.

## 7. Report-back format (fill in each run)

```
LINKEDIN DM CONCIERGE RUN — <YYYY-MM-DD HH:MM UTC>
Login status: [OK — Jesse Stay's account | LOGIN REQUIRED]
Watermark: [previous → new UTC timestamp]
Threads reviewed: [N] (cap noted if applied)
---
THREAD 1
  Sender: [name — headline]
  Type: [connection | InMail | message request]
  Classification: [business opportunity | recruiter-noise | spam/sales-pitch | personal/networking | needs context]
  Latest inbound (≤3, with timestamps):
    - [timestamp] [message text]
  Draft reply (NOT sent):
    > [draft]
---
[new messages found: N]
Blockers: [none | CAPTCHA/verification seen — stopped | restriction notice | layout mismatch description]
```

---

*Last updated: 2026-09-25. Research basis: LinkedIn Help (inbox filters: Focused/Other, Unread, InMail), LinkedIn messaging behavior notes (read receipts = profile picture; auto-open newest thread on /messaging/ load).*
