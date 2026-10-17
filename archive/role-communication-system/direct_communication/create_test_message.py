#!/usr/bin/env python
"""
Script to directly create a test message in the ES queue.
This bypasses the channel system to ensure proper encoding.
"""

import os
import sys
import uuid
from datetime import datetime
import json

def main():
    """Create a test message directly in the ES queue."""
    # Get the absolute path to the test message file
    script_dir = os.path.dirname(os.path.abspath(__file__))
    test_message_path = os.path.join(script_dir, "test_message.txt")
    queue_path = os.path.join(script_dir, "queues", "es_queue.json")
    
    # Read the test message content
    with open(test_message_path, 'r', encoding='utf-8') as f:
        message_content = f.read()
    
    # Create a message object
    message = {
        "id": str(uuid.uuid4()),
        "source_role": "SET",
        "target_role": "ES",
        "content": message_content,
        "metadata": {},
        "timestamp": datetime.now().isoformat(),
        "read": False
    }
    
    # Create the queue array with the message
    queue = [message]
    
    # Write the queue to the file
    with open(queue_path, 'w', encoding='utf-8') as f:
        json.dump(queue, f, indent=2)
    
    print(f"Test message created in ES queue with ID: {message['id']}")
    print("Message content:")
    print("-" * 40)
    print(message_content)
    print("-" * 40)

if __name__ == "__main__":
    main() 