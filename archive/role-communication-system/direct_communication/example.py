#!/usr/bin/env python
"""
Example script demonstrating how to use the direct communication system.
"""

import os
import sys
import time
import argparse

# Add the parent directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from direct_communication.channel import DirectCommunicationChannel
from direct_communication.client import DirectCommunicationClient

def send_message_example():
    """Example of sending a message."""
    print("=== Sending a Message Example ===")
    
    # Create a channel instance
    channel = DirectCommunicationChannel()
    
    # Send a message from SET to ES
    message_id = channel.send_message("SET", "ES", "Hello, this is a test message from the example script.")
    
    print(f"Message sent with ID: {message_id}")
    print()

def read_messages_example():
    """Example of reading messages."""
    print("=== Reading Messages Example ===")
    
    # Create a channel instance
    channel = DirectCommunicationChannel()
    
    # Get messages for ES
    messages = channel.get_messages("ES", mark_as_read=False)
    
    if not messages:
        print("No messages found.")
    else:
        print(f"Found {len(messages)} messages:")
        for i, message in enumerate(messages, 1):
            print(f"\nMessage {i}/{len(messages)}:")
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

def client_example():
    """Example of using the client."""
    print("=== Client Example ===")
    
    # Create a client for SET
    client = DirectCommunicationClient("SET")
    
    # Send a message to ES
    message_id = client.send_message("ES", "Hello, this is a test message from the SET client.")
    
    print(f"Message sent with ID: {message_id}")
    print()
    
    # Get messages for SET
    messages = client.get_messages(mark_as_read=False)
    
    if not messages:
        print("No messages found for SET.")
    else:
        print(f"Found {len(messages)} messages for SET:")
        for i, message in enumerate(messages, 1):
            print(f"\nMessage {i}/{len(messages)}:")
            print(client.format_message_for_display(message))
    
    print()

def polling_example():
    """Example of polling for messages."""
    print("=== Polling Example ===")
    print("Polling for messages for ES (press Ctrl+C to stop)...")
    
    # Create a channel instance
    channel = DirectCommunicationChannel()
    
    def message_callback(messages):
        """Callback function for new messages."""
        for message in messages:
            print("\nNew message received:")
            print(f"From: {message['source_role']}")
            print(f"Content: {message['content']}")
    
    try:
        # Poll for messages for ES with a 2-second interval, for a maximum of 5 polls
        channel.poll_for_messages("ES", interval=2, callback=message_callback, max_polls=5)
    except KeyboardInterrupt:
        print("\nPolling stopped.")
    
    print()

def main():
    """Run the examples."""
    parser = argparse.ArgumentParser(description="Direct Communication System Examples")
    parser.add_argument("--all", action="store_true", help="Run all examples")
    parser.add_argument("--send", action="store_true", help="Run the send message example")
    parser.add_argument("--read", action="store_true", help="Run the read messages example")
    parser.add_argument("--client", action="store_true", help="Run the client example")
    parser.add_argument("--poll", action="store_true", help="Run the polling example")
    
    args = parser.parse_args()
    
    # If no arguments are provided, show help
    if not any(vars(args).values()):
        parser.print_help()
        return
    
    # Run the requested examples
    if args.all or args.send:
        send_message_example()
    
    if args.all or args.read:
        read_messages_example()
    
    if args.all or args.client:
        client_example()
    
    if args.all or args.poll:
        polling_example()

if __name__ == "__main__":
    main() 