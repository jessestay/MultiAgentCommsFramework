"""
Direct Communication Channel

This module provides a simple file-based communication channel for direct
communication between roles without requiring user intervention.
"""

import os
import json
import time
import uuid
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

class DirectCommunicationChannel:
    """
    A simple file-based communication channel for direct role communication.
    
    This class provides:
    - Message queues for each role
    - Methods to send and receive messages
    - Basic polling mechanism to check for new messages
    """
    
    def __init__(self, base_dir: str = "direct_communication"):
        """
        Initialize the communication channel.
        
        Args:
            base_dir (str): Base directory for message storage
        """
        self.base_dir = base_dir
        self.queues_dir = os.path.join(base_dir, "queues")
        self.history_dir = os.path.join(base_dir, "history")
        
        # Create directories if they don't exist
        os.makedirs(self.queues_dir, exist_ok=True)
        os.makedirs(self.history_dir, exist_ok=True)
        
        logger.info(f"Initialized direct communication channel in {base_dir}")
    
    def send_message(self, source_role: str, target_role: str, content: str, 
                    metadata: Optional[Dict[str, Any]] = None) -> str:
        """
        Send a message from one role to another.
        
        Args:
            source_role (str): The role sending the message
            target_role (str): The role receiving the message
            content (str): The message content
            metadata (Dict[str, Any], optional): Additional metadata
            
        Returns:
            str: Message ID
        """
        # Create message
        message_id = str(uuid.uuid4())
        timestamp = datetime.now().isoformat()
        
        message = {
            "id": message_id,
            "source_role": source_role,
            "target_role": target_role,
            "content": content,
            "metadata": metadata or {},
            "timestamp": timestamp,
            "read": False
        }
        
        # Get queue file path
        queue_file = os.path.join(self.queues_dir, f"{target_role.lower()}_queue.json")
        
        # Load existing queue
        queue = []
        if os.path.exists(queue_file):
            try:
                with open(queue_file, 'r') as f:
                    queue = json.load(f)
            except json.JSONDecodeError:
                logger.warning(f"Error reading queue file {queue_file}, creating new queue")
        
        # Add message to queue
        queue.append(message)
        
        # Save queue
        with open(queue_file, 'w') as f:
            json.dump(queue, f, indent=2)
        
        # Save to history
        self._save_to_history(message)
        
        logger.info(f"Message sent from {source_role} to {target_role}: {message_id}")
        return message_id
    
    def get_messages(self, role: str, mark_as_read: bool = True) -> List[Dict[str, Any]]:
        """
        Get messages for a specific role.
        
        Args:
            role (str): The role to get messages for
            mark_as_read (bool): Whether to mark messages as read
            
        Returns:
            List[Dict[str, Any]]: List of messages
        """
        # Get queue file path
        queue_file = os.path.join(self.queues_dir, f"{role.lower()}_queue.json")
        
        # Check if queue exists
        if not os.path.exists(queue_file):
            return []
        
        # Load queue
        try:
            with open(queue_file, 'r') as f:
                queue = json.load(f)
        except json.JSONDecodeError:
            logger.warning(f"Error reading queue file {queue_file}")
            return []
        
        # Mark messages as read if requested
        if mark_as_read and queue:
            for message in queue:
                message["read"] = True
            
            # Save updated queue
            with open(queue_file, 'w') as f:
                json.dump(queue, f, indent=2)
        
        return queue
    
    def get_unread_messages(self, role: str, mark_as_read: bool = True) -> List[Dict[str, Any]]:
        """
        Get unread messages for a specific role.
        
        Args:
            role (str): The role to get messages for
            mark_as_read (bool): Whether to mark messages as read
            
        Returns:
            List[Dict[str, Any]]: List of unread messages
        """
        # Get all messages
        messages = self.get_messages(role, mark_as_read=False)
        
        # Filter unread messages
        unread_messages = [m for m in messages if not m.get("read", False)]
        
        # Mark as read if requested
        if mark_as_read and unread_messages:
            # Get queue file path
            queue_file = os.path.join(self.queues_dir, f"{role.lower()}_queue.json")
            
            # Update read status
            for message in messages:
                if not message.get("read", False):
                    message["read"] = True
            
            # Save updated queue
            with open(queue_file, 'w') as f:
                json.dump(messages, f, indent=2)
        
        return unread_messages
    
    def clear_queue(self, role: str) -> int:
        """
        Clear the message queue for a specific role.
        
        Args:
            role (str): The role to clear the queue for
            
        Returns:
            int: Number of messages cleared
        """
        # Get queue file path
        queue_file = os.path.join(self.queues_dir, f"{role.lower()}_queue.json")
        
        # Check if queue exists
        if not os.path.exists(queue_file):
            return 0
        
        # Load queue to count messages
        try:
            with open(queue_file, 'r') as f:
                queue = json.load(f)
            count = len(queue)
        except json.JSONDecodeError:
            logger.warning(f"Error reading queue file {queue_file}")
            count = 0
        
        # Clear queue
        with open(queue_file, 'w') as f:
            json.dump([], f)
        
        logger.info(f"Cleared {count} messages from {role}'s queue")
        return count
    
    def get_conversation_history(self, source_role: str, target_role: str, 
                                limit: int = 50) -> List[Dict[str, Any]]:
        """
        Get conversation history between two roles.
        
        Args:
            source_role (str): First role in the conversation
            target_role (str): Second role in the conversation
            limit (int): Maximum number of messages to return
            
        Returns:
            List[Dict[str, Any]]: Conversation history
        """
        # Get history file paths
        history_files = []
        for filename in os.listdir(self.history_dir):
            if filename.endswith(".json"):
                history_files.append(os.path.join(self.history_dir, filename))
        
        # Load all messages
        all_messages = []
        for file_path in history_files:
            try:
                with open(file_path, 'r') as f:
                    messages = json.load(f)
                all_messages.extend(messages)
            except json.JSONDecodeError:
                logger.warning(f"Error reading history file {file_path}")
        
        # Filter messages between the two roles
        conversation = []
        for message in all_messages:
            if ((message["source_role"] == source_role and message["target_role"] == target_role) or
                (message["source_role"] == target_role and message["target_role"] == source_role)):
                conversation.append(message)
        
        # Sort by timestamp
        conversation.sort(key=lambda m: m.get("timestamp", ""))
        
        # Limit number of messages
        if limit > 0 and len(conversation) > limit:
            conversation = conversation[-limit:]
        
        return conversation
    
    def _save_to_history(self, message: Dict[str, Any]) -> None:
        """
        Save a message to the history.
        
        Args:
            message (Dict[str, Any]): The message to save
        """
        # Get current date for filename
        date_str = datetime.now().strftime("%Y-%m-%d")
        history_file = os.path.join(self.history_dir, f"history_{date_str}.json")
        
        # Load existing history
        history = []
        if os.path.exists(history_file):
            try:
                with open(history_file, 'r') as f:
                    history = json.load(f)
            except json.JSONDecodeError:
                logger.warning(f"Error reading history file {history_file}, creating new history")
        
        # Add message to history
        history.append(message)
        
        # Save history
        with open(history_file, 'w') as f:
            json.dump(history, f, indent=2)

