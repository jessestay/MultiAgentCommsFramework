#!/usr/bin/env python
"""
Script to read messages from a role's queue using the DirectCommunicationChannel.
This demonstrates proper message retrieval and display.
"""

import os
import sys
import argparse
import json

# Add the parent directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from direct_communication.channel import DirectCommunicationChannel

def main():
    """Read messages from a specified role's queue."""
    parser = argparse.ArgumentParser(description="Read messages from a role's queue")
    parser.add_argument("role", help="The role whose messages to read (e.g., ES, SET)")
    parser.add_argument("--mark-read", action="store_true", help="Mark messages as read after displaying")
    args = parser.parse_args()
    
    # Create a channel instance
    channel = DirectCommunicationChannel()
    
    # Get messages for the specified role
    messages = channel.get_queue(args.role)
    
    if not messages:
        print(f"No messages found in the {args.role} queue.")
        return
    
    print(f"Found {len(messages)} messages in the {args.role} queue:")
    print()
    
    for i, message in enumerate(messages, 1):
        print(f"Message {i}/{len(messages)}:")
        print(f"ID: {message['id']}")
        print(f"From: {message['source_role']}")
        print(f"To: {message['target_role']}")
        print(f"Time: {message['timestamp']}")
        print(f"Read: {'Yes' if message['read'] else 'No'}")
        print("Content:")
        print("-" * 40)
        print(message['content'])
        print("-" * 40)
        print()
        
        # Mark as read if requested
        if args.mark_read and not message['read']:
            message['read'] = True
            print(f"Marked message {message['id']} as read.")
    
    # Save the updated queue if messages were marked as read
    if args.mark_read:
        channel.save_queue(args.role, messages)
        print(f"Updated {args.role} queue saved.")

if __name__ == "__main__":
    main() 