import os
import json
from datetime import datetime
import uuid
import time
import logging
from .utils import (
    ensure_directory_exists, 
    read_file_content, 
    write_file_content,
    format_message,
    load_queue,
    save_queue,
    get_role_abbreviation
)

# Set up logging
base_dir = os.path.dirname(os.path.abspath(__file__))
logs_dir = os.path.join(base_dir, "logs")
ensure_directory_exists(logs_dir)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(logs_dir, "channel.log")),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("DirectCommunicationChannel")

class DirectCommunicationChannel:
    """
    A simple file-based communication channel for direct role-to-role communication.
    """
    
    def __init__(self, base_dir="direct_communication"):
        """Initialize the communication channel with the base directory."""
        self.base_dir = base_dir
        self.queues_dir = os.path.join(base_dir, "queues")
        self.history_dir = os.path.join(base_dir, "history")
        self.logs_dir = os.path.join(base_dir, "logs")
        
        # Ensure directories exist
        ensure_directory_exists(self.queues_dir)
        ensure_directory_exists(self.history_dir)
        ensure_directory_exists(self.logs_dir)
        
        logger.info(f"DirectCommunicationChannel initialized with base directory: {base_dir}")
    
    def _get_queue_path(self, role):
        """Get the path to the queue file for a role."""
        role_abbr = get_role_abbreviation(role.upper())
        return os.path.join(self.queues_dir, f"{role_abbr.lower()}_queue.json")
    
    def _get_history_path(self, source_role, target_role):
        """Get the path to the conversation history file."""
        source_abbr = get_role_abbreviation(source_role.upper())
        target_abbr = get_role_abbreviation(target_role.upper())
        
        # Sort roles alphabetically to ensure consistent file naming
        roles = sorted([source_abbr.lower(), target_abbr.lower()])
        return os.path.join(self.history_dir, f"{roles[0]}_{roles[1]}_history.json")
    
    def send_message(self, source_role, target_role, content, metadata=None):
        """
        Send a message from source_role to target_role.
        
        Args:
            source_role (str): The role sending the message
            target_role (str): The role receiving the message
            content (str): The message content
            metadata (dict, optional): Additional metadata for the message
            
        Returns:
            str: The ID of the sent message
        """
        # Standardize role names
        source_role = get_role_abbreviation(source_role.upper())
        target_role = get_role_abbreviation(target_role.upper())
        
        # Format the message
        message = format_message(source_role, target_role, content, metadata)
        
        # Add to target's queue
        queue_path = self._get_queue_path(target_role)
        queue = load_queue(queue_path)
        queue.append(message)
        save_queue(queue_path, queue)
        
        # Add to conversation history
        history_path = self._get_history_path(source_role, target_role)
        history = load_queue(history_path)
        history.append(message)
        save_queue(history_path, history)
        
        logger.info(f"Message sent from {source_role} to {target_role} with ID {message['id']}")
        return message["id"]
    
    def get_messages(self, role, mark_as_read=True):
        """
        Get all messages for a role.
        
        Args:
            role (str): The role to get messages for
            mark_as_read (bool, optional): Whether to mark messages as read
            
        Returns:
            list: List of messages
        """
        role = get_role_abbreviation(role.upper())
        queue_path = self._get_queue_path(role)
        
        if not os.path.exists(queue_path):
            logger.info(f"No messages found for {role}")
            return []
        
        queue = load_queue(queue_path)
        
        if mark_as_read:
            for message in queue:
                message["read"] = True
            save_queue(queue_path, queue)
            logger.info(f"Marked {len(queue)} messages as read for {role}")
        
        return queue
    
    def clear_queue(self, role):
        """
        Clear the message queue for a role.
        
        Args:
            role (str): The role to clear the queue for
            
        Returns:
            int: Number of messages cleared
        """
        role = get_role_abbreviation(role.upper())
        queue_path = self._get_queue_path(role)
        
        if not os.path.exists(queue_path):
            logger.info(f"No queue to clear for {role}")
            return 0
        
        queue = load_queue(queue_path)
        count = len(queue)
        save_queue(queue_path, [])
        
        logger.info(f"Cleared {count} messages from {role}'s queue")
        return count
    
    def get_conversation_history(self, role1, role2):
        """
        Get the conversation history between two roles.
        
        Args:
            role1 (str): First role
            role2 (str): Second role
            
        Returns:
            list: List of messages in the conversation
        """
        role1 = get_role_abbreviation(role1.upper())
        role2 = get_role_abbreviation(role2.upper())
        
        history_path = self._get_history_path(role1, role2)
        
        if not os.path.exists(history_path):
            logger.info(f"No conversation history found between {role1} and {role2}")
            return []
        
        history = load_queue(history_path)
        logger.info(f"Retrieved {len(history)} messages from conversation history between {role1} and {role2}")
        return history
    
    def poll_for_messages(self, role, interval=5, callback=None, max_polls=None):
        """
        Poll for new messages for a role.
        
        Args:
            role (str): The role to poll for
            interval (int, optional): Polling interval in seconds
            callback (callable, optional): Function to call with new messages
            max_polls (int, optional): Maximum number of polls (None for infinite)
            
        Returns:
            None
        """
        role = get_role_abbreviation(role.upper())
        logger.info(f"Starting polling for {role} with interval {interval}s")
        
        poll_count = 0
        last_message_count = 0
        
        try:
            while max_polls is None or poll_count < max_polls:
                queue = self.get_messages(role, mark_as_read=False)
                unread_messages = [msg for msg in queue if not msg["read"]]
                
                if unread_messages:
                    logger.info(f"Found {len(unread_messages)} new messages for {role}")
                    
                    if callback:
                        callback(unread_messages)
                    
                    # Mark messages as read
                    for message in queue:
                        if not message["read"]:
                            message["read"] = True
                    
                    queue_path = self._get_queue_path(role)
                    save_queue(queue_path, queue)
                
                poll_count += 1
                time.sleep(interval)
        
        except KeyboardInterrupt:
            logger.info(f"Polling stopped for {role} after {poll_count} polls")
    
    def send_message_from_file(self, source_role, target_role, file_path, metadata=None):
        """
        Send a message from a file.
        
        Args:
            source_role (str): The role sending the message
            target_role (str): The role receiving the message
            file_path (str): Path to the file containing the message
            metadata (dict, optional): Additional metadata for the message
            
        Returns:
            str: The ID of the sent message
        """
        try:
            content = read_file_content(file_path)
            return self.send_message(source_role, target_role, content, metadata)
        except Exception as e:
            logger.error(f"Error sending message from file: {e}")
            raise
    
    def get_queue(self, role):
        """
        Get the message queue for a role.
        
        Args:
            role (str): The role to get the queue for
            
        Returns:
            list: The message queue
        """
        role = get_role_abbreviation(role.upper())
        queue_path = self._get_queue_path(role)
        return load_queue(queue_path)
    
    def save_queue(self, role, queue):
        """
        Save the message queue for a role.
        
        Args:
            role (str): The role to save the queue for
            queue (list): The message queue
            
        Returns:
            None
        """
        role = get_role_abbreviation(role.upper())
        queue_path = self._get_queue_path(role)
        save_queue(queue_path, queue)
        logger.info(f"Saved queue for {role} with {len(queue)} messages") 