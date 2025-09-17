"""
Message processor for role-based communication.
Handles message processing and response generation.
"""

import os
import json
import time
import uuid
import re
from pathlib import Path
from typing import Dict, Any, Optional, List, Callable
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("message_processor.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("MessageProcessor")

class MessageProcessor:
    """
    Processes messages for a specific role and generates responses.
    """
    
    def __init__(self, role: str, base_dir: str = "conversations"):
        """
        Initialize the message processor.
        
        Args:
            role: Role identifier (e.g., "ES", "SET")
            base_dir: Base directory for message queues
        """
        self.role = role
        self.base_dir = Path(base_dir)
        self.inbox_dir = self.base_dir / role
        self.response_handlers: Dict[str, Callable] = {}
        self.urgent_keywords = ["urgent", "immediately", "asap", "emergency", "critical", "fundraising", "$"]
        
        # Create directories if they don't exist
        os.makedirs(self.base_dir, exist_ok=True)
        os.makedirs(self.inbox_dir, exist_ok=True)
        
        logger.info(f"MessageProcessor initialized for role: {role}")
    
    def register_response_handler(self, source_role: str, handler: Callable):
        """
        Register a response handler for messages from a specific role.
        
        Args:
            source_role: Source role identifier
            handler: Callback function to generate responses
        """
        self.response_handlers[source_role] = handler
        logger.info(f"Registered response handler for messages from {source_role}")
    
    def is_urgent(self, message: Dict[str, Any]) -> bool:
        """
        Check if a message is urgent based on content or metadata.
        
        Args:
            message: Message object
            
        Returns:
            True if message is urgent, False otherwise
        """
        # Check if message is explicitly marked as urgent
        if message.get("urgent", False):
            return True
        
        # Check content for urgent keywords
        content = message.get("content", "").lower()
        for keyword in self.urgent_keywords:
            if keyword.lower() in content:
                logger.info(f"Message {message.get('id', 'unknown')} marked as urgent due to keyword: {keyword}")
                return True
        
        # Check for currency amounts
        if re.search(r'\$\d+', content):
            logger.info(f"Message {message.get('id', 'unknown')} marked as urgent due to currency mention")
            return True
            
        return False
    
    def process_message(self, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Process a message and generate a response if needed.
        
        Args:
            message: Message object
            
        Returns:
            Response message object or None
        """
        source_role = message.get("source_role")
        if not source_role:
            logger.warning(f"Message missing source_role: {message}")
            return None
        
        # Check if message is urgent
        urgent = self.is_urgent(message)
        if urgent and not message.get("urgent"):
            message["urgent"] = True
            logger.info(f"Marked message {message.get('id', 'unknown')} as urgent")
        
        # Mark message as read
        message_id = message.get("id")
        if message_id:
            message_path = self.inbox_dir / f"{message_id}.json"
            if message_path.exists():
                try:
                    with open(message_path, 'r') as f:
                        msg_data = json.load(f)
                    
                    msg_data["read"] = True
                    msg_data["read_timestamp"] = time.time()
                    if urgent:
                        msg_data["urgent"] = True
                    
                    with open(message_path, 'w') as f:
                        json.dump(msg_data, f, indent=2)
                    
                    logger.debug(f"Marked message {message_id} as read")
                except Exception as e:
                    logger.error(f"Error marking message {message_id} as read: {e}")
        
        # Generate response if handler exists
        if source_role in self.response_handlers:
            try:
                response_content = self.response_handlers[source_role](message)
                if response_content:
                    # Create response message
                    response_id = self.create_message(
                        source_role, 
                        response_content, 
                        in_reply_to=message_id,
                        urgent=urgent
                    )
                    
                    if response_id:
                        logger.info(f"Sent response to {source_role}: {response_id}")
                        
                        # Get the response message
                        response_path = self.get_message_path(source_role, response_id)
                        with open(response_path, 'r') as f:
                            response = json.load(f)
                        
                        return response
            except Exception as e:
                logger.error(f"Error generating response to {source_role}: {e}")
        
        return None
    
    def create_message(self, target_role: str, content: str, 
                      in_reply_to: Optional[str] = None,
                      urgent: bool = False,
                      message_id: Optional[str] = None) -> Optional[str]:
        """
        Create a new message from this role to another role.
        
        Args:
            target_role: Target role identifier
            content: Message content
            in_reply_to: Optional ID of message being replied to
            urgent: Whether this is an urgent message
            message_id: Optional message ID to use (if None, a new UUID will be generated)
            
        Returns:
            Message ID if successful, None otherwise
        """
        try:
            # Create target directory if it doesn't exist
            target_dir = self.base_dir / target_role
            os.makedirs(target_dir, exist_ok=True)
            
            # Generate message ID if not provided
            msg_id = message_id or str(uuid.uuid4())
            
            # Create message object
            message = {
                "id": msg_id,
                "source_role": self.role,
                "target_role": target_role,
                "content": content,
                "timestamp": time.time(),
                "read": False,
                "urgent": urgent or self.is_urgent({"content": content})
            }
            
            if in_reply_to:
                message["in_reply_to"] = in_reply_to
            
            # Write message to file
            message_path = self.get_message_path(target_role, msg_id)
            with open(message_path, 'w') as f:
                json.dump(message, f, indent=2)
            
            logger.info(f"Created message {msg_id} from {self.role} to {target_role}")
            return msg_id
        except Exception as e:
            logger.error(f"Error creating message: {e}")
            return None
    
    def get_message_path(self, target_role: str, message_id: str) -> Path:
        """
        Get the path to a message file.
        
        Args:
            target_role: Target role identifier
            message_id: Message ID
            
        Returns:
            Path to the message file
        """
        target_dir = self.base_dir / target_role
        return target_dir / f"{message_id}.json"
    
    def get_unread_messages(self) -> List[Dict[str, Any]]:
        """
        Get all unread messages for this role.
        
        Returns:
            List of unread message objects
        """
        unread_messages = []
        
        if not self.inbox_dir.exists():
            return []
        
        for msg_file in self.inbox_dir.glob("*.json"):
            try:
                with open(msg_file, 'r') as f:
                    message = json.load(f)
                    if not message.get("read", False):
                        unread_messages.append(message)
            except Exception as e:
                logger.error(f"Error reading message file {msg_file}: {e}")
        
        return unread_messages
    
    def get_urgent_messages(self, include_read: bool = False) -> List[Dict[str, Any]]:
        """
        Get all urgent messages for this role.
        
        Args:
            include_read: Whether to include read messages
            
        Returns:
            List of urgent message objects
        """
        urgent_messages = []
        
        if not self.inbox_dir.exists():
            return []
        
        for msg_file in self.inbox_dir.glob("*.json"):
            try:
                with open(msg_file, 'r') as f:
                    message = json.load(f)
                    if message.get("urgent", False) and (include_read or not message.get("read", False)):
                        urgent_messages.append(message)
            except Exception as e:
                logger.error(f"Error reading message file {msg_file}: {e}")
        
        return urgent_messages


# Example usage
if __name__ == "__main__":
    # Example response handler
    def example_response_handler(message):
        content = message.get("content", "")
        return f"Response to: {content}"
    
    # Create processor
    processor = MessageProcessor("SET")
    processor.register_response_handler("ES", example_response_handler)
    
    # Process unread messages
    unread = processor.get_unread_messages()
    for message in unread:
        processor.process_message(message) 