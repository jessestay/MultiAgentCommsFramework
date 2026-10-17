require('dotenv').config();
const axios = require('axios');
const { resolveSlackToken } = require('./engine/slackToken');
const CH = 'C0ASH4TF604';
const DIRECTIVES = [
  ['CMO', '[from: CEO → CMO] #730 WORKSHOP PAGE — RE-ISSUE (gateway window open). The workshop page still says October 4 in four places. The workshop is Sunday, October 18, 2026, 11:00am MT. Fix every date reference to October 18 (fix pack: your_files/workshop-page-date-fix-oct18.md in the workspace). Acceptance: reply in this thread with [DEMO] and the live page URL once it reads October 18; the CEO will verify HTTP 200, the new date, and that the PayPal checkout link still works. This is the top priority — the workshop is in two days.'],
  ['CTO', '[from: CEO → CTO] #112 AUDIT PAGE — RE-ISSUE (gateway window open). staynalive.com/ai-audit and /ai-teardown still return 404. Source copy: workspace/revenue-oct5/play2-audits/offer-doc.md. Build and publish the page with the booking flow (Calendly), the Meta pixel, and the conversion event wired. Acceptance: reply in this thread with [DEMO] and the live URL; the CEO will verify 200 + Calendly + pixel + conversion event on the live page.'],
  ['Lawyer', '[from: CEO → Lawyer] #776 OUTREACH REVISION — RE-ISSUE, exact paths. Input file: outreach/audit-outreach-drafts-2026-10-12.md (in the agent sandbox). Revise all 40 drafts under Jesse\'s call rule: a phone call may be promised ONLY on subjects he is solid on (AI readiness/automation and social/marketing audits) with CEO coaching before any booked call; deep security/compliance topics (SOC 2, ISO 27001, PCI, IaC, SSO) must NOT promise a call — async only; remove every unverified claim about a prospect. Output: outreach/audit-outreach-drafts-REVISED.md, then reply in this thread with [DEMO] and the file path. Due today EOD. Nothing sends to anyone — drafts only.'],
  ['Facebook Expert', '[from: CEO → Facebook Expert] #122 REGENERATION — RE-ISSUE. Your design doc landed tonight and is verified (troll-overfeeding-design.md, receipt rcpt_mvamy84q19e03e) — good work. Still owed: the drafted-replies artifact destroyed in the Oct 15 restore. Regenerate n8n/demo-drafted-replies.md in the sandbox: draft-mode drafted replies from the read-only queue, per the design. Reply in this thread with [DEMO] and the exact file path when it exists on disk.'],
  ['Lawyer', '[from: CEO → Lawyer] #777 CLOSED-LOOP MEMO — RE-ISSUE (due Oct 17 EOD). Verify the EXACT token design: Stay N Alive usage credits, own services only, non-transferable, no cash-out, fixed value, $2,000/day cap. Cover: the FinCEN closed-loop exclusion (31 CFR 1010.100(ff)(4)(iii), FIN-2013-R003), Utah Title 7 Ch. 25, CA Fin. Code 2003(x), TX Fin. Code ch. 152, NY, the Howey analysis, gift-card/escheat exposure, and sales tax — PLUS the two items skipped in #734: the line-by-line audit of the $4,120 Delaware package and the cheapest defensible structure with real fees. Deliverable: research/lawyer-734-closed-loop-memo.md in the sandbox + [DEMO] in this thread.'],
];
(async () => {
  const token = resolveSlackToken();
  if (!token) { console.log('NO TOKEN'); process.exit(1); }
  for (const [role, text] of DIRECTIVES) {
    const resp = await axios.post('https://slack.com/api/chat.postMessage',
      new URLSearchParams({ channel: CH, text }).toString(),
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' } });
    console.log(role, 'ok=' + resp.data.ok, 'ts=' + (resp.data.ts || ''), resp.data.error || '');
    await new Promise(r => setTimeout(r, 1200));
  }
  process.exit(0);
})().catch(e => { console.log('POSTER ERROR', e.message); process.exit(1); });
