"""
Unit tests for the SecurityManager class.
"""

import os
import json
import unittest
import tempfile
import shutil
from cryptography.fernet import Fernet

from role_automation.security_manager import SecurityManager

class TestSecurityManager(unittest.TestCase):
    """Test cases for the SecurityManager class."""
    
    def setUp(self):
        """Set up test environment."""
        # Create temporary directory for test files
        self.test_dir = tempfile.mkdtemp()
        self.config_path = os.path.join(self.test_dir, 'security.json')
        self.key_path = os.path.join(self.test_dir, 'encryption.key')
        
        # Create test configuration
        self.test_config = {
            "authorized_roles": ["ES", "BIC", "MD"],
            "access_control": {
                "ES": ["*"],
                "BIC": ["ES", "MD"],
                "MD": ["ES"]
            },
            "retention_policy": {
                "default_days": 30,
                "special_roles": {
                    "BIC": 60
                }
            }
        }
        
        # Write test configuration to file
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        with open(self.config_path, 'w') as f:
            json.dump(self.test_config, f)
        
        # Create test encryption key
        key = Fernet.generate_key()
        with open(self.key_path, 'wb') as f:
            f.write(key)
        
        # Initialize SecurityManager with test configuration
        self.security_manager = SecurityManager(
            config_path=self.config_path,
            key_path=self.key_path
        )
    
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.test_dir)
    
    def test_load_config(self):
        """Test loading configuration from file."""
        # Check that configuration was loaded correctly
        self.assertEqual(self.security_manager.config, self.test_config)
        
        # Test loading non-existent configuration
        non_existent_path = os.path.join(self.test_dir, 'non_existent.json')
        security_manager = SecurityManager(config_path=non_existent_path)
        
        # Check that default configuration was created
        self.assertTrue(os.path.exists(non_existent_path))
        with open(non_existent_path, 'r') as f:
            config = json.load(f)
        
        self.assertIn("authorized_roles", config)
        self.assertIn("access_control", config)
        self.assertIn("retention_policy", config)
    
    def test_initialize_encryption(self):
        """Test initializing encryption."""
        # Check that encryption was initialized
        self.assertIsNotNone(self.security_manager.fernet)
        
        # Test encryption/decryption
        message = "Test message"
        encrypted = self.security_manager.encrypt_message(message)
        decrypted = self.security_manager.decrypt_message(encrypted)
        
        self.assertNotEqual(message, encrypted)
        self.assertEqual(message, decrypted)
    
    def test_is_role_authorized(self):
        """Test checking if a role is authorized."""
        # Test authorized roles
        self.assertTrue(self.security_manager.is_role_authorized("ES"))
        self.assertTrue(self.security_manager.is_role_authorized("BIC"))
        self.assertTrue(self.security_manager.is_role_authorized("MD"))
        
        # Test unauthorized roles
        self.assertFalse(self.security_manager.is_role_authorized("UNKNOWN"))
        self.assertFalse(self.security_manager.is_role_authorized("SMM"))
    
    def test_can_communicate(self):
        """Test checking if a role can communicate with another role."""
        # Test ES can communicate with all roles
        self.assertTrue(self.security_manager.can_communicate("ES", "BIC"))
        self.assertTrue(self.security_manager.can_communicate("ES", "MD"))
        self.assertTrue(self.security_manager.can_communicate("ES", "ES"))
        
        # Test BIC can communicate with ES and MD
        self.assertTrue(self.security_manager.can_communicate("BIC", "ES"))
        self.assertTrue(self.security_manager.can_communicate("BIC", "MD"))
        
        # Test MD can communicate with ES only
        self.assertTrue(self.security_manager.can_communicate("MD", "ES"))
        self.assertFalse(self.security_manager.can_communicate("MD", "BIC"))
        
        # Test unauthorized roles
        self.assertFalse(self.security_manager.can_communicate("UNKNOWN", "ES"))
        self.assertFalse(self.security_manager.can_communicate("ES", "UNKNOWN"))
    
    def test_encrypt_decrypt_message(self):
        """Test encrypting and decrypting messages."""
        # Test with simple message
        message = "Hello, world!"
        encrypted = self.security_manager.encrypt_message(message)
        decrypted = self.security_manager.decrypt_message(encrypted)
        
        self.assertNotEqual(message, encrypted)
        self.assertEqual(message, decrypted)
        
        # Test with empty message
        message = ""
        encrypted = self.security_manager.encrypt_message(message)
        decrypted = self.security_manager.decrypt_message(encrypted)
        
        self.assertEqual(message, decrypted)
        
        # Test with special characters
        message = "!@#$%^&*()_+{}|:<>?~`-=[]\\;',./'"
        encrypted = self.security_manager.encrypt_message(message)
        decrypted = self.security_manager.decrypt_message(encrypted)
        
        self.assertEqual(message, decrypted)
    
    def test_get_retention_days(self):
        """Test getting retention days for a role."""
        # Test default retention days
        self.assertEqual(self.security_manager.get_retention_days("ES"), 30)
        self.assertEqual(self.security_manager.get_retention_days("MD"), 30)
        
        # Test special retention days
        self.assertEqual(self.security_manager.get_retention_days("BIC"), 60)
        
        # Test unknown role
        self.assertEqual(self.security_manager.get_retention_days("UNKNOWN"), 30)
    
    def test_update_config(self):
        """Test updating the security configuration."""
        # Create new configuration
        new_config = {
            "authorized_roles": ["ES", "BIC", "MD", "SMM"],
            "access_control": {
                "ES": ["*"],
                "BIC": ["ES"],
                "MD": ["ES"],
                "SMM": ["ES", "MD"]
            },
            "retention_policy": {
                "default_days": 45,
                "special_roles": {
                    "BIC": 90
                }
            }
        }
        
        # Update configuration
        result = self.security_manager.update_config(new_config)
        
        # Check that update was successful
        self.assertTrue(result)
        self.assertEqual(self.security_manager.config, new_config)
        
        # Check that configuration was saved to file
        with open(self.config_path, 'r') as f:
            saved_config = json.load(f)
        
        self.assertEqual(saved_config, new_config)
        
        # Test that new configuration is used
        self.assertTrue(self.security_manager.is_role_authorized("SMM"))
        self.assertTrue(self.security_manager.can_communicate("SMM", "ES"))
        self.assertTrue(self.security_manager.can_communicate("SMM", "MD"))
        self.assertFalse(self.security_manager.can_communicate("SMM", "BIC"))
        self.assertEqual(self.security_manager.get_retention_days("ES"), 45)
        self.assertEqual(self.security_manager.get_retention_days("BIC"), 90)

if __name__ == '__main__':
    unittest.main() 