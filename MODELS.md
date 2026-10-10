# Switching AI Models — Plain English Guide

Your MACF team can use different AI models. Think of it like choosing an engine for your car — same car, different power and cost.

## The Three Tiers

Your team uses three levels of AI:

- **Quick** — for simple stuff (quick replies, reminders, health checks)
- **Smart** — for real work (writing, planning, using tools, making things)
- **Best** — for the hardest tasks (rarely used)

Each tier can use a different model. You pick what fits your budget.

## The Default (Free)

Out of the box, everything is free:
- Quick uses a model running on your own computer (cost: $0)
- Smart uses a free model from the internet (cost: $0, but sometimes slow or unreliable)
- Best uses a paid model only when absolutely needed

This works. It's just not always fast or reliable on the Smart tier.

## Upgrading (Paid — About $1/Month)

If you want the team to be faster and more reliable, you can pay a tiny amount for better models.

**Step 1:** Go to https://openrouter.ai and create an account.

**Step 2:** Add $10 in credits (Settings → Billing). At ~$1/month usage, this lasts about 10 months. You can set a monthly spending limit so it never surprises you.

**Step 3:** Copy your API key from https://openrouter.ai/keys.

**Step 4:** Open `slack-agents/config/models.yaml` in a text editor. The smart tier is already configured to use DeepSeek V4 Flash (paid) first, with free fallbacks. You don't need to change anything.

**Step 5:** Add your API key to the `.env` file:
```
OPENROUTER_API_KEY=your-key-here
```

**Step 6:** Restart the engine. Done.

The team now uses the paid model first (~$1/month). If it ever fails, it automatically falls back to Claude Haiku, then to the free tier. You don't have to think about it.

## How Much Will It Cost?

For a team doing about 50 tasks per day:

| Model | Cost/Month | Good For |
|-------|-----------|----------|
| Free (default) | $0 | Getting started, light use |
| DeepSeek V4 Flash | ~$1 | Best value. Great at tools. |
| Claude Haiku 5.5 | ~$2-3 | Very reliable, brand new |
| Claude Sonnet 5.5 | ~$48 | Only if you need the smartest |

Most people should start with DeepSeek V4 Flash. It's the cheapest option that actually works well.

The smart tier is pre-configured to try DeepSeek V4 Flash first, then Haiku 5.5, then free. Just add your OpenRouter key and you're done.

## Switching Back

To go back to free: put the `#` back on the paid model lines in `models.yaml` and restart. That's it.

## For Developers

The full technical details are in `ARCHITECTURE.md` under "Product Architecture." The BDD tests proving model switching works are in `slack-agents/engine/tests/modelRouter.test.js`.