def create_command_line_interface():
    """Create a simple command-line interface for the communication channel."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Direct Communication Channel CLI")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Send message command
    send_parser = subparsers.add_parser("send", help="Send a message")
    send_parser.add_argument("source", help="Source role")
    send_parser.add_argument("target", help="Target role")
    send_parser.add_argument("message", help="Message content")
    
    # Get messages command
    get_parser = subparsers.add_parser("get", help="Get messages")
    get_parser.add_argument("role", help="Role to get messages for")
    get_parser.add_argument("--unread", action="store_true", help="Get only unread messages")
    get_parser.add_argument("--keep-unread", action="store_true", help="Don't mark messages as read")
    
    # Clear queue command
    clear_parser = subparsers.add_parser("clear", help="Clear message queue")
    clear_parser.add_argument("role", help="Role to clear queue for")
    
    # Get history command
    history_parser = subparsers.add_parser("history", help="Get conversation history")
    history_parser.add_argument("role1", help="First role in the conversation")
    history_parser.add_argument("role2", help="Second role in the conversation")
    history_parser.add_argument("--limit", type=int, default=10, help="Maximum number of messages to return")
    
    # Poll command
    poll_parser = subparsers.add_parser("poll", help="Poll for new messages")
    poll_parser.add_argument("role", help="Role to poll for")
    poll_parser.add_argument("--interval", type=int, default=5, help="Polling interval in seconds")
    poll_parser.add_argument("--count", type=int, default=0, help="Number of polls (0 for infinite)")
    
    args = parser.parse_args()
    
    # Initialize communication channel
    channel = DirectCommunicationChannel()
    
    if args.command == "send":
        message_id = channel.send_message(args.source, args.target, args.message)
        print(f"Message sent: {message_id}")
    
    elif args.command == "get":
        if args.unread:
            messages = channel.get_unread_messages(args.role, not args.keep_unread)
            print(f"Unread messages for {args.role}: {len(messages)}")
        else:
            messages = channel.get_messages(args.role, not args.keep_unread)
            print(f"All messages for {args.role}: {len(messages)}")
        
        for i, message in enumerate(messages):
            print(f"\nMessage {i+1}:")
            print(f"From: {message['source_role']}")
            print(f"Time: {message['timestamp']}")
            print(f"Content: {message['content']}")
    
    elif args.command == "clear":
        count = channel.clear_queue(args.role)
        print(f"Cleared {count} messages from {args.role}'s queue")
    
    elif args.command == "history":
        history = channel.get_conversation_history(args.role1, args.role2, args.limit)
        print(f"Conversation history between {args.role1} and {args.role2}: {len(history)} messages")
        
        for i, message in enumerate(history):
            print(f"\nMessage {i+1}:")
            print(f"From: {message['source_role']} to {message['target_role']}")
            print(f"Time: {message['timestamp']}")
            print(f"Content: {message['content']}")
    
    elif args.command == "poll":
        print(f"Polling for messages for {args.role} every {args.interval} seconds...")
        poll_count = 0
        
        try:
            while args.count == 0 or poll_count < args.count:
                messages = channel.get_unread_messages(args.role)
                
                if messages:
                    print(f"\nFound {len(messages)} new messages:")
                    for i, message in enumerate(messages):
                        print(f"\nMessage {i+1}:")
                        print(f"From: {message['source_role']}")
                        print(f"Time: {message['timestamp']}")
                        print(f"Content: {message['content']}")
                
                time.sleep(args.interval)
                poll_count += 1
        except KeyboardInterrupt:
            print("\nPolling stopped by user")

if __name__ == "__main__":
    create_command_line_interface() 