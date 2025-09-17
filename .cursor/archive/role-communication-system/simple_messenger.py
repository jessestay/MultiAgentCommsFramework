#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Simple Messenger - A basic tool for direct role-to-role communication.
"""

import os
import json
import uuid
import argparse
from datetime import datetime
from pathlib import Path

def send_message(source_role, target_role, content):
    """Send a message from source_role to target_role."""
    # Create directories if they don't exist
    base_dir = Path("direct_communication")
    queues_dir = base_dir / "queues"
    queues_dir.mkdir(parents=True, exist_ok=True)
    
    # Create message object
    message = {
        "id": str(uuid.uuid4()),
        "source_role": source_role,
        "target_role": target_role,
        "content": content,
        "timestamp": datetime.now().isoformat(),
        "read": False
    }
    
    # Save to target's queue
    queue_file = queues_dir / f"{target_role.lower()}_queue.json"
    
    # Read existing queue or create new one
    if queue_file.exists():
        with open(queue_file, 'r', encoding='utf-8') as f:
            try:
                queue = json.load(f)
            except json.JSONDecodeError:
                queue = []
    else:
        queue = []
    
    # Add message to queue
    queue.append(message)
    
    # Save queue
    with open(queue_file, 'w', encoding='utf-8') as f:
        json.dump(queue, f, indent=2)
    
    print(f"Message sent from {source_role} to {target_role} with ID: {message['id']}")
    return message["id"]

def receive_messages(role, mark_as_read=True):
    """Receive messages for a role."""
    # Create directories if they don't exist
    base_dir = Path("direct_communication")
    queues_dir = base_dir / "queues"
    queues_dir.mkdir(parents=True, exist_ok=True)
    
    # Get queue file
    queue_file = queues_dir / f"{role.lower()}_queue.json"
    
    if not queue_file.exists():
        print(f"No messages found for {role}")
        return []
    
    # Read queue
    with open(queue_file, 'r', encoding='utf-8') as f:
        try:
            queue = json.load(f)
        except json.JSONDecodeError:
            print(f"Error reading queue file for {role}")
            return []
    
    # Mark messages as read if requested
    if mark_as_read and queue:
        for message in queue:
            message["read"] = True
        
        # Save queue
        with open(queue_file, 'w', encoding='utf-8') as f:
            json.dump(queue, f, indent=2)
        
        print(f"Marked {len(queue)} messages as read for {role}")
    
    # Display messages
    if not queue:
        print(f"No messages found for {role}")
    else:
        print(f"Found {len(queue)} messages for {role}:")
        for i, message in enumerate(queue, 1):
            print(f"\nMessage {i}:")
            print(f"From: {message['source_role']}")
            print(f"To: {message['target_role']}")
            print(f"Time: {message['timestamp']}")
            print(f"Read: {message['read']}")
            print("Content:")
            print("-" * 50)
            print(message['content'])
            print("-" * 50)
    
    return queue

def main():
    """Main entry point for the simple messenger."""
    parser = argparse.ArgumentParser(description="Simple Messenger - Direct role-to-role communication")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Send command
    send_parser = subparsers.add_parser("send", help="Send a message")
    send_parser.add_argument("source", help="Source role (e.g., ES, SET)")
    send_parser.add_argument("target", help="Target role (e.g., ES, SET)")
    send_parser.add_argument("message", help="Message content")
    
    # Receive command
    receive_parser = subparsers.add_parser("receive", help="Receive messages")
    receive_parser.add_argument("role", help="Role to receive messages for (e.g., ES, SET)")
    receive_parser.add_argument("--no-mark-read", action="store_true", help="Don't mark messages as read")
    
    args = parser.parse_args()
    
    if args.command == "send":
        send_message(args.source, args.target, args.message)
    
    elif args.command == "receive":
        receive_messages(args.role, not args.no_mark_read)
    
    else:
        parser.print_help()

if __name__ == "__main__":
    main() 