"""
Documentation Request Example

This script demonstrates SET requesting documentation from CTW using the role communication system.
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
        logging.FileHandler("documentation_request.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("DocumentationRequest")

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

async def send_documentation_request():
    """Send a documentation request from SET to CTW."""
    # Create a temporary database for the demo
    db_path = "documentation_request.db"
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
    conversation_id = "documentation_request"
    workspace_path = "/project/workspace"
    metadata = {
        "topic": "Role Communication System Documentation",
        "priority": "high",
        "status": "pending"
    }
    
    storage_manager.create_conversation(conversation_id, metadata, workspace_path)
    
    # Register roles
    comm_manager.register_role("SET")
    comm_manager.register_role("CTW")
    comm_manager.register_role("ES")
    
    try:
        # SET sends a documentation request to CTW
        logger.info("=== SET sending documentation request to CTW ===")
        
        documentation_request = {
            "source_role": "SET",
            "target_role": "CTW",
            "content": """[SET]: @CTW: I've implemented a role communication system and need comprehensive documentation for it. 

The implementation is located in the following files:
- src/storage_manager.py: Handles persistent storage using SQLite
- src/role_manager.py: Manages role states and transitions
- src/role_communication.py: Coordinates message sending and receiving
- src/message_processor.py: Processes messages for specific roles
- src/message_monitor.py: Monitors message queues for new messages
- src/examples/role_communication_demo.py: Demonstrates the system in action

Please create the following documentation:
1. A comprehensive guide (docs/role_communication_guide.md) explaining how to use the system
2. Updates to the README.md with an overview of the system
3. Documentation for the error codes (docs/error_codes.md)

Key features to highlight:
- Direct messaging between roles with proper format validation
- Persistent storage of conversations and messages
- Comprehensive error handling and recovery procedures
- Asynchronous message processing
- Role state management

The documentation should include code examples for:
- Initializing the system
- Registering roles and handlers
- Sending and receiving messages
- Handling errors
- Proper resource management

Please let me know if you need any additional information about the implementation.
""",
            "urgent": True,
            "conversation_id": conversation_id
        }
        
        await comm_manager.send_message(documentation_request)
        logger.info("Documentation request sent successfully")
        
        # ES coordinates the workflow
        coordination_message = {
            "source_role": "ES",
            "target_role": "CTW",
            "content": """[ES]: @CTW: I'm coordinating the documentation request from SET. 

This is a high-priority task as we need the documentation to help other roles understand how to use the new communication system. 

Please review SET's implementation and create comprehensive documentation that is clear and accessible to all roles. Focus on practical examples and step-by-step instructions.

Once you've completed the documentation, please notify both SET and me so we can review it.

Let me know if you need any clarification or have questions about the requirements.
""",
            "urgent": False,
            "conversation_id": conversation_id
        }
        
        await comm_manager.send_message(coordination_message)
        logger.info("Coordination message sent successfully")
        
        # CTW acknowledges the request (simulated)
        acknowledgment = {
            "source_role": "CTW",
            "target_role": "SET",
            "content": """[CTW]: @SET: I've received your request for documentation of the role communication system. 

I'll review the implementation files you've provided and create comprehensive documentation covering all the requested aspects:
- Role Communication Guide
- README updates
- Error codes documentation

I'll focus on providing clear examples and practical instructions for using the system. I'll also ensure the documentation highlights the key features you've mentioned.

I'll notify you and ES once the documentation is complete. Please let me know if you have any specific formatting preferences or additional requirements.
""",
            "urgent": False,
            "conversation_id": conversation_id
        }
        
        await comm_manager.send_message(acknowledgment)
        logger.info("Acknowledgment message sent successfully")
        
        # CTW also acknowledges ES (simulated)
        es_acknowledgment = {
            "source_role": "CTW",
            "target_role": "ES",
            "content": """[CTW]: @ES: I've received your coordination message regarding the documentation request from SET.

I understand this is a high-priority task, and I'll focus on creating clear, accessible documentation with practical examples and step-by-step instructions.

I've already acknowledged SET's request and will begin working on the documentation immediately. I'll notify both you and SET once it's complete.

I'll reach out if I need any clarification or have questions about the requirements.
""",
            "urgent": False,
            "conversation_id": conversation_id
        }
        
        await comm_manager.send_message(es_acknowledgment)
        logger.info("ES acknowledgment message sent successfully")
        
        # Display conversation from database
        conversation = storage_manager.get_conversation(conversation_id)
        logger.info(f"=== Conversation in Database ===")
        logger.info(f"Conversation ID: {conversation['id']}")
        logger.info(f"Metadata: {conversation['metadata']}")
        logger.info(f"Total messages: {len(conversation.get('messages', []))}")
        
        # Print all messages in the conversation
        logger.info("=== Messages in Conversation ===")
        for i, message in enumerate(conversation.get('messages', [])):
            logger.info(f"Message {i+1}:")
            logger.info(f"  From: {message['source_role']}")
            logger.info(f"  To: {message['target_role']}")
            logger.info(f"  Content: {message['content'][:100]}...")  # Truncate for readability
            logger.info(f"  Urgent: {message.get('urgent', False)}")
            logger.info("---")
        
    finally:
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
    asyncio.run(send_documentation_request()) 