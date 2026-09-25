# Skill: Nick Saraev — Content Automation & Repurposing Systems

**Expert:** Nick Saraev — automation entrepreneur, founder of LeftClick; teaches Make.com/n8n automation to 300K+ subscribers. Built a 7-figure content operation on automation before teaching it; ships production workflow templates, not tutorials.
**Lens:** Boring reliability beats impressive demos. Limit AI to what it's good at (reasoning, routing, deciding); delegate actual work to deterministic code. Create the source once, then let a machine fan it out — with a human review gate before anything publishes.
**Applies to:** designing MACF content pipelines, blog→social fan-out, evaluating automation claims, deciding where humans stay in the loop.

## Core philosophy

Most automation creators build flashy 47-node pipelines that work 59% of the time. His doctrine: boring reliability over impressive demos. "You cannot run a million dollar a month operation on a system that only works most of the time." His DOE framework (Directive–Orchestrator–Executor) replaces the human as workflow orchestrator with an AI one: natural-language directives, an agent that routes and decides, plain code that does the work. For content: record once with repurposing in mind, then let a machine fan it out across platforms — platform-native every time, never copy-paste.

## Key frameworks & tactics

1. **The repurposing engine (fan-out architecture).** One source (blog post, video, transcript) enters via webhook → content extraction → an AI agent generates platform-native versions (e.g., LinkedIn post 120–150 words, professional tone; X thread 3–5 tweets; Instagram caption 100–120 words) → everything logged to Google Sheets with timestamps and source tracking → scheduled/published. One blog post → 3+ platform posts in ~60 seconds.
2. **Record with repurposing in mind.** Before creating, build in extractable moments: one clear thesis, 3–5 insights, one story, one contrarian point, one stat. Upstream structure is what makes the downstream AI workflow work — garbage in, repetitive out.
3. **DOE framework (Directive / Orchestrator / Executor).** Directives are human-readable markdown recipes (goal, inputs, steps, edge cases, definition of done, guardrails) in version control — improvable by the agent itself. The orchestrator is an AI agent; executors are deterministic scripts. This is the answer to error-compounding in long pipelines.
4. **Boring automations pay.** The most valuable wins are unsexy revenue plumbing — lead-gen scrapers, outreach systems, proposal pipelines. For content: a dead-simple blog-to-socials workflow you'll actually run beats a multi-agent content "factory."
5. **Error-compounding math as a design constraint.** If each step succeeds 90% of the time, five chained steps compound to 59%. Minimize probabilistic decision points: one AI pass with good prompts beats five chained AI passes.
6. **Platform-native reformatting, not copy-paste.** The engine doesn't cross-post; it rewrites per platform's tone, length, and structure. Editorial adaptation is what makes repurposing work — distribution alone is spam.
7. **Google Sheets as the default data layer.** Every pipeline logs outputs to Sheets: the review queue, the archive, the source of truth for what went out where. A human reviews before publishing; the machine drafts.
8. **Templates over tutorials.** Ship production-ready workflow templates so a working pipeline is the starting point, not the aspiration.

## What would Nick do — decision heuristics

- **Workflow has 5+ chained AI steps →** collapse it. Error compounds multiplicatively.
- **AI doing something deterministic (formatting, routing, copying) →** replace with code; let AI handle judgment calls only.
- **Choosing between an impressive agent system and a boring zap →** pick the boring one that works 99.9% of the time. Reliability is the product.
- **Repurposed content feels repetitive →** the problem is upstream: structure the source with more distinct extractable moments.
- **Pipeline needs daily babysitting →** it isn't automation, it's a hobby. Add logging, notifications, and a definition of done.
- **Someone proposes full auto-posting →** keep a human review gate. The machine drafts; the human publishes. (Matches the team's hard rule: nothing live without Jesse's ✅.)

## Voice notes

Practitioner-to-practitioner, anti-guru. Opens with revenue numbers and "here's what real systems look like" — screensharing production workflows, not slides. Fast, systems-thinking cadence; fond of constraints stated as math. "I've sold this, here's the receipt."

## When to apply

Designing any MACF content pipeline (blog → social fan-out is his exact engine). Evaluating automation vendor claims. Deciding where humans stay in the loop. Giving Jesse a mental model for "what's worth automating" (revenue-critical + repetitive + judgment-light).

## What to avoid

- **Automating voice and judgment.** AI drafts; humans own strategy, voice, storytelling, community. Never automate replies or relationships.
- **Real-time judgment under ambiguity with no review gate.** If no human can catch the failure, don't ship the pipeline.
- **Over-engineering.** When a simple zap does the job, the agent framework is vanity.
- **His numbers as gospel.** Treat revenue claims as his claims; validate any system by building and measuring it.
