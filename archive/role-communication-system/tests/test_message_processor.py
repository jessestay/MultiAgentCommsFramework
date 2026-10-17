"""
Unit tests for message processor.
"""

import unittest
import json
import os
import shutil
from pathlib import Path
import sys
import time

# Add src directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.message_processor import MessageProcessor

class TestMessageProcessor(unittest.TestCase):
    """Test cases for message processor."""
    
    def setUp(self):
        """Set up test environment."""
        self.test_dir = "test_conversations"
        self.processor = MessageProcessor("TEST", self.test_dir)
        
        # Create test directories
        os.makedirs(self.test_dir, exist_ok=True)
        os.makedirs(os.path.join(self.test_dir, "TEST"), exist_ok=True)
        os.makedirs(os.path.join(self.test_dir, "OTHER"), exist_ok=True)
    
    def tearDown(self):
        """Clean up test environment."""
        # Remove test directories
        shutil.rmtree(self.test_dir, ignore_errors=True)
    
    def test_create_message(self):
        """Test creating a message."""
        # Create a message
        message_id = self.processor.create_message("OTHER", "Test message")
        
        # Verify message was created
        self.assertIsNotNone(message_id)
        
        # Verify message file exists
        message_path = os.path.join(self.test_dir, "OTHER", f"{message_id}.json")
        self.assertTrue(os.path.exists(message_path))
        
        # Verify message content
        with open(message_path, 'r') as f:
            message = json.load(f)
            self.assertEqual(message["content"], "Test message")

if __name__ == "__main__":
    unittest.main() 