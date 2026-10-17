#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Role Messenger - A simple tool for direct role-to-role communication.
This script allows roles to send and receive messages directly without user intervention.
"""

import os
import json
import uuid
import argparse
from datetime import datetime
from pathlib import Path

class RoleMessenger:
    """Simple messenger for direct role-to-role communication."""
    
    def __init__(self):
        """Initialize the role messenger."""
        self.base_dir = Path("direct_communication")
        self.queues_dir = self.base_dir / "queues"
        self.history_dir = self.base_dir / "history"
        
        # Create directories if they don't exist
        self.queues_dir.mkdir(parents=True, exist_ok=True)
        self.history_dir.mkdir(parents=True, exist_ok=True)
    
    def send_message(self, source_role, target_role, content):
        """Send a message from source_role to target_role."""
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
        queue_file = self.queues_dir / f"{target_role.lower()}_queue.json"
        
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
        
        # Save to conversation history
        self._save_to_history(source_role, target_role, message)
        
        print(f"Message sent from {source_role} to {target_role} with ID: {message['id']}")
        return message["id"]
    
    def get_messages(self, role, mark_as_read=True):
        """Get all messages for a role."""
        queue_file = self.queues_dir / f"{role.lower()}_queue.json"
        
        if not queue_file.exists():
            print(f"No messages found for {role}")
            return []
        
        with open(queue_file, 'r', encoding='utf-8') as f:
            try:
                queue = json.load(f)
            except json.JSONDecodeError:
                print(f"Error reading queue file for {role}")
                return []
        
        if mark_as_read and queue:
            for message in queue:
                message["read"] = True
            
            with open(queue_file, 'w', encoding='utf-8') as f:
                json.dump(queue, f, indent=2)
            
            print(f"Marked {len(queue)} messages as read for {role}")
        
        return queue
    
    def _save_to_history(self, source_role, target_role, message):
        """Save a message to the conversation history."""
        # Sort roles to ensure consistent file naming
        roles = sorted([source_role.lower(), target_role.lower()])
        history_file = self.history_dir / f"{roles[0]}_{roles[1]}_history.json"
        
        # Read existing history or create new one
        if history_file.exists():
            with open(history_file, 'r', encoding='utf-8') as f:
                try:
                    history = json.load(f)
                except json.JSONDecodeError:
                    history = []
        else:
            history = []
        
        # Add message to history
        history.append(message)
        
        # Save history
        with open(history_file, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=2)
    
    def get_history(self, role1, role2):
        """Get the conversation history between two roles."""
        # Sort roles to ensure consistent file naming
        roles = sorted([role1.lower(), role2.lower()])
        history_file = self.history_dir / f"{roles[0]}_{roles[1]}_history.json"
        
        if not history_file.exists():
            print(f"No conversation history found between {role1} and {role2}")
            return []
        
        with open(history_file, 'r', encoding='utf-8') as f:
            try:
                history = json.load(f)
            except json.JSONDecodeError:
                print(f"Error reading history file for {role1} and {role2}")
                return []
        
        return history
    
    def format_message(self, message):
        """Format a message for display."""
        return f"""
From: {message['source_role']}
To: {message['target_role']}
Time: {message['timestamp']}
Read: {message['read']}
Content:
{'-' * 50}
{message['content']}
{'-' * 50}
"""

def main():
    """Main entry point for the role messenger."""
    parser = argparse.ArgumentParser(description="Role Messenger - Direct role-to-role communication")
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
    
    # History command
    history_parser = subparsers.add_parser("history", help="Get conversation history")
    history_parser.add_argument("role1", help="First role (e.g., ES)")
    history_parser.add_argument("role2", help="Second role (e.g., SET)")
    
    args = parser.parse_args()
    messenger = RoleMessenger()
    
    if args.command == "send":
        messenger.send_message(args.source, args.target, args.message)
    
    elif args.command == "receive":
        messages = messenger.get_messages(args.role, not args.no_mark_read)
        if not messages:
            print(f"No messages found for {args.role}")
        else:
            print(f"Found {len(messages)} messages for {args.role}:")
            for i, message in enumerate(messages, 1):
                print(f"\nMessage {i}:")
                print(messenger.format_message(message))
    
    elif args.command == "history":
        messages = messenger.get_history(args.role1, args.role2)
        if not messages:
            print(f"No conversation history found between {args.role1} and {args.role2}")
        else:
            print(f"Found {len(messages)} messages in the conversation history between {args.role1} and {args.role2}:")
            for i, message in enumerate(messages, 1):
                print(f"\nMessage {i}:")
                print(messenger.format_message(message))
    
    else:
        parser.print_help()

if __name__ == "__main__":
    main() 