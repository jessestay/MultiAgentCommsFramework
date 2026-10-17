"""
Unit tests for message encryption.
"""

import unittest
import json
import os
import shutil
from pathlib import Path
import sys

# Add src directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.message_encryption import MessageEncryption

class TestMessageEncryption(unittest.TestCase):
    """Test cases for message encryption."""
    
    def setUp(self):
        """Set up test environment."""
        self.encryption = MessageEncryption("test_key")
        self.test_message = {
            "id": "test123",
            "source_role": "ES",
            "target_role": "SET",
            "content": "This is a test message",
            "timestamp": 1234567890,
            "read": False
        }
    
    def test_encrypt_decrypt(self):
        """Test encryption and decryption of messages."""
        # Encrypt message
        encrypted = self.encryption.encrypt_message(self.test_message)
        
        # Verify content is encrypted
        self.assertNotEqual(encrypted["content"], self.test_message["content"])
        self.assertTrue(encrypted["encrypted"])
        
        # Decrypt message
        decrypted = self.encryption.decrypt_message(encrypted)
        
        # Verify content is decrypted correctly
        self.assertEqual(decrypted["content"], self.test_message["content"])
        self.assertFalse(decrypted["encrypted"])
    
    def test_key_derivation(self):
        """Test key derivation from password."""
        # Create two encryption instances with same password
        enc1 = MessageEncryption("same_password")
        enc2 = MessageEncryption("same_password")
        
        # Encrypt with first instance
        encrypted = enc1.encrypt_message(self.test_message)
        
        # Decrypt with second instance
        decrypted = enc2.decrypt_message(encrypted)
        
        # Verify content is decrypted correctly
        self.assertEqual(decrypted["content"], self.test_message["content"])
    
    def test_different_keys(self):
        """Test encryption with different keys."""
        # Create two encryption instances with different passwords
        enc1 = MessageEncryption("password1")
        enc2 = MessageEncryption("password2")
        
        # Encrypt with first instance
        encrypted = enc1.encrypt_message(self.test_message)
        
        # Attempt to decrypt with second instance (should fail)
        with self.assertRaises(Exception):
            enc2.decrypt_message(encrypted)


if __name__ == "__main__":
    unittest.main() 