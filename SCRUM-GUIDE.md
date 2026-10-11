# MACF Scrum System — Plain English Guide

**What is this?** Your AI team now works like a real human software team. It holds
standup meetings every hour, plans work in 12-hour sprints, and plans releases
every 2 days. You approve everything. Nothing ships without you.

---

## The Big Idea (30 seconds)

Imagine you hired a team of 9 specialists. They'd need:
- Someone to run the daily standup → **execPM does this every hour**
- A plan for what to build → **sprint planning every 12 hours**
- A way to show you what they built → **every demo comes to you for approval**
- A way to get better over time → **retrospectives feed the improvement loop**

That's what this system does. Automatically. While you sleep.

---

## How It Works (2 minutes)

### 1. Hourly Standups — "What did you do? What's next? What's stuck?"

Every hour, execPM (acting as scrum master) asks each team member three questions:
1. What did you accomplish in the last hour?
2. What are you planning for the next hour?
3. Any blockers?

The answers post in #management where everyone can see them. If someone is stuck
for 3 hours straight, it auto-escalates — that's a broken system, not a lazy worker.

**If someone misses the standup**, they can submit late. Their update merges into
the next one. No one gets marked absent for being busy doing actual work.

### 2. 12-Hour Sprints — "Here's what we're building"

Twice a day, the team plans the next 12 hours:
- Reviews what got done
- Picks the top 3 priorities (no more — focus matters)
- Sets a sprint goal

At the end of 12 hours: demo what was built, discuss what worked and what didn't,
feed lessons into the improvement loop.

**The sprint is locked once it starts.** New requests go to the backlog, not into
the active sprint. Only you can override this.

### 3. User Stories — "Here's exactly what 'done' looks like"

Every piece of work is written as a user story:
> "As a business owner, I want hourly summaries so that I know what my team did."

Each story has:
- **Points** (1, 2, 3, 5, 8, 13) — how big is this?
- **Acceptance criteria** — "Given X, When Y, Then Z" — exactly what must be true
- **BDD tests** — written FIRST, describe the behavior in plain English
- **TDD tests** — written SECOND, verify the code works

If a story is 8+ points, the system suggests how to split it smaller.
Big stories are where estimates go to die.

### 4. Release Planning — "Here's what's shipping every 2 days"

Every 4 sprints (48 hours), the team:
- Looks at how fast they've been completing work (velocity)
- Picks user stories that fit in the next 48 hours
- Sets a release goal

Release notes are auto-generated from completed stories. You approve before
anything goes public.

### 5. Definition of Done — "It's not done until..."

Nothing counts as "done" unless ALL of these are true:
- [x] All automated tests pass
- [x] Demo has a working clickable link
- [x] You (Jesse) approved it
- [x] Nothing else broke
- [x] It's documented

### 6. Tech Debt Budget — "Fix the engine, not just features"

Up to 20% of each sprint can go to fixing/improving the system itself.
Not new features — making the existing stuff better. This is how the team
compounds over time instead of accumulating cruft.

---

## Configuration (for the curious)

Everything is adjustable in `slack-agents/engine/scrum-config.json`:
- `standup.interval_minutes` — how often standups happen (default: 60)
- `sprint.length_hours` — sprint duration (default: 12)
- `release.sprints_per_release` — sprints per release (default: 4)
- `wip_limits` — max priorities and tasks per agent
- `definition_of_done` — what "done" means
- `tech_debt.max_percent_of_sprint` — tech debt budget (default: 20%)

Change a number, restart the engine. Done.

---

## Why Alistair Cockburn?

Alistair co-wrote the Agile Manifesto. His methodology (Crystal Clear) is designed
for small, high-trust teams — which is exactly what this is. His 7 principles
are baked into every part of this system:

1. **Frequent delivery** → 12h sprints, 48h releases
2. **Reflective improvement** → retros feed the improvement loop
3. **Osmotic communication** → everything visible in #management
4. **Personal safety** → blockers are system defects, never blame
5. **Focus** → WIP limits, sprint firewall
6. **Easy access to expert users** → all demos go to Jesse
7. **Technical environment** → BDD + TDD required, automated everything

---

## Files

| File | What it does |
|------|-------------|
| `engine/scrum-config.json` | All settings in one place |
| `engine/standup.js` | Hourly standup runner |
| `engine/sprint.js` | Sprint planning + review |
| `engine/releasePlanning.js` | Release planning every 48h |
| `engine/userStories.js` | User story management with BDD/TDD |
| `engine/scrumEnhancements.js` | Story splitting, firewall, release notes, tech debt |
| `engine/demoRelay.js` | Passes ALL demos to Jesse for approval |

---

## What Just Launched (for the marketing team)

The MACF now runs on a full agile operating system:
- Hourly standups with auto-escalating blockers
- 12-hour sprints with locked scope
- User stories with BDD/TDD test requirements
- 48-hour release cycles with auto-generated notes
- Velocity tracking that gets smarter over time
- Tech debt budget so the system improves itself

**The pitch:** "Your AI team now works like a real software team — standups,
sprints, demos, retros. You approve everything. It runs 24/7."
