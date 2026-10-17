"""
Message monitor for role-based communication.
Monitors message queues and triggers handlers when new messages arrive.
"""

import os
import json
import time
import logging
from pathlib import Path
from typing import Dict, Callable, Any, List, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("message_monitor.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("MessageMonitor")

class MessageMonitor:
    """
    Monitors message queues for new messages and triggers handlers.
    """
    
    def __init__(self, base_dir: str = "conversations"):
        """
        Initialize the message monitor.
        
        Args:
            base_dir: Base directory for message queues
        """
        self.base_dir = Path(base_dir)
        self.handlers: Dict[str, Callable] = {}
        self.running = False
        self.processed_messages: Dict[str, List[str]] = {}
        
        # Create base directory if it doesn't exist
        os.makedirs(self.base_dir, exist_ok=True)
        
        logger.info(f"MessageMonitor initialized with base directory: {base_dir}")
    
    def register_handler(self, role: str, handler: Callable):
        """
        Register a handler for a specific role.
        
        Args:
            role: Role identifier
            handler: Callback function to handle messages
        """
        self.handlers[role] = handler
        self.processed_messages[role] = []
        
        # Create role directory if it doesn't exist
        role_dir = self.base_dir / role
        os.makedirs(role_dir, exist_ok=True)
        
        logger.info(f"Registered handler for role: {role}")
    
    def start(self, interval: float = 5.0):
        """
        Start monitoring message queues.
        
        Args:
            interval: Check interval in seconds
        """
        self.running = True
        logger.info(f"Started monitoring with interval: {interval}s")
        
        try:
            while self.running:
                self._check_messages()
                time.sleep(interval)
        except KeyboardInterrupt:
            logger.info("Monitoring stopped by user")
            self.running = False
        except Exception as e:
            logger.error(f"Error in monitoring loop: {e}")
            self.running = False
    
    def stop(self):
        """Stop monitoring message queues."""
        self.running = False
        logger.info("Monitoring stopped")
    
    def _check_messages(self):
        """Check for new messages in all registered role queues."""
        for role, handler in self.handlers.items():
            role_dir = self.base_dir / role
            
            if not role_dir.exists():
                continue
            
            # Get all message files
            message_files = list(role_dir.glob("*.json"))
            
            for message_file in message_files:
                message_id = message_file.stem
                
                # Skip already processed messages
                if message_id in self.processed_messages.get(role, []):
                    continue
                
                try:
                    # Read message
                    with open(message_file, 'r') as f:
                        message = json.load(f)
                    
                    # Process message
                    logger.info(f"Processing message {message_id} for role {role}")
                    response = handler(message)
                    
                    # Mark as processed
                    self.processed_messages[role].append(message_id)
                    
                    # Handle response if any
                    if response:
                        self._handle_response(role, message, response)
                except Exception as e:
                    logger.error(f"Error processing message {message_id}: {e}")
    
    def _handle_response(self, role: str, original_message: Dict[str, Any], response: Any):
        """
        Handle response from a message handler.
        
        Args:
            role: Role that processed the message
            original_message: Original message that was processed
            response: Response from the handler
        """
        # If response is a string, create a reply message
        if isinstance(response, str):
            source_role = original_message.get("source_role")
            if source_role:
                try:
                    # Create response message
                    response_message = {
                        "id": f"response_{int(time.time())}",
                        "source_role": role,
                        "target_role": source_role,
                        "content": response,
                        "timestamp": time.time(),
                        "read": False,
                        "urgent": original_message.get("urgent", False),
                        "in_reply_to": original_message.get("id")
                    }
                    
                    # Save response message
                    source_dir = self.base_dir / source_role
                    os.makedirs(source_dir, exist_ok=True)
                    
                    response_path = source_dir / f"{response_message['id']}.json"
                    with open(response_path, 'w') as f:
                        json.dump(response_message, f, indent=2)
                    
                    logger.info(f"Created response from {role} to {source_role}: {response_message['id']}")
                except Exception as e:
                    logger.error(f"Error creating response message: {e}")
        
        # If response is a dict, assume it's a complete message and save it
        elif isinstance(response, dict) and "target_role" in response and "content" in response:
            try:
                # Ensure required fields
                if "id" not in response:
                    response["id"] = f"response_{int(time.time())}"
                if "source_role" not in response:
                    response["source_role"] = role
                if "timestamp" not in response:
                    response["timestamp"] = time.time()
                if "read" not in response:
                    response["read"] = False
                
                # Save response message
                target_role = response["target_role"]
                target_dir = self.base_dir / target_role
                os.makedirs(target_dir, exist_ok=True)
                
                response_path = target_dir / f"{response['id']}.json"
                with open(response_path, 'w') as f:
                    json.dump(response, f, indent=2)
                
                logger.info(f"Created custom response from {role} to {target_role}: {response['id']}")
            except Exception as e:
                logger.error(f"Error creating custom response message: {e}")


# Example usage
if __name__ == "__main__":
    def example_handler(message):
        print(f"Received message: {message}")
        return f"Response to {message.get('content', '')}"
    
    monitor = MessageMonitor()
    monitor.register_handler("ES", example_handler)
    
    # Create a test message
    es_dir = Path("conversations/ES")
    os.makedirs(es_dir, exist_ok=True)
    
    test_message = {
        "id": "test_message",
        "source_role": "SET",
        "target_role": "ES",
        "content": "Test message content",
        "timestamp": time.time(),
        "read": False
    }
    
    with open(es_dir / "test_message.json", 'w') as f:
        json.dump(test_message, f, indent=2)
    
    # Start monitoring (will run until interrupted)
    try:
        monitor.start(interval=2.0)
    except KeyboardInterrupt:
        monitor.stop() 