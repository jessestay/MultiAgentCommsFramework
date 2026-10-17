#!/usr/bin/env python3
import os

# Create templates directory structure
os.makedirs("templates/email_templates", exist_ok=True)

# Create client outreach template file
template_content = """# Emergency Client Outreach Templates

## 48-Hour Special Offer Template

```
Subject: [URGENT] Special 48-Hour Offer Just For You

Hi [Name],

I've just opened up [X] emergency spots for my [Service Package] ($XXX).

This is specifically for business owners who need [key benefit] right away, and I immediately thought of you.

Here's what you'll get:
• [Deliverable 1]
• [Deliverable 2]
• [Deliverable 3]

Normal turnaround for this is 2 weeks, but I'm guaranteeing delivery within [timeframe] for these special spots.

If you're interested, just reply "I'm in" and I'll send payment details. These spots will be gone by [deadline].

Best,
Jesse
```

## Personalization Guidelines

1. **[Name]**: Use the client's first name
2. **[X]**: Use a small number (3-5) to create scarcity
3. **[Service Package]**: Insert specific package name
4. **[key benefit]**: Focus on their specific pain point
5. **[Deliverable]**: Be specific about what they'll receive
6. **[timeframe]**: Be specific (24 hours, 48 hours)
7. **[deadline]**: Create urgency (tomorrow, Sunday at 5pm)

## Package-Specific Templates

### AI Automation Quick-Win Audit ($497)

```
Subject: [URGENT] 48-Hour AI Automation Audit Opportunity

Hi [Name],

I've just opened up 3 emergency spots for my AI Automation Quick-Win Audit ($497).

This is specifically for business owners who need to eliminate time-wasting manual processes right away, and I immediately thought of you.

Here's what you'll get:
• 60-minute video call to analyze your current workflows
• Custom report identifying 3-5 immediate automation opportunities
• Step-by-step implementation guide for each automation

Normal turnaround for this is 2 weeks, but I'm guaranteeing delivery within 24 hours for these special spots.

If you're interested, just reply "I'm in" and I'll send payment details. These spots will be gone by tomorrow at 5pm.

Best,
Jesse
```

### Facebook/Instagram Ads Rescue ($997)

```
Subject: [URGENT] 48-Hour Facebook Ads Rescue Package

Hi [Name],

I've just opened up 3 emergency spots for my Facebook/Instagram Ads Rescue package ($997).

This is specifically for business owners who need to fix underperforming ad campaigns right away, and I immediately thought of you.

Here's what you'll get:
• Complete audit of your existing ad account
• Detailed optimization plan to improve ROAS
• 3 new high-converting ad creatives ready to launch

Normal turnaround for this is 2 weeks, but I'm guaranteeing delivery within 48 hours for these special spots.

If you're interested, just reply "I'm in" and I'll send payment details. These spots will be gone by Sunday at 5pm.

Best,
Jesse
```
"""

with open("templates/email_templates/client_outreach.md", "w") as f:
    f.write(template_content)

print("Template directory and client outreach template created successfully.") 