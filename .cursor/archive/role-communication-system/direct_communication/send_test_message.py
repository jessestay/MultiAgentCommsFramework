#!/usr/bin/env python
"""
Script to send a test message using the DirectCommunicationChannel.
This demonstrates proper message encoding and sending.
"""

import os
import sys
import uuid
from datetime import datetime
import json

# Add the parent directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from direct_communication.channel import DirectCommunicationChannel
from direct_communication.utils import read_file_content

def main():
    """Send a test message from SET to ES using the DirectCommunicationChannel."""
    # Create a channel instance
    channel = DirectCommunicationChannel()
    
    # Get the absolute path to the test message file
    script_dir = os.path.dirname(os.path.abspath(__file__))
    test_message_path = os.path.join(script_dir, "test_message.txt")
    
    # Read the test message content
    message_content = read_file_content(test_message_path)
    
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
    
    # Send the message
    channel.send_message("SET", "ES", message_content)
    
    print(f"Test message sent from SET to ES")
    print("Message content:")
    print("-" * 40)
    print(message_content)
    print("-" * 40)
    
    # Verify the message was added to the queue
    es_queue = channel.get_queue("ES")
    print(f"ES queue now contains {len(es_queue)} messages")

if __name__ == "__main__":
    main() 