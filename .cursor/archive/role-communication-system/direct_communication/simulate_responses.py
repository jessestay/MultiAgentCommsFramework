#!/usr/bin/env python
"""
Script to simulate responses from different roles to an urgent message.
"""

import os
import sys
import argparse
from datetime import datetime, timedelta

# Add the parent directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from direct_communication.channel import DirectCommunicationChannel

def main():
    """Simulate responses from different roles to an urgent message."""
    parser = argparse.ArgumentParser(description="Simulate responses from different roles")
    parser.add_argument("--original-id", help="ID of the original message to respond to")
    args = parser.parse_args()
    
    # Create a channel instance
    channel = DirectCommunicationChannel()
    
    # Define role responses
    responses = {
        "MD": """
# RE: URGENT: Fundraising Target - $3,000 by Monday

Dear Executive Secretary,

I've prepared a comprehensive social media campaign strategy to help us reach our $3,000 fundraising goal by Monday:

## Campaign Strategy:
1. Create urgency-focused graphics highlighting the Monday deadline
2. Develop a series of testimonials from beneficiaries
3. Design a progress tracker to show real-time donation amounts
4. Prepare email templates for our subscriber list

All materials will be ready by tomorrow morning for review. I've coordinated with the Social Media Manager to ensure immediate deployment once approved.

Please let me know if you need any adjustments to this plan.

Marketing Director
""",
        "SMM": """
# RE: URGENT: Fundraising Target - $3,000 by Monday

Dear Executive Secretary,

I've scheduled an intensive social media campaign across all our platforms to meet the $3,000 fundraising goal:

## Platform Schedule:
- Facebook: 3 posts daily (9am, 1pm, 6pm)
- Instagram: 5 stories + 2 posts daily
- Twitter: Hourly tweets during peak hours
- LinkedIn: 2 professional appeals daily
- TikTok: 3 trending videos with donation links

I've also activated our influencer network for amplification and set up real-time analytics to track conversion rates.

The first wave of posts will go live within 2 hours.

Social Media Manager
""",
        "CTW": """
# RE: URGENT: Fundraising Target - $3,000 by Monday

Dear Executive Secretary,

I've drafted compelling fundraising copy for all channels to help us reach our $3,000 goal:

## Copy Deliverables:
1. Email campaign series (3 emails with escalating urgency)
2. Landing page copy with emotional appeal and clear CTA
3. Social media captions optimized for each platform
4. SMS campaign messages (160 characters, with urgency triggers)
5. Script for video appeal from our director

All copy emphasizes the deadline, creates urgency, and focuses on impact storytelling. I've incorporated proven conversion phrases and psychological triggers for maximum effectiveness.

The complete package will be delivered to all team members within 3 hours.

Copy/Technical Writer
""",
        "BIC": """
# RE: URGENT: Fundraising Target - $3,000 by Monday

Dear Executive Secretary,

Here are my strategic recommendations to maximize donations and reach our $3,000 goal by Monday:

## Fundraising Strategies:
1. Implement tiered donation matching for the first $1,500
2. Create time-limited donation multipliers (2x impact for next 4 hours)
3. Deploy the "Power Hour" technique (focus all team efforts on a single hour)
4. Activate our major donor network with personalized outreach
5. Implement social proof notifications showing recent donations

I've also prepared a contingency plan if we're falling short by Sunday evening, including rapid response tactics that have proven effective in previous campaigns.

I'll personally monitor progress throughout the weekend and provide real-time strategy adjustments as needed.

Business Income Coach
"""
    }
    
    # Reference to original message in metadata
    metadata = {
        "in_response_to": args.original_id if args.original_id else "urgent_fundraising_message",
        "response_time": str(timedelta(hours=4, minutes=30)),  # Simulated response time
        "category": "fundraising"
    }
    
    # Send responses from each role
    for role, response in responses.items():
        message_id = channel.send_message(role, "ES", response, metadata)
        print(f"Response sent from {role} to ES with ID: {message_id}")
    
    print("\nAll role responses have been simulated and sent to ES.")
    print("You can now check the ES queue to see the responses.")

if __name__ == "__main__":
    main() 