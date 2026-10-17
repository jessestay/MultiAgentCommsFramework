"""
Unit tests for the StorageManager class.
"""

import os
import json
import unittest
import tempfile
import shutil
import datetime
from unittest.mock import MagicMock

from role_automation.storage_manager import StorageManager

class TestStorageManager(unittest.TestCase):
    """Test cases for the StorageManager class."""
    
    def setUp(self):
        """Set up test environment."""
        # Create temporary directory for test files
        self.test_dir = tempfile.mkdtemp()
        self.config_path = os.path.join(self.test_dir, 'storage.json')
        self.storage_dir = os.path.join(self.test_dir, 'conversations')
        
        # Create test configuration
        self.test_config = {
            "storage_dir": self.storage_dir,
            "backup_dir": os.path.join(self.test_dir, 'backups'),
            "backup_frequency_days": 7,
            "max_conversation_size_mb": 10,
            "compression_enabled": True
        }
        
        # Write test configuration to file
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        with open(self.config_path, 'w') as f:
            json.dump(self.test_config, f)
        
        # Create mock security manager
        self.mock_security_manager = MagicMock()
        self.mock_security_manager.encrypt_message.side_effect = lambda x: f"ENCRYPTED:{x}"
        self.mock_security_manager.decrypt_message.side_effect = lambda x: x.replace("ENCRYPTED:", "")
        self.mock_security_manager.get_retention_days.return_value = 30
        
        # Initialize StorageManager with test configuration
        self.storage_manager = StorageManager(
            self.mock_security_manager,
            config_path=self.config_path,
            storage_dir=self.storage_dir
        )
    
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.test_dir)
    
    def test_load_config(self):
        """Test loading configuration from file."""
        # Check that configuration was loaded correctly
        self.assertEqual(self.storage_manager.config, self.test_config)
        
        # Test loading non-existent configuration
        non_existent_path = os.path.join(self.test_dir, 'non_existent.json')
        storage_manager = StorageManager(
            self.mock_security_manager,
            config_path=non_existent_path
        )
        
        # Check that default configuration was created
        self.assertTrue(os.path.exists(non_existent_path))
        with open(non_existent_path, 'r') as f:
            config = json.load(f)
        
        self.assertIn("storage_dir", config)
        self.assertIn("backup_dir", config)
        self.assertIn("backup_frequency_days", config)
    
    def test_create_conversation(self):
        """Test creating a new conversation."""
        # Create test conversation
        conversation_id = "test_conversation"
        metadata = {"roles": ["ES", "BIC"], "topic": "Test Topic"}
        
        result = self.storage_manager.create_conversation(conversation_id, metadata)
        
        # Check that creation was successful
        self.assertTrue(result)
        
        # Check that conversation file was created
        conversation_path = os.path.join(self.storage_dir, f"{conversation_id}.json")
        self.assertTrue(os.path.exists(conversation_path))
        
        # Check conversation content
        with open(conversation_path, 'r') as f:
            conversation = json.load(f)
        
        self.assertEqual(conversation["id"], conversation_id)
        self.assertEqual(conversation["metadata"], metadata)
        self.assertEqual(conversation["messages"], [])
        
        # Test creating a conversation that already exists
        result = self.storage_manager.create_conversation(conversation_id)
        self.assertFalse(result)
    
    def test_add_message(self):
        """Test adding a message to a conversation."""
        # Create test conversation
        conversation_id = "test_conversation"
        self.storage_manager.create_conversation(conversation_id)
        
        # Add test message
        message = {
            "source_role": "ES",
            "target_role": "BIC",
            "content": "Test message"
        }
        
        result = self.storage_manager.add_message(conversation_id, message)
        
        # Check that addition was successful
        self.assertTrue(result)
        
        # Check that message was added to conversation
        conversation_path = os.path.join(self.storage_dir, f"{conversation_id}.json")
        with open(conversation_path, 'r') as f:
            conversation = json.load(f)
        
        self.assertEqual(len(conversation["messages"]), 1)
        self.assertEqual(conversation["messages"][0]["source_role"], "ES")
        self.assertEqual(conversation["messages"][0]["target_role"], "BIC")
        self.assertEqual(conversation["messages"][0]["content"], "ENCRYPTED:Test message")
        
        # Test adding a message to a non-existent conversation
        result = self.storage_manager.add_message("non_existent", message)
        self.assertFalse(result)
        
        # Test adding a message with metadata
        message_with_metadata = {
            "source_role": "BIC",
            "target_role": "ES",
            "content": "Reply message",
            "metadata": {"important": True}
        }
        
        result = self.storage_manager.add_message(conversation_id, message_with_metadata)
        self.assertTrue(result)
        
        # Check that metadata was updated
        with open(conversation_path, 'r') as f:
            conversation = json.load(f)
        
        self.assertEqual(len(conversation["messages"]), 2)
        self.assertTrue(conversation["metadata"].get("important"))
    
    def test_get_conversation(self):
        """Test retrieving a conversation."""
        # Create test conversation with messages
        conversation_id = "test_conversation"
        self.storage_manager.create_conversation(conversation_id)
        
        message1 = {"source_role": "ES", "target_role": "BIC", "content": "Message 1"}
        message2 = {"source_role": "BIC", "target_role": "ES", "content": "Message 2"}
        
        self.storage_manager.add_message(conversation_id, message1)
        self.storage_manager.add_message(conversation_id, message2)
        
        # Retrieve conversation with decryption
        conversation = self.storage_manager.get_conversation(conversation_id)
        
        # Check conversation content
        self.assertEqual(conversation["id"], conversation_id)
        self.assertEqual(len(conversation["messages"]), 2)
        self.assertEqual(conversation["messages"][0]["content"], "Message 1")
        self.assertEqual(conversation["messages"][1]["content"], "Message 2")
        
        # Retrieve conversation without decryption
        conversation = self.storage_manager.get_conversation(conversation_id, decrypt=False)
        
        # Check that messages are still encrypted
        self.assertEqual(conversation["messages"][0]["content"], "ENCRYPTED:Message 1")
        self.assertEqual(conversation["messages"][1]["content"], "ENCRYPTED:Message 2")
        
        # Test retrieving a non-existent conversation
        conversation = self.storage_manager.get_conversation("non_existent")
        self.assertIsNone(conversation)
    
    def test_list_conversations(self):
        """Test listing conversations."""
        # Create test conversations
        self.storage_manager.create_conversation("conversation1", {"roles": ["ES", "BIC"], "topic": "Topic 1"})
        self.storage_manager.create_conversation("conversation2", {"roles": ["ES", "MD"], "topic": "Topic 2"})
        self.storage_manager.create_conversation("conversation3", {"roles": ["BIC", "MD"], "topic": "Topic 1"})
        
        # List all conversations
        conversations = self.storage_manager.list_conversations()
        
        # Check that all conversations are listed
        self.assertEqual(len(conversations), 3)
        
        # Check conversation summaries
        conversation_ids = [c["id"] for c in conversations]
        self.assertIn("conversation1", conversation_ids)
        self.assertIn("conversation2", conversation_ids)
        self.assertIn("conversation3", conversation_ids)
        
        # Test filtering by metadata
        filter_criteria = {"metadata": {"roles": "ES"}}
        conversations = self.storage_manager.list_conversations(filter_criteria)
        
        # Check filtered conversations
        self.assertEqual(len(conversations), 2)
        conversation_ids = [c["id"] for c in conversations]
        self.assertIn("conversation1", conversation_ids)
        self.assertIn("conversation2", conversation_ids)
        
        # Test filtering by topic
        filter_criteria = {"metadata": {"topic": "Topic 1"}}
        conversations = self.storage_manager.list_conversations(filter_criteria)
        
        # Check filtered conversations
        self.assertEqual(len(conversations), 2)
        conversation_ids = [c["id"] for c in conversations]
        self.assertIn("conversation1", conversation_ids)
        self.assertIn("conversation3", conversation_ids)
    
    def test_delete_conversation(self):
        """Test deleting a conversation."""
        # Create test conversation
        conversation_id = "test_conversation"
        self.storage_manager.create_conversation(conversation_id)
        
        # Check that conversation exists
        conversation_path = os.path.join(self.storage_dir, f"{conversation_id}.json")
        self.assertTrue(os.path.exists(conversation_path))
        
        # Delete conversation
        result = self.storage_manager.delete_conversation(conversation_id)
        
        # Check that deletion was successful
        self.assertTrue(result)
        self.assertFalse(os.path.exists(conversation_path))
        
        # Test deleting a non-existent conversation
        result = self.storage_manager.delete_conversation("non_existent")
        self.assertFalse(result)
    
    def test_enforce_retention_policy(self):
        """Test enforcing retention policy."""
        # Create test conversations with different timestamps
        current_time = datetime.datetime.now()
        
        # Recent conversation (10 days old)
        recent_time = (current_time - datetime.timedelta(days=10)).isoformat()
        self.storage_manager.create_conversation("recent_conversation")
        recent_path = os.path.join(self.storage_dir, "recent_conversation.json")
        with open(recent_path, 'r') as f:
            recent = json.load(f)
        recent["updated_at"] = recent_time
        with open(recent_path, 'w') as f:
            json.dump(recent, f)
        
        # Old conversation (40 days old)
        old_time = (current_time - datetime.timedelta(days=40)).isoformat()
        self.storage_manager.create_conversation("old_conversation")
        old_path = os.path.join(self.storage_dir, "old_conversation.json")
        with open(old_path, 'r') as f:
            old = json.load(f)
        old["updated_at"] = old_time
        with open(old_path, 'w') as f:
            json.dump(old, f)
        
        # Enforce retention policy
        deleted_count = self.storage_manager.enforce_retention_policy()
        
        # Check that only old conversation was deleted
        self.assertEqual(deleted_count, 1)
        self.assertTrue(os.path.exists(recent_path))
        self.assertFalse(os.path.exists(old_path))
    
    def test_backup_restore(self):
        """Test backup and restore functionality."""
        # Create test conversations
        self.storage_manager.create_conversation("conversation1")
        self.storage_manager.create_conversation("conversation2")
        
        # Add messages to conversations
        self.storage_manager.add_message("conversation1", {"content": "Message 1"})
        self.storage_manager.add_message("conversation2", {"content": "Message 2"})
        
        # Create backup
        backup_dir = self.storage_manager.backup_conversations()
        
        # Check that backup was created
        self.assertIsNotNone(backup_dir)
        self.assertTrue(os.path.exists(backup_dir))
        
        # Check backup contents
        backup_files = os.listdir(backup_dir)
        self.assertEqual(len(backup_files), 2)
        self.assertIn("conversation1.json", backup_files)
        self.assertIn("conversation2.json", backup_files)
        
        # Delete original conversations
        self.storage_manager.delete_conversation("conversation1")
        self.storage_manager.delete_conversation("conversation2")
        
        # Restore from backup
        restored_count = self.storage_manager.restore_from_backup(backup_dir)
        
        # Check that conversations were restored
        self.assertEqual(restored_count, 2)
        self.assertIsNotNone(self.storage_manager.get_conversation("conversation1"))
        self.assertIsNotNone(self.storage_manager.get_conversation("conversation2"))

if __name__ == '__main__':
    unittest.main() 