#!/usr/bin/env python
"""
Command-line interface for the Direct Communication System.
This script allows roles to communicate directly with each other.
"""

import os
import sys
import argparse
from client import DirectCommunicationClient

def main():
    """Main entry point for the command-line interface."""
    parser = argparse.ArgumentParser(description="Direct Communication Client")
    parser.add_argument("role", help="Your role (e.g., ES, SET)")
    
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Send message command
    send_parser = subparsers.add_parser("send", help="Send a message")
    send_parser.add_argument("target_role", help="Target role")
    send_parser.add_argument("message", help="Message content")
    
    # Send message from file command
    send_file_parser = subparsers.add_parser("send-file", help="Send a message from a file")
    send_file_parser.add_argument("target_role", help="Target role")
    send_file_parser.add_argument("file_path", help="Path to the file containing the message")
    
    # Get messages command
    get_parser = subparsers.add_parser("get", help="Get messages")
    get_parser.add_argument("--no-mark-read", action="store_true", help="Don't mark messages as read")
    
    # Clear queue command
    clear_parser = subparsers.add_parser("clear", help="Clear message queue")
    
    # Get conversation history command
    history_parser = subparsers.add_parser("history", help="Get conversation history")
    history_parser.add_argument("other_role", help="Other role in the conversation")
    
    # Poll for messages command
    poll_parser = subparsers.add_parser("poll", help="Poll for new messages")
    poll_parser.add_argument("--interval", type=int, default=5, help="Polling interval in seconds")
    poll_parser.add_argument("--max-polls", type=int, help="Maximum number of polls")
    
    args = parser.parse_args()
    
    # Create client
    client = DirectCommunicationClient(args.role)
    
    # Execute command
    if args.command == "send":
        message_id = client.send_message(args.target_role, args.message)
        print(f"Message sent with ID: {message_id}")
    
    elif args.command == "send-file":
        message_id = client.send_message_from_file(args.target_role, args.file_path)
        print(f"Message sent from file with ID: {message_id}")
    
    elif args.command == "get":
        messages = client.get_messages(not args.no_mark_read)
        if not messages:
            print("No messages found.")
        else:
            for i, message in enumerate(messages, 1):
                print(f"\nMessage {i} of {len(messages)}")
                print(client.format_message_for_display(message))
    
    elif args.command == "clear":
        count = client.clear_queue()
        print(f"Cleared {count} messages from queue.")
    
    elif args.command == "history":
        messages = client.get_conversation_history(args.other_role)
        if not messages:
            print(f"No conversation history found with {args.other_role}.")
        else:
            for i, message in enumerate(messages, 1):
                print(f"\nMessage {i} of {len(messages)}")
                print(client.format_message_for_display(message))
    
    elif args.command == "poll":
        def display_message(messages):
            for message in messages:
                print("\nNew message received:")
                print(client.format_message_for_display(message))
        
        print(f"Polling for messages every {args.interval} seconds. Press Ctrl+C to stop.")
        client.poll_for_messages(args.interval, display_message, args.max_polls)
    
    else:
        parser.print_help()

if __name__ == "__main__":
    main() 