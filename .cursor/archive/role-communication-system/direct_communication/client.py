import os
import sys
import argparse
import json
import time
import logging
from datetime import datetime
from .channel import DirectCommunicationChannel
from .utils import get_role_abbreviation, get_full_role_name, ensure_directory_exists

# Set up logging
base_dir = os.path.dirname(os.path.abspath(__file__))
logs_dir = os.path.join(base_dir, "logs")
ensure_directory_exists(logs_dir)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(logs_dir, "client.log")),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("DirectCommunicationClient")

class DirectCommunicationClient:
    """
    Client interface for the DirectCommunicationChannel.
    """
    
    def __init__(self, role, base_dir="direct_communication"):
        """
        Initialize the client with a role.
        
        Args:
            role (str): The role this client represents
            base_dir (str, optional): Base directory for the communication channel
        """
        self.role = get_role_abbreviation(role.upper())
        self.channel = DirectCommunicationChannel(base_dir)
        logger.info(f"DirectCommunicationClient initialized for role: {self.role}")
    
    def send_message(self, target_role, content, metadata=None):
        """
        Send a message to another role.
        
        Args:
            target_role (str): The role to send the message to
            content (str): The message content
            metadata (dict, optional): Additional metadata for the message
            
        Returns:
            str: The ID of the sent message
        """
        return self.channel.send_message(self.role, target_role, content, metadata)
    
    def get_messages(self, mark_as_read=True):
        """
        Get all messages for this role.
        
        Args:
            mark_as_read (bool, optional): Whether to mark messages as read
            
        Returns:
            list: List of messages
        """
        return self.channel.get_messages(self.role, mark_as_read)
    
    def clear_queue(self):
        """
        Clear the message queue for this role.
        
        Returns:
            int: Number of messages cleared
        """
        return self.channel.clear_queue(self.role)
    
    def get_conversation_history(self, other_role):
        """
        Get the conversation history with another role.
        
        Args:
            other_role (str): The other role in the conversation
            
        Returns:
            list: List of messages in the conversation
        """
        return self.channel.get_conversation_history(self.role, other_role)
    
    def poll_for_messages(self, interval=5, callback=None, max_polls=None):
        """
        Poll for new messages.
        
        Args:
            interval (int, optional): Polling interval in seconds
            callback (callable, optional): Function to call with new messages
            max_polls (int, optional): Maximum number of polls (None for infinite)
            
        Returns:
            None
        """
        return self.channel.poll_for_messages(self.role, interval, callback, max_polls)
    
    def send_message_from_file(self, target_role, file_path, metadata=None):
        """
        Send a message from a file.
        
        Args:
            target_role (str): The role to send the message to
            file_path (str): Path to the file containing the message
            metadata (dict, optional): Additional metadata for the message
            
        Returns:
            str: The ID of the sent message
        """
        return self.channel.send_message_from_file(self.role, target_role, file_path, metadata)
    
    def format_message_for_display(self, message):
        """
        Format a message for display.
        
        Args:
            message (dict): The message to format
            
        Returns:
            str: Formatted message
        """
        source_role = get_full_role_name(message["source_role"])
        target_role = get_full_role_name(message["target_role"])
        timestamp = datetime.fromisoformat(message["timestamp"]).strftime("%Y-%m-%d %H:%M:%S")
        
        header = f"From: {source_role} ({message['source_role']})\n"
        header += f"To: {target_role} ({message['target_role']})\n"
        header += f"Time: {timestamp}\n"
        header += f"ID: {message['id']}\n"
        header += "-" * 50 + "\n"
        
        return header + message["content"] + "\n" + "-" * 50

def main():
    """Command-line interface for the DirectCommunicationClient."""
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