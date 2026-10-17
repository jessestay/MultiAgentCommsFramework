#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Test script for direct communication between ES and SET roles.
This script demonstrates how roles can communicate directly with each other.
"""

import os
import json
import uuid
from datetime import datetime
from pathlib import Path

class DirectCommunication:
    """Simple implementation of direct communication between roles."""
    
    def __init__(self):
        """Initialize the direct communication system."""
        self.base_dir = Path("direct_communication")
        self.queues_dir = self.base_dir / "queues"
        self.history_dir = self.base_dir / "history"
        
        # Create directories if they don't exist
        self.queues_dir.mkdir(parents=True, exist_ok=True)
        self.history_dir.mkdir(parents=True, exist_ok=True)
        
        print(f"Direct communication system initialized.")
        print(f"Queues directory: {self.queues_dir}")
        print(f"History directory: {self.history_dir}")
    
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
        
        if mark_as_read:
            for message in queue:
                message["read"] = True
            
            with open(queue_file, 'w', encoding='utf-8') as f:
                json.dump(queue, f, indent=2)
        
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

def test_es_to_set():
    """Test sending a message from ES to SET."""
    comm = DirectCommunication()
    
    # ES sends a message to SET
    message = """
[ES]: @SET: I need your assistance with implementing a new feature in our system. 
The Marketing Director has requested a tool for tracking campaign performance. 
Could you please provide an estimate of how long this would take to implement?

Best regards,
Executive Secretary
"""
    
    comm.send_message("ES", "SET", message)
    
    # Check SET's queue
    messages = comm.get_messages("SET", mark_as_read=False)
    print(f"\nSET has {len(messages)} messages in queue:")
    for i, msg in enumerate(messages, 1):
        print(f"\nMessage {i}:")
        print(f"From: {msg['source_role']}")
        print(f"To: {msg['target_role']}")
        print(f"Time: {msg['timestamp']}")
        print(f"Read: {msg['read']}")
        print("Content:")
        print("-" * 50)
        print(msg['content'])
        print("-" * 50)

def test_set_to_es():
    """Test sending a message from SET to ES."""
    comm = DirectCommunication()
    
    # SET sends a message to ES
    message = """
[SET]: @ES: Thank you for your request regarding the campaign performance tracking tool.

Based on our initial analysis, implementing this feature would take approximately:
- 2 weeks for basic functionality
- 4 weeks for a comprehensive solution with analytics

Would you like us to proceed with development? If so, which version would the Marketing Director prefer?

Best regards,
Software Engineering Team
"""
    
    comm.send_message("SET", "ES", message)
    
    # Check ES's queue
    messages = comm.get_messages("ES", mark_as_read=False)
    print(f"\nES has {len(messages)} messages in queue:")
    for i, msg in enumerate(messages, 1):
        print(f"\nMessage {i}:")
        print(f"From: {msg['source_role']}")
        print(f"To: {msg['target_role']}")
        print(f"Time: {msg['timestamp']}")
        print(f"Read: {msg['read']}")
        print("Content:")
        print("-" * 50)
        print(msg['content'])
        print("-" * 50)

def main():
    """Run the direct communication tests."""
    print("Testing direct communication between ES and SET roles...\n")
    
    # Test ES to SET communication
    print("\n=== Testing ES to SET communication ===\n")
    test_es_to_set()
    
    # Test SET to ES communication
    print("\n=== Testing SET to ES communication ===\n")
    test_set_to_es()
    
    print("\nDirect communication tests completed successfully.")

if __name__ == "__main__":
    main() 