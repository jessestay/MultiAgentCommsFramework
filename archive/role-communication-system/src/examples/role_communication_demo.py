"""
Role Communication System Demo

This example demonstrates how different roles can communicate with each other
using the role communication system.
"""

import os
import sys
import asyncio
import json
import logging
from pathlib import Path

# Add the parent directory to the path so we can import from src
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from storage_manager import StorageManager
from role_manager import RoleManager
from role_communication import RoleCommunicationManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("role_communication_demo.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("RoleCommunicationDemo")

class SecurityManagerMock:
    """Simple mock of the security manager for demo purposes."""
    
    def verify_role_access(self, role, target_role=None):
        """Always allow access in this demo."""
        return True
    
    def verify_action_permission(self, role, action):
        """Always allow actions in this demo."""
        return True
    
    def encrypt_message(self, message):
        """No encryption in this demo."""
        return message
    
    def decrypt_message(self, message):
        """No decryption in this demo."""
        return message

class RoleHandler:
    """Handler for a specific role."""
    
    def __init__(self, role, comm_manager):
        self.role = role
        self.comm_manager = comm_manager
        self.received_messages = []
    
    async def handle_message(self, message):
        """Handle an incoming message."""
        logger.info(f"[{self.role}] Received message: {message['content']}")
        self.received_messages.append(message)
        
        # Generate a response based on the message content
        if "status update" in message["content"].lower():
            return await self.generate_status_update(message)
        elif "request" in message["content"].lower():
            return await self.generate_request_response(message)
        elif "urgent" in message["content"].lower():
            return await self.generate_urgent_response(message)
        else:
            return await self.generate_default_response(message)
    
    async def generate_status_update(self, message):
        """Generate a status update response."""
        source_role = message["source_role"]
        response_content = f"[{self.role}]: @{source_role}: Status update: All systems operational."
        
        response = {
            "source_role": self.role,
            "target_role": source_role,
            "content": response_content,
            "urgent": False
        }
        
        return await self.comm_manager.send_message(response)
    
    async def generate_request_response(self, message):
        """Generate a response to a request."""
        source_role = message["source_role"]
        response_content = f"[{self.role}]: @{source_role}: Request received and being processed."
        
        response = {
            "source_role": self.role,
            "target_role": source_role,
            "content": response_content,
            "urgent": False
        }
        
        return await self.comm_manager.send_message(response)
    
    async def generate_urgent_response(self, message):
        """Generate a response to an urgent message."""
        source_role = message["source_role"]
        response_content = f"[{self.role}]: @{source_role}: [URGENT] Immediate attention being given to your request."
        
        response = {
            "source_role": self.role,
            "target_role": source_role,
            "content": response_content,
            "urgent": True
        }
        
        return await self.comm_manager.send_message(response)
    
    async def generate_default_response(self, message):
        """Generate a default response."""
        source_role = message["source_role"]
        response_content = f"[{self.role}]: @{source_role}: Message received. Thank you."
        
        response = {
            "source_role": self.role,
            "target_role": source_role,
            "content": response_content,
            "urgent": False
        }
        
        return await self.comm_manager.send_message(response)
    
    async def send_message_to(self, target_role, content, urgent=False):
        """Send a message to another role."""
        message = {
            "source_role": self.role,
            "target_role": target_role,
            "content": f"[{self.role}]: @{target_role}: {content}",
            "urgent": urgent
        }
        
        logger.info(f"[{self.role}] Sending message to {target_role}: {content}")
        return await self.comm_manager.send_message(message)
    
    def get_unread_messages(self):
        """Get unread messages for this role."""
        return self.comm_manager.get_unread_messages(self.role)

async def run_demo():
    """Run the role communication demo."""
    # Create a temporary database for the demo
    db_path = "demo_communication.db"
    if os.path.exists(db_path):
        os.remove(db_path)
    
    # Create the necessary directories
    os.makedirs("conversations", exist_ok=True)
    
    # Initialize managers
    security_manager = SecurityManagerMock()
    storage_manager = StorageManager(security_manager, db_path)
    role_manager = RoleManager(storage_manager)
    comm_manager = RoleCommunicationManager("conversations", encryption_enabled=False)
    
    # Create a conversation
    conversation_id = "demo_conversation"
    workspace_path = "/demo/workspace"
    metadata = {"topic": "Role Communication Demo", "priority": "high"}
    
    storage_manager.create_conversation(conversation_id, metadata, workspace_path)
    
    # Create role handlers
    es_handler = RoleHandler("ES", comm_manager)
    set_handler = RoleHandler("SET", comm_manager)
    ctw_handler = RoleHandler("CTW", comm_manager)
    
    # Register roles and handlers
    comm_manager.register_role("ES")
    comm_manager.register_role("SET")
    comm_manager.register_role("CTW")
    
    # Register response handlers
    comm_manager.register_response_handler("ES", "SET", es_handler.handle_message)
    comm_manager.register_response_handler("ES", "CTW", es_handler.handle_message)
    comm_manager.register_response_handler("SET", "ES", set_handler.handle_message)
    comm_manager.register_response_handler("SET", "CTW", set_handler.handle_message)
    comm_manager.register_response_handler("CTW", "ES", ctw_handler.handle_message)
    comm_manager.register_response_handler("CTW", "SET", ctw_handler.handle_message)
    
    # Start monitoring
    comm_manager.start_monitoring(interval=1.0)
    
    try:
        # Scenario 1: ES delegates a task to SET
        logger.info("=== Scenario 1: ES delegates a task to SET ===")
        await es_handler.send_message_to("SET", "Please implement the storage system with SQLite backend")
        
        # Wait for processing
        await asyncio.sleep(2)
        
        # Scenario 2: SET requests information from CTW
        logger.info("=== Scenario 2: SET requests information from CTW ===")
        await set_handler.send_message_to("CTW", "Request for documentation requirements for the storage system")
        
        # Wait for processing
        await asyncio.sleep(2)
        
        # Scenario 3: CTW sends an urgent message to ES
        logger.info("=== Scenario 3: CTW sends an urgent message to ES ===")
        await ctw_handler.send_message_to("ES", "[URGENT] Need approval for documentation format", urgent=True)
        
        # Wait for processing
        await asyncio.sleep(2)
        
        # Scenario 4: ES sends a status update to all roles
        logger.info("=== Scenario 4: ES sends a status update to all roles ===")
        
        # Send to SET
        await es_handler.send_message_to("SET", "Status update: Project timeline extended by one week")
        
        # Send to CTW
        await es_handler.send_message_to("CTW", "Status update: Project timeline extended by one week")
        
        # Wait for processing
        await asyncio.sleep(2)
        
        # Display message summaries
        logger.info("=== Message Summary ===")
        logger.info(f"ES received {len(es_handler.received_messages)} messages")
        logger.info(f"SET received {len(set_handler.received_messages)} messages")
        logger.info(f"CTW received {len(ctw_handler.received_messages)} messages")
        
        # Display conversation from database
        conversation = storage_manager.get_conversation(conversation_id)
        logger.info(f"=== Conversation in Database ===")
        logger.info(f"Conversation ID: {conversation['id']}")
        logger.info(f"Metadata: {conversation['metadata']}")
        logger.info(f"Total messages: {len(conversation.get('messages', []))}")
        
    finally:
        # Stop monitoring
        comm_manager.stop_monitoring()
        
        # Close database connection
        storage_manager.close()
        
        # Clean up
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
                logger.info("Database file removed successfully")
            except Exception as e:
                logger.error(f"Error removing database file: {e}")

if __name__ == "__main__":
    asyncio.run(run_demo()) 