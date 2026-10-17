# Content Quality Gate — MACF Engine

Every agent must run this gate BEFORE any content is presented to Jesse or
posted anywhere for approval. No draft reaches a human until it passes every
rule. This is engine law, not a suggestion.

## The gate (all must pass)

### 0. Bold-opinion hook
Every piece opens with a hook (social) or title (long-form) that IS a bold
opinion from Jesse — designed to get people agreeing AND disagreeing with
each other in the replies, or to show off his knowledge and confidence in a
bold way. No neutral openers. No "here's what happened" without a take.
The hook must contain the opinion, not just tease it.

### 1. Reader-value test
Ask: "How does this make the content more useful to the READER?"
- Every claim that raises a question must answer it in the draft. If you name
  five math questions, say what they were. If you mention a gadget, say where
  to get it.
- No unanswered questions left hanging. No "trust me" gaps.
- The reader must leave with something: a link, a number, a decision, a laugh.

### 2. Bold open, Jesse's opinion first
- Start with a bold statement or opinion from Jesse. Never throat-clearing.
- Banned openers: definitions, "That sentence should not work" confusion,
  thesis statements, "it's worth noting" energy.
- The first line must make a scroller stop. If it wouldn't stop YOU, cut it.

### 3. Emotion and voice
- Write like Jesse: first-person stake, dry self-deprecating humor, concrete
  numbers, fair-then-fatal honesty, aphoristic closer.
- More emotion, not less. If the draft reads flat, it fails.
- Read `team-skills/jesse-voice.md` and check every signature trait before
  presenting. The anti-slop checklist is mandatory, not optional.

### 4. Expert lens check
The assigned persona must be VISIBLE in the draft, not just claimed in the
prompt. If you can't point to the sentence where the lens shows up, rewrite.
Full persona map (Jesse's standing assignments):
- Marketing strategy: Ryan Holiday — contrarian, timeless human-behavior
  angle, no hype, trust earned not claimed.
- Video/YouTube packaging: Derral Eves — hook in the first 3 seconds, open
  loops, one idea per video, strong CTA.
- LinkedIn: Justin Welsh — practitioner voice, specific operating details,
  no guru fluff.
- Facebook organic: Mari Smith — relationship-first, conversation-driven,
  native to the feed.
- Instagram: Brock Johnson — visual-first, Reels-native pacing.
- X/Twitter: Dickie Bush — tight, punchy, thread-aware writing.
- Short-form video (TikTok/Reels/Shorts): Brendan Kane — hook-point
  framework, pattern interrupts.
- AI social automation angles: Nick Saraev.
- SEO/AIO (blog, long-form): Neil Patel — search-intent aware, scannable
  structure, earns the click.
Apply the lens matching the draft's platform AND the content type. A LinkedIn
post gets Welsh + Holiday. A Facebook post gets Mari Smith. A blog post gets
Holiday + Patel.

### 5. Practical links
- Every draft that mentions a thing you can get, read, or try MUST include
  the link. Gadgets → gadgets.muse.ai. Papers → the source. Tools → the URL.
- Verify the link exists before including it. Never invent URLs.

### 6. Format, not just text
- Text-only is never the default assumption. For each draft, state the
  intended format: text post, carousel, short video script, image + caption.
- If the format needs a visual, include an image direction (what the image
  shows, text overlay, aspect ratio) so Jesse can approve the concept.
- One draft per batch may be long-form idea (headline + outline) instead.

### 7. Use every available MCP tool
Before presenting, the drafting agent must use all MCP tools available to it
to make the content as engaging, productive, and human-created-looking as
possible. All visuals route through the CUXO and must pass
`slack-agents/engine/visual-quality-gate.md` (Jasmine Star lens, stock-first
editorial filter) before reaching Jesse.

## How to run the gate

Before presenting drafts, the drafting agent scores each draft 1–5 on every
rule above and includes the scores in its handoff. Any draft scoring below 4
on ANY rule is rewritten before presentation — never presented "as-is with
caveats."

## Enforcement

- The weekly content batch worker MUST run this gate before post_drafts.py.
- Any agent presenting content to Jesse in any channel MUST run this gate.
- A draft that reaches Jesse without passing the gate is an engine defect:
  log it, fix the drafting path, don't blame the agent.
