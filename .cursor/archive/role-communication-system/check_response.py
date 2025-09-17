#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Script to check for new responses from SET.
"""

import os
import json
from pathlib import Path
import time

def check_for_new_messages(role="ES", source_role="SET", max_checks=5, interval=5):
    """Check for new messages from a specific source role."""
    base_dir = Path("direct_communication")
    queues_dir = base_dir / "queues"
    queue_file = queues_dir / f"{role.lower()}_queue.json"
    
    if not queue_file.exists():
        print(f"No queue file found for {role}")
        return
    
    print(f"Checking for new messages from {source_role} to {role}...")
    print(f"Will check {max_checks} times with {interval} second intervals.")
    print()
    
    last_message_count = 0
    
    for i in range(max_checks):
        with open(queue_file, 'r', encoding='utf-8') as f:
            try:
                queue = json.load(f)
            except json.JSONDecodeError:
                print(f"Error reading queue file for {role}")
                return
        
        # Filter messages from the source role
        messages_from_source = [msg for msg in queue if msg["source_role"] == source_role]
        
        if len(messages_from_source) > last_message_count:
            # New messages found
            new_messages = messages_from_source[last_message_count:]
            print(f"Found {len(new_messages)} new message(s) from {source_role}:")
            
            for msg in new_messages:
                print("\n" + "=" * 50)
                print(f"From: {msg['source_role']}")
                print(f"To: {msg['target_role']}")
                print(f"Time: {msg['timestamp']}")
                print(f"Read: {msg['read']}")
                print("Content:")
                print("-" * 50)
                print(msg['content'])
                print("-" * 50)
            
            # Update last message count
            last_message_count = len(messages_from_source)
            
            # Mark messages as read
            for msg in queue:
                if msg["source_role"] == source_role and not msg["read"]:
                    msg["read"] = True
            
            with open(queue_file, 'w', encoding='utf-8') as f:
                json.dump(queue, f, indent=2)
            
            print(f"Marked messages as read.")
        else:
            print(f"Check {i+1}/{max_checks}: No new messages from {source_role}.")
        
        if i < max_checks - 1:
            print(f"Waiting {interval} seconds before next check...")
            time.sleep(interval)
    
    print("\nFinished checking for messages.")

if __name__ == "__main__":
    check_for_new_messages(role="ES", source_role="SET", max_checks=3, interval=10) 