#!/usr/bin/env python
"""
Demonstration script for sending an urgent fundraising message.
"""

import os
import sys
import uuid
from datetime import datetime

# Add the parent directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from direct_communication.channel import DirectCommunicationChannel

def main():
    """Send an urgent fundraising message to multiple roles."""
    # Create a channel instance
    channel = DirectCommunicationChannel()
    
    # Define the urgent message
    urgent_message = """
# URGENT: Fundraising Target - $3,000 by Monday

Dear Team,

We need to coordinate our efforts to reach our fundraising goal of $3,000 by Monday. 
This is a high-priority task that requires immediate attention from all roles.

## Action Items:
1. Marketing Director: Prepare social media campaign materials
2. Social Media Manager: Schedule posts across all platforms
3. Copy/Technical Writer: Draft compelling fundraising copy
4. Business Income Coach: Provide strategies for maximizing donations

Please respond with your action plan within 24 hours.

Thank you for your immediate attention to this matter.

Executive Secretary
"""
    
    # Add metadata to indicate this is an urgent message
    metadata = {
        "priority": "urgent",
        "deadline": "Monday",
        "target_amount": 3000,
        "category": "fundraising"
    }
    
    # List of target roles
    target_roles = ["MD", "SMM", "CTW", "BIC"]
    
    # Send the message to each role
    for role in target_roles:
        message_id = channel.send_message("ES", role, urgent_message, metadata)
        print(f"Urgent message sent to {role} with ID: {message_id}")
    
    print("\nUrgent fundraising message has been sent to all relevant roles.")
    print("You can now check each role's queue to see the message.")

if __name__ == "__main__":
    main() 