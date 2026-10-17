#!/usr/bin/env python3
"""
Script to send urgent messages to roles using the role communication system.
"""

import os
import sys
import logging
from pathlib import Path

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from src.role_communication import RoleCommunicationManager

# Configure logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)

logger = logging.getLogger("UrgentMessages")

def main():
    """Send urgent messages to roles."""
    # Create directories if they don't exist
    os.makedirs("conversations/ES", exist_ok=True)
    os.makedirs("conversations/SET", exist_ok=True)
    os.makedirs("conversations/BIC", exist_ok=True)
    os.makedirs("conversations/MD", exist_ok=True)
    
    # Create role communication manager
    manager = RoleCommunicationManager(base_dir="conversations")
    
    # Register roles
    manager.register_role("ES")
    manager.register_role("SET")
    manager.register_role("BIC")
    manager.register_role("MD")
    
    # Start monitoring
    manager.start_monitoring(interval=1.0)
    
    try:
        # Message to Software Engineering Team
        set_message = """We have an urgent priority to help Jesse raise $3,000 by Monday. One of our key strategies is to create a landing page for selling our AI Communication System as a package for businesses.

Project Requirements:
- Product: AI Role Communication Automation System
- Price Point: $997-$1,997 per client
- Target Audience: Business owners looking to automate communication and workflows
- Core Value Proposition: "Automate your business communication with a team of specialized AI roles"

Technical Requirements:
1. Responsive landing page with modern design
2. Stripe payment integration
3. Email capture for leads
4. Clear explanation of the system's benefits
5. Demonstration of how the roles communicate

Verification Requirements:
- Actual code files (HTML, CSS, JS)
- Working deployment with accessible URL
- Evidence of development progress
- Functional payment processing (test mode)

Timeline:
- Initial design concepts: ASAP (today if possible)
- Working prototype: Within 24 hours
- Payment integration: Within 48 hours
- Final delivery: Before Monday

Jesse emphasizes automation in all our work. Please implement:
- Automated email follow-ups for leads
- Automated onboarding process for new clients
- Automated demonstration of the role communication system

This is our highest priority project as it directly impacts our ability to meet the Monday deadline for raising $3,000."""

        # Send message to SET
        message_id = manager.send_message("ES", "SET", set_message)
        logger.info(f"Message sent to SET with ID: {message_id}")
        
        # Message to Business Income Coach
        bic_message = """We have an urgent priority to help Jesse raise $3,000 by Monday for rent. Jesse has indicated that he trusts your advice on prioritizing income streams.

Current Income Streams (In Order of Priority):

1. AI Communication System Package (New Opportunity)
   - Packaging our role-based communication system for businesses
   - Price point: $997-$1,997 per client
   - SET is creating a landing page with payment processing

2. AI Consulting Quick Sales
   - $497 AI Automation Audits
   - Potential to convert to $1,500-$5,000/month retainers
   - Need automated LinkedIn outreach strategy

3. "For Dummies" Book Funnel
   - Current conversion rate: 2.5% (below 3-5% industry average)
   - Need optimization of ads and landing pages
   - Opportunity for abandoned cart recovery

4. TikTok Shop & Sponsorships
   - Digital product listings
   - Brand outreach via Apollo.io & Phantombuster
   - Potential for quick sponsorship deals

5. Blobless ($BLS) Meme Coin
   - 5,093,719 $BLS holdings
   - Potential for liquidity or exchange listings

Jesse emphasizes automation in all our work. Please prioritize:
- Automated outreach systems
- Automated follow-up sequences
- Automated payment processing
- Minimizing manual intervention

Please:
1. Review and confirm this prioritization of income streams
2. Develop a specific financial strategy to reach the $3,000 goal by Monday
3. Identify any quick-win opportunities we may have missed
4. Provide specific automation recommendations for each income stream"""

        # Send message to BIC
        message_id = manager.send_message("ES", "BIC", bic_message)
        logger.info(f"Message sent to BIC with ID: {message_id}")
        
        # Message to Marketing Director
        md_message = """We have an urgent priority to help Jesse raise $3,000 by Monday for rent. We need your expertise to optimize our marketing campaigns for immediate revenue generation.

Priority Marketing Campaigns:

1. AI Communication System Package (New Opportunity)
   - Target audience: Business owners looking to automate communication
   - Value proposition: "Automate your business communication with specialized AI roles"
   - SET is creating a landing page with payment processing
   - Need: Ad campaign strategy for quick conversions

2. AI Consulting Services
   - $497 AI Automation Audits with potential for larger retainers
   - Target audience: Business owners struggling with AI implementation
   - Need: Optimized ad targeting and messaging

3. "For Dummies" Book Funnel
   - Current conversion rate: 2.5% (below industry average)
   - Need: A/B testing strategy for landing pages and ad creative
   - Opportunity: Abandoned cart recovery campaign

Please provide:
1. Optimized ad campaign strategies for these offerings
2. Recommendations for quick-win marketing tactics
3. Automated marketing workflows to minimize manual intervention
4. Budget allocation recommendations for maximum ROI

We need to implement these strategies immediately to meet our Monday deadline."""

        # Send message to MD
        message_id = manager.send_message("ES", "MD", md_message)
        logger.info(f"Message sent to MD with ID: {message_id}")
        
        print("\n===== URGENT MESSAGES SENT SUCCESSFULLY =====")
        print("Messages have been sent to:")
        print("- Software Engineering Team (SET)")
        print("- Business Income Coach (BIC)")
        print("- Marketing Director (MD)")
        print("\nThe role communication system is now monitoring for responses.")
        print("You can check for responses using the check_responses.py script.")
        
    except Exception as e:
        logger.error(f"Error sending messages: {e}")
    finally:
        # Stop monitoring after a delay to allow processing
        import time
        time.sleep(5)
        manager.stop_monitoring()

if __name__ == "__main__":
    main() 