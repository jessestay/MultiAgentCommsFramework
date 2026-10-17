#!/usr/bin/env python
"""
Script to demonstrate the notification system for urgent messages.
"""

import os
import sys
import time
import argparse
import threading
from datetime import datetime

# Add the parent directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from direct_communication.channel import DirectCommunicationChannel

def poll_for_messages(role, interval=2, max_polls=10):
    """Poll for messages for a role."""
    channel = DirectCommunicationChannel()
    
    print(f"\n[Notification System] Starting to poll for messages for {role}...")
    
    poll_count = 0
    while poll_count < max_polls:
        messages = channel.get_messages(role, mark_as_read=False)
        unread_messages = [msg for msg in messages if not msg["read"]]
        
        if unread_messages:
            print(f"\n[Notification System] {len(unread_messages)} new message(s) for {role}!")
            
            for message in unread_messages:
                priority = "URGENT" if message.get("metadata") and message["metadata"].get("priority") == "urgent" else "Normal"
                print(f"\n[Notification] {priority} message from {message['source_role']}:")
                print(f"Subject: {message['content'].split('\n')[0] if '\n' in message['content'] else 'No subject'}")
                print(f"Time: {message['timestamp']}")
                
                # Mark as read
                message["read"] = True
            
            # Save the updated queue
            channel.save_queue(role, messages)
        
        poll_count += 1
        time.sleep(interval)
    
    print(f"\n[Notification System] Polling completed for {role} after {poll_count} polls.")

def main():
    """Demonstrate the notification system for urgent messages."""
    parser = argparse.ArgumentParser(description="Demonstrate the notification system")
    parser.add_argument("--roles", nargs="+", default=["ES", "MD", "SMM", "CTW", "BIC"], 
                        help="Roles to monitor for notifications")
    parser.add_argument("--interval", type=int, default=2, help="Polling interval in seconds")
    parser.add_argument("--max-polls", type=int, default=10, help="Maximum number of polls")
    args = parser.parse_args()
    
    print("\n=== Notification System Demonstration ===")
    print("This demonstration shows how roles would be notified of new messages.")
    print("In a real implementation, this would be integrated with a proper notification system.")
    print(f"Monitoring roles: {', '.join(args.roles)}")
    print(f"Press Ctrl+C to stop the demonstration.\n")
    
    # Create threads for each role
    threads = []
    for role in args.roles:
        thread = threading.Thread(target=poll_for_messages, args=(role, args.interval, args.max_polls))
        threads.append(thread)
        thread.start()
    
    # Wait for all threads to complete
    for thread in threads:
        thread.join()
    
    print("\nNotification system demonstration completed.")
    print("In a real implementation, notifications would be delivered via appropriate channels.")
    print("(e.g., email, SMS, push notifications, etc.)")

if __name__ == "__main__":
    main() 