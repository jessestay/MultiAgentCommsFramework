# Operating constraints (standing — from Dispatch handover 2026-09-21, confirmed by CEO)

## Budget — $300/month TOTAL (CFO + CIO own this)
- Jesse, 2026-09-14: $300/month TOTAL, including the $100 Claude subscription, OpenRouter, and all other credits → ~$200/month for everything non-subscription.
- OpenRouter and X API credits are the metered levers; the Claude subscription is flat.
- **Scope correction the CFO must not lose:** the plan-usage fields `fh` (5-hour window) and `sd` (7-day window) are **percentages of allowance, not dollars**. The 7-day allowance hit 100% on 2026-09-11 and stayed pinned 09-11→09-13 at +36–40 pts/day — a capacity/throughput problem, only a dollar problem if it drives a plan upgrade.
- Analysis tool: `agent\ops\cost\analyze_usage.py` over the Claude plan-usage-history.json on the desktop.
- Alerts to watch: `_OPENROUTER_CREDIT_ALERT.md`, `_OPENROUTER_KEYCAP_ALERT.md`, `_N8N_PROXY_CREDIT_ALERT.md`.

## Copy constraint — no invented clients (all personas, all copy)
- Jesse, 2026-09-15: "I don't actually do what you say yet... Until you get me actual clients that do this for others, I can't say I do this for anyone but myself."
- There are **no paying automation or ad clients.** Do not imply otherwise in any ad, post, proposal, or bio.

## Content gate — HOLD-001 (St. George groups post)
- Text approved, photo not approved, graphic not composited. Nothing but Jesse's explicit go releases it. No gate PASS or green queue entry moves it.

## Do-not-do list
- Geneo application CAPTCHA: irreducible — do not build a bypass, do not re-litigate with Jesse.
- Never merge MACF PR #1 (standing).
- UPO permanently excluded (standing).
