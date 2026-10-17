"""
Role communication manager that combines message monitoring and processing.
"""

import threading
import time
import logging
import json
import re
import uuid
import asyncio
from typing import Dict, Callable, List, Any, Optional

from src.message_monitor import MessageMonitor
from src.message_processor import MessageProcessor
from src.message_encryption import MessageEncryption

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("role_communication.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("RoleCommunication")

class RoleCommunicationManager:
    """
    Manages communication between roles with automatic message processing.
    """
    
    def __init__(self, base_dir: str = "conversations", 
                 encryption_enabled: bool = False,
                 encryption_key: Optional[str] = None):
        """
        Initialize the role communication manager.
        
        Args:
            base_dir: Base directory for message queues
            encryption_enabled: Whether to enable message encryption
            encryption_key: Encryption key (if None, a new key will be generated)
        """
        self.base_dir = base_dir
        self.monitor = MessageMonitor(base_dir)
        self.processors: Dict[str, MessageProcessor] = {}
        self.monitor_thread = None
        self.encryption_enabled = encryption_enabled
        
        # Initialize encryption if enabled
        self.encryption = MessageEncryption(encryption_key) if encryption_enabled else None
        
        # Valid roles in the system
        self.valid_roles = ["ES", "SET", "CTW", "BIC", "MD", "SMM", "UFL", "DLC", "DRC"]
        
        logger.info(f"RoleCommunicationManager initialized with base directory: {base_dir}")
        if encryption_enabled:
            logger.info("Message encryption enabled")
    
    def register_role(self, role: str, message_handler: Optional[Callable] = None):
        """
        Register a role for communication.
        
        Args:
            role: Role identifier (e.g., "ES", "SET")
            message_handler: Optional custom message handler
        """
        # Create processor for this role
        processor = MessageProcessor(role, self.base_dir)
        self.processors[role] = processor
        
        # Register monitor handler
        def default_handler(message):
            # Decrypt message if encrypted
            if self.encryption_enabled and self.encryption and message.get("encrypted", False):
                message = self.encryption.decrypt_message(message)
            
            return self.processors[role].process_message(message)
        
        self.monitor.register_handler(role, message_handler or default_handler)
        
        logger.info(f"Registered role: {role}")
    
    def register_response_handler(self, role: str, source_role: str, handler: Callable):
        """
        Register a response handler for a specific role.
        
        Args:
            role: Role identifier
            source_role: Source role identifier
            handler: Callback function to generate responses
        """
        if role not in self.processors:
            logger.warning(f"Role {role} not registered, registering now")
            self.register_role(role)
        
        self.processors[role].register_response_handler(source_role, handler)
        logger.info(f"Registered response handler for {role} to handle messages from {source_role}")
    
    async def validate_message_format(self, message: Dict[str, Any]) -> bool:
        """
        Validate message format and syntax.
        
        Args:
            message: Message object to validate
            
        Returns:
            True if valid, False otherwise
            
        Raises:
            ValueError: If message format is invalid
        """
        # Check required fields
        required_fields = ["id", "source_role", "content"]
        for field in required_fields:
            if field not in message:
                error_msg = f"Missing required field: {field}"
                logger.error(error_msg)
                raise ValueError(f"Format Error (2001): {error_msg}")
        
        # Validate source role
        if message["source_role"] not in self.valid_roles:
            error_msg = f"Invalid source role: {message['source_role']}"
            logger.error(error_msg)
            raise ValueError(f"Format Error (2001): {error_msg}")
        
        # Validate target role if present
        if "target_role" in message and message["target_role"] is not None:
            if message["target_role"] not in self.valid_roles:
                error_msg = f"Invalid target role: {message['target_role']}"
                logger.error(error_msg)
                raise ValueError(f"Format Error (2001): {error_msg}")
        
        # Validate message syntax
        content = message["content"]
        if not self._validate_message_syntax(content):
            error_msg = f"Invalid message syntax: {content}"
            logger.error(error_msg)
            raise ValueError(f"Format Error (2002): {error_msg}")
        
        return True
    
    def _validate_message_syntax(self, content: str) -> bool:
        """
        Validate message syntax according to the role communication protocol.
        
        Args:
            content: Message content
            
        Returns:
            True if valid, False otherwise
        """
        # Check for proper role mention format: [ROLE]: @TARGET_ROLE: Message
        # This is a simplified check - in production, use more robust regex
        if content.startswith("[") and "]:" in content:
            # Direct message format
            if "@" in content and ":" in content.split("@")[1]:
                return True
            # Broadcast message format
            elif content.count(":") == 1:
                return True
        
        # If content doesn't match expected format but is a simple string, allow it
        # This is for backward compatibility and simple messages
        if isinstance(content, str) and len(content) > 0:
            return True
        
        return False
    
    async def send_message(self, message: Dict[str, Any]) -> Optional[str]:
        """
        Send a message.
        
        Args:
            message: Message object with source_role, target_role, content, etc.
            
        Returns:
            Message ID if successful, None otherwise
            
        Raises:
            ValueError: If message format is invalid
        """
        # Validate message format
        try:
            await self.validate_message_format(message)
        except ValueError as e:
            logger.error(f"Message validation failed: {e}")
            raise
        
        source_role = message["source_role"]
        target_role = message.get("target_role")
        content = message["content"]
        urgent = message.get("urgent", False)
        
        if source_role not in self.processors:
            logger.warning(f"Source role {source_role} not registered, registering now")
            self.register_role(source_role)
        
        # Use existing message ID if provided, otherwise generate a new one
        message_id = message.get("id") or str(uuid.uuid4())
        
        # Create message
        if target_role:
            message_id = self.processors[source_role].create_message(
                target_role, content, urgent=urgent, message_id=message_id
            )
        else:
            # Broadcast message to all roles
            for role in self.valid_roles:
                if role != source_role:
                    self.processors[source_role].create_message(
                        role, content, urgent=urgent, message_id=f"{message_id}_{role}"
                    )
        
        # Encrypt message if enabled
        if self.encryption_enabled and self.encryption and message_id and target_role:
            message_path = self.processors[source_role].get_message_path(target_role, message_id)
            try:
                with open(message_path, 'r') as f:
                    message_data = json.load(f)
                
                encrypted_message = self.encryption.encrypt_message(message_data)
                
                with open(message_path, 'w') as f:
                    json.dump(encrypted_message, f, indent=2)
                
                logger.debug(f"Encrypted message {message_id}")
            except Exception as e:
                logger.error(f"Error encrypting message {message_id}: {e}")
        
        return message_id
    
    def send_message_simple(self, source_role: str, target_role: str, content: str, 
                    urgent: bool = False) -> Optional[str]:
        """
        Send a message from one role to another (simplified interface).
        
        Args:
            source_role: Source role identifier
            target_role: Target role identifier
            content: Message content
            urgent: Whether this is an urgent message
            
        Returns:
            Message ID if successful, None otherwise
        """
        message = {
            "id": str(uuid.uuid4()),
            "source_role": source_role,
            "target_role": target_role,
            "content": content,
            "urgent": urgent
        }
        
        return asyncio.run(self.send_message(message))
    
    def send_urgent_message(self, source_role: str, target_role: str, content: str) -> Optional[str]:
        """
        Send an urgent message from one role to another.
        
        Args:
            source_role: Source role identifier
            target_role: Target role identifier
            content: Message content
            
        Returns:
            Message ID if successful, None otherwise
        """
        return self.send_message_simple(source_role, target_role, content, urgent=True)
    
    def get_unread_messages(self, role: str) -> List[Dict[str, Any]]:
        """
        Get unread messages for a specific role.
        
        Args:
            role: Role identifier
            
        Returns:
            List of unread message objects
        """
        if role not in self.processors:
            logger.warning(f"Role {role} not registered")
            return []
        
        messages = self.processors[role].get_unread_messages()
        
        # Decrypt messages if encrypted
        if self.encryption_enabled and self.encryption:
            decrypted_messages = []
            for message in messages:
                if message.get("encrypted", False):
                    decrypted_messages.append(self.encryption.decrypt_message(message))
                else:
                    decrypted_messages.append(message)
            return decrypted_messages
        
        return messages
    
    def get_urgent_messages(self, role: str, include_read: bool = False) -> List[Dict[str, Any]]:
        """
        Get urgent messages for a specific role.
        
        Args:
            role: Role identifier
            include_read: Whether to include read messages
            
        Returns:
            List of urgent message objects
        """
        if role not in self.processors:
            logger.warning(f"Role {role} not registered")
            return []
        
        messages = self.processors[role].get_urgent_messages(include_read)
        
        # Decrypt messages if encrypted
        if self.encryption_enabled and self.encryption:
            decrypted_messages = []
            for message in messages:
                if message.get("encrypted", False):
                    decrypted_messages.append(self.encryption.decrypt_message(message))
                else:
                    decrypted_messages.append(message)
            return decrypted_messages
        
        return messages
    
    def start_monitoring(self, interval: float = 5.0):
        """
        Start monitoring message queues in a background thread.
        
        Args:
            interval: Check interval in seconds
        """
        if self.monitor_thread and self.monitor_thread.is_alive():
            logger.warning("Monitor already running")
            return
        
        def monitor_task():
            self.monitor.start(interval)
        
        self.monitor_thread = threading.Thread(target=monitor_task, daemon=True)
        self.monitor_thread.start()
        
        logger.info(f"Started message monitoring with interval: {interval}s")
    
    def stop_monitoring(self):
        """Stop monitoring message queues."""
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor.stop()
            self.monitor_thread.join(timeout=10)
            logger.info("Stopped message monitoring")
        else:
            logger.warning("Monitor not running")


# Example usage
if __name__ == "__main__":
    # Example response handlers
    def es_response_handler(message):
        content = message.get("content", "")
        return f"Executive Secretary acknowledges: {content}"
    
    def set_response_handler(message):
        content = message.get("content", "")
        return f"Software Engineering Team will implement: {content}"
    
    # Create manager
    manager = RoleCommunicationManager()
    
    # Register roles and handlers
    manager.register_role("ES")
    manager.register_role("SET")
    
    manager.register_response_handler("ES", "SET", es_response_handler)
    manager.register_response_handler("SET", "ES", set_response_handler)
    
    # Start monitoring
    manager.start_monitoring()
    
    # Example: Send a message
    async def send_test_message():
        message = {
            "id": str(uuid.uuid4()),
            "source_role": "ES",
            "target_role": "SET",
            "content": "[ES]: @SET: Please implement the new feature",
            "urgent": False
        }
        await manager.send_message(message)
    
    asyncio.run(send_test_message())
    
    # Keep running to process messages
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        manager.stop_monitoring() 