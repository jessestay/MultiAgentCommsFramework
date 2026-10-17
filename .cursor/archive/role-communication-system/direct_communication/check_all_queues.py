#!/usr/bin/env python
"""
Script to check message queues for all roles.
"""

import os
import sys
import argparse

# Add the parent directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from direct_communication.channel import DirectCommunicationChannel

def main():
    """Check message queues for all roles."""
    parser = argparse.ArgumentParser(description="Check message queues for all roles")
    parser.add_argument("--mark-read", action="store_true", help="Mark messages as read after displaying")
    parser.add_argument("--filter", help="Filter messages by metadata key:value (e.g., priority:urgent)")
    args = parser.parse_args()
    
    # Create a channel instance
    channel = DirectCommunicationChannel()
    
    # List of roles to check
    roles = ["ES", "SET", "MD", "SMM", "CTW", "BIC", "UFL", "DLC", "SE", "DRC"]
    
    # Parse filter if provided
    filter_key = None
    filter_value = None
    if args.filter:
        try:
            filter_key, filter_value = args.filter.split(":")
        except ValueError:
            print(f"Invalid filter format: {args.filter}. Expected format: key:value")
            return
    
    # Check each role's queue
    for role in roles:
        messages = channel.get_messages(role, mark_as_read=args.mark_read)
        
        if not messages:
            print(f"\n{role}: No messages found.")
            continue
        
        # Filter messages if filter is provided
        if filter_key and filter_value:
            filtered_messages = []
            for message in messages:
                if message.get("metadata") and message["metadata"].get(filter_key) == filter_value:
                    filtered_messages.append(message)
            messages = filtered_messages
        
        if not messages:
            print(f"\n{role}: No messages matching filter: {filter_key}:{filter_value}")
            continue
        
        print(f"\n{role}: Found {len(messages)} messages:")
        
        for i, message in enumerate(messages, 1):
            print(f"\nMessage {i}/{len(messages)}:")
            print(f"ID: {message['id']}")
            print(f"From: {message['source_role']}")
            print(f"To: {message['target_role']}")
            print(f"Time: {message['timestamp']}")
            print(f"Read: {'Yes' if message['read'] else 'No'}")
            
            # Display metadata if available
            if message.get("metadata"):
                print("Metadata:")
                for key, value in message["metadata"].items():
                    print(f"  {key}: {value}")
            
            print("Content:")
            print("-" * 40)
            print(message['content'])
            print("-" * 40)
            
            if args.mark_read and not message['read']:
                print(f"Marked message {message['id']} as read.")

if __name__ == "__main__":
    main() 