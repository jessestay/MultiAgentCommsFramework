"""
Basic tests for the AI Role Communication Automation System.
"""

import os
import json
import tempfile
import shutil
import unittest

from role_automation.security_manager import SecurityManager
from role_automation.storage_manager import StorageManager
from role_automation.message_router import MessageRouter

class TestBasicFunctionality(unittest.TestCase):
    """Test basic functionality of the system."""
    
    def setUp(self):
        """Set up test environment."""
        # Create temporary directory for test files
        self.test_dir = tempfile.mkdtemp()
        
        # Create test configuration paths
        self.security_config_path = os.path.join(self.test_dir, 'security.json')
        self.storage_config_path = os.path.join(self.test_dir, 'storage.json')
        self.storage_dir = os.path.join(self.test_dir, 'conversations')
        
        # Create test role definitions
        self.role_definitions_path = os.path.join(self.test_dir, 'role-definitions.yaml')
        with open(self.role_definitions_path, 'w') as f:
            f.write("""
# Test Role Definitions
ES:
  name: Executive Secretary
  communication_format: |
    [ES]: {message}
    
    When addressing another role directly:
    [ES]: @{target_role}: {message}

BIC:
  name: Business Income Coach
  communication_format: |
    [BIC]: {message}
    
    When addressing another role directly:
    [BIC]: @{target_role}: {message}
            """)
        
        # Initialize components
        self.security_manager = SecurityManager(
            config_path=self.security_config_path,
            role_definitions_path=self.role_definitions_path
        )
        self.storage_manager = StorageManager(
            self.security_manager,
            config_path=self.storage_config_path,
            storage_dir=self.storage_dir
        )
        self.message_router = MessageRouter(
            self.security_manager,
            self.storage_manager
        )
    
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.test_dir)
    
    def test_message_routing(self):
        """Test basic message routing."""
        # Send a message
        message_text = "[ES]: @BIC: This is a test message"
        result = self.message_router.route_message(message_text)
        
        # Check that message was routed successfully
        self.assertTrue(result["success"])
        self.assertTrue(result["is_new_conversation"])
        
        # Get the conversation ID
        conversation_id = result["conversation_id"]
        
        # Check that conversation exists
        conversation = self.storage_manager.get_conversation(conversation_id)
        self.assertIsNotNone(conversation)
        
        # Check conversation content
        self.assertEqual(len(conversation["messages"]), 1)
        self.assertEqual(conversation["messages"][0]["source_role"], "ES")
        self.assertEqual(conversation["messages"][0]["target_role"], "BIC")
        self.assertEqual(conversation["messages"][0]["content"], "This is a test message")
        
        # Send a reply
        message_text = "[BIC]: @ES: This is a reply"
        result = self.message_router.route_message(message_text, conversation_id=conversation_id)
        
        # Check that reply was added successfully
        self.assertTrue(result["success"])
        self.assertFalse(result["is_new_conversation"])
        
        # Check updated conversation
        conversation = self.storage_manager.get_conversation(conversation_id)
        self.assertEqual(len(conversation["messages"]), 2)
        self.assertEqual(conversation["messages"][1]["source_role"], "BIC")
        self.assertEqual(conversation["messages"][1]["target_role"], "ES")
        self.assertEqual(conversation["messages"][1]["content"], "This is a reply")
    
    def test_message_parsing(self):
        """Test message parsing."""
        # Test standard message format
        source_role, target_role, content = self.message_router.parse_message(
            "[ES]: This is a broadcast message"
        )
        self.assertEqual(source_role, "ES")
        self.assertIsNone(target_role)
        self.assertEqual(content, "This is a broadcast message")
        
        # Test directed message format
        source_role, target_role, content = self.message_router.parse_message(
            "[ES]: @BIC: This is a directed message"
        )
        self.assertEqual(source_role, "ES")
        self.assertEqual(target_role, "BIC")
        self.assertEqual(content, "This is a directed message")
        
        # Test invalid format
        source_role, target_role, content = self.message_router.parse_message(
            "This is not a properly formatted message"
        )
        self.assertIsNone(source_role)
        self.assertIsNone(target_role)
        self.assertEqual(content, "This is not a properly formatted message")
    
    def test_conversation_management(self):
        """Test conversation management."""
        # Create a conversation
        conversation_id = "test_conversation"
        metadata = {"test": True, "roles": ["ES", "BIC"]}
        result = self.storage_manager.create_conversation(conversation_id, metadata)
        self.assertTrue(result)
        
        # Add messages to the conversation
        message1 = {
            "source_role": "ES",
            "target_role": "BIC",
            "content": "Message 1"
        }
        message2 = {
            "source_role": "BIC",
            "target_role": "ES",
            "content": "Message 2"
        }
        
        self.storage_manager.add_message(conversation_id, message1)
        self.storage_manager.add_message(conversation_id, message2)
        
        # Get the conversation
        conversation = self.storage_manager.get_conversation(conversation_id)
        self.assertEqual(len(conversation["messages"]), 2)
        
        # List conversations
        conversations = self.storage_manager.list_conversations()
        self.assertEqual(len(conversations), 1)
        self.assertEqual(conversations[0]["id"], conversation_id)
        
        # Filter conversations
        filtered = self.storage_manager.list_conversations({"metadata": {"test": True}})
        self.assertEqual(len(filtered), 1)
        
        # Delete the conversation
        result = self.storage_manager.delete_conversation(conversation_id)
        self.assertTrue(result)
        
        # Check that conversation was deleted
        conversation = self.storage_manager.get_conversation(conversation_id)
        self.assertIsNone(conversation)
        
        # Check that conversation list is empty
        conversations = self.storage_manager.list_conversations()
        self.assertEqual(len(conversations), 0)

if __name__ == '__main__':
    unittest.main() 