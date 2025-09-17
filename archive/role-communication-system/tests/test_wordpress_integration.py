"""
Unit tests for the WordPressIntegration class.
"""

import os
import json
import unittest
import tempfile
import shutil
from unittest.mock import MagicMock, patch

from role_automation.wordpress_integration import WordPressIntegration

class TestWordPressIntegration(unittest.TestCase):
    """Test cases for the WordPressIntegration class."""
    
    def setUp(self):
        """Set up test environment."""
        # Create temporary directory for test files
        self.test_dir = tempfile.mkdtemp()
        self.config_path = os.path.join(self.test_dir, 'wordpress.json')
        
        # Create test configuration
        self.test_config = {
            "url": "https://example.com/xmlrpc.php",
            "username": "test_user",
            "password": "test_password",
            "conversation_category_id": 5,
            "webhook_secret": "test_secret",
            "post_template": "<h2>Conversation: {title}</h2><div>{content}</div>",
            "message_template": "<div class='message {role_class}'><strong>{role}:</strong> {content}</div>"
        }
        
        # Write test configuration to file
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        with open(self.config_path, 'w') as f:
            json.dump(self.test_config, f)
        
        # Create mock objects
        self.mock_security_manager = MagicMock()
        self.mock_storage_manager = MagicMock()
        
        # Mock conversation data
        self.mock_conversation = {
            "id": "test_conversation",
            "metadata": {
                "title": "Test Conversation",
                "roles": ["ES", "BIC"]
            },
            "messages": [
                {
                    "source_role": "ES",
                    "target_role": "BIC",
                    "content": "Hello, this is a test message.",
                    "timestamp": "2023-01-01T12:00:00"
                },
                {
                    "source_role": "BIC",
                    "target_role": "ES",
                    "content": "This is a reply to the test message.",
                    "timestamp": "2023-01-01T12:05:00"
                }
            ]
        }
        
        self.mock_storage_manager.get_conversation.return_value = self.mock_conversation
        
        # Initialize WordPressIntegration with test configuration
        with patch('role_automation.wordpress_integration.Client') as mock_client:
            self.mock_wp_client = MagicMock()
            mock_client.return_value = self.mock_wp_client
            
            self.wp_integration = WordPressIntegration(
                self.mock_security_manager,
                self.mock_storage_manager,
                config_path=self.config_path
            )
    
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.test_dir)
    
    def test_load_config(self):
        """Test loading configuration from file."""
        # Check that configuration was loaded correctly
        self.assertEqual(self.wp_integration.config, self.test_config)
        
        # Test loading non-existent configuration
        non_existent_path = os.path.join(self.test_dir, 'non_existent.json')
        
        with patch('role_automation.wordpress_integration.Client'):
            wp_integration = WordPressIntegration(
                self.mock_security_manager,
                self.mock_storage_manager,
                config_path=non_existent_path
            )
        
        # Check that default configuration was created
        self.assertTrue(os.path.exists(non_existent_path))
        with open(non_existent_path, 'r') as f:
            config = json.load(f)
        
        self.assertIn("url", config)
        self.assertIn("username", config)
        self.assertIn("password", config)
    
    @patch('role_automation.wordpress_integration.Client')
    def test_authenticate(self, mock_client):
        """Test WordPress authentication."""
        # Set up mock client
        mock_wp = MagicMock()
        mock_client.return_value = mock_wp
        
        # Test successful authentication
        wp_integration = WordPressIntegration(
            self.mock_security_manager,
            self.mock_storage_manager,
            config_path=self.config_path
        )
        
        # Check that client was initialized with correct parameters
        mock_client.assert_called_with(
            self.test_config["url"],
            self.test_config["username"],
            self.test_config["password"]
        )
        
        # Test authentication failure
        mock_client.side_effect = Exception("Authentication failed")
        
        with self.assertRaises(Exception):
            wp_integration = WordPressIntegration(
                self.mock_security_manager,
                self.mock_storage_manager,
                config_path=self.config_path
            )
    
    def test_create_conversation_post(self):
        """Test creating a conversation post."""
        # Set up mock response for post creation
        self.mock_wp_client.call.return_value = 123  # Post ID
        
        # Create conversation post
        post_id = self.wp_integration.create_conversation_post("test_conversation")
        
        # Check that post was created
        self.assertEqual(post_id, 123)
        
        # Check that wp_client.call was called with correct parameters
        self.mock_wp_client.call.assert_called()
        args, _ = self.mock_wp_client.call.call_args
        
        # Check method name
        self.assertEqual(args[0], 'wp.newPost')
        
        # Check post content
        post_data = args[1]
        self.assertEqual(post_data['post_title'], "Test Conversation")
        self.assertIn("Hello, this is a test message.", post_data['post_content'])
        self.assertIn("This is a reply to the test message.", post_data['post_content'])
        self.assertEqual(post_data['post_status'], 'publish')
        self.assertEqual(post_data['terms_names']['category'], ['Conversations'])
        
        # Test creating post for non-existent conversation
        self.mock_storage_manager.get_conversation.return_value = None
        
        post_id = self.wp_integration.create_conversation_post("non_existent")
        self.assertIsNone(post_id)
    
    def test_update_conversation_post(self):
        """Test updating a conversation post."""
        # Set up mock response for post update
        self.mock_wp_client.call.return_value = True
        
        # Update conversation post
        result = self.wp_integration.update_conversation_post("test_conversation", 123)
        
        # Check that post was updated
        self.assertTrue(result)
        
        # Check that wp_client.call was called with correct parameters
        self.mock_wp_client.call.assert_called()
        args, _ = self.mock_wp_client.call.call_args
        
        # Check method name
        self.assertEqual(args[0], 'wp.editPost')
        
        # Check post content
        post_data = args[2]
        self.assertEqual(post_data['post_title'], "Test Conversation")
        self.assertIn("Hello, this is a test message.", post_data['post_content'])
        self.assertIn("This is a reply to the test message.", post_data['post_content'])
        
        # Test updating post for non-existent conversation
        self.mock_storage_manager.get_conversation.return_value = None
        
        result = self.wp_integration.update_conversation_post("non_existent", 123)
        self.assertFalse(result)
    
    def test_format_conversation_for_wordpress(self):
        """Test formatting a conversation for WordPress."""
        # Format conversation
        formatted = self.wp_integration._format_conversation_for_wordpress(self.mock_conversation)
        
        # Check formatted content
        self.assertIn("<h2>Conversation: Test Conversation</h2>", formatted)
        self.assertIn("<div class='message es'>", formatted)
        self.assertIn("<div class='message bic'>", formatted)
        self.assertIn("<strong>ES:</strong> Hello, this is a test message.", formatted)
        self.assertIn("<strong>BIC:</strong> This is a reply to the test message.", formatted)
    
    def test_get_conversation_post_id(self):
        """Test retrieving a conversation post ID."""
        # Set up mock response for post search
        mock_posts = [
            {'post_id': 123, 'post_title': 'Test Conversation', 'custom_fields': [
                {'key': 'conversation_id', 'value': 'test_conversation'}
            ]}
        ]
        self.mock_wp_client.call.return_value = mock_posts
        
        # Get conversation post ID
        post_id = self.wp_integration.get_conversation_post_id("test_conversation")
        
        # Check that post ID was retrieved
        self.assertEqual(post_id, 123)
        
        # Check that wp_client.call was called with correct parameters
        self.mock_wp_client.call.assert_called()
        args, _ = self.mock_wp_client.call.call_args
        
        # Check method name
        self.assertEqual(args[0], 'wp.getPosts')
        
        # Test retrieving post ID for non-existent conversation
        self.mock_wp_client.call.return_value = []
        
        post_id = self.wp_integration.get_conversation_post_id("non_existent")
        self.assertIsNone(post_id)
    
    def test_sync_conversation(self):
        """Test syncing a conversation with WordPress."""
        # Set up mock responses
        self.mock_wp_client.call.side_effect = [
            [],  # No existing post found
            123  # New post ID
        ]
        
        # Sync conversation
        post_id = self.wp_integration.sync_conversation("test_conversation")
        
        # Check that post was created
        self.assertEqual(post_id, 123)
        
        # Reset mock and test updating existing post
        self.mock_wp_client.call.reset_mock()
        self.mock_wp_client.call.side_effect = [
            [{'post_id': 123, 'custom_fields': [{'key': 'conversation_id', 'value': 'test_conversation'}]}],  # Existing post found
            True  # Update successful
        ]
        
        post_id = self.wp_integration.sync_conversation("test_conversation")
        
        # Check that post was updated
        self.assertEqual(post_id, 123)
        
        # Test syncing non-existent conversation
        self.mock_storage_manager.get_conversation.return_value = None
        
        post_id = self.wp_integration.sync_conversation("non_existent")
        self.assertIsNone(post_id)
    
    def test_handle_webhook(self):
        """Test handling a webhook from WordPress."""
        # Set up mock event data
        event_data = {
            "action": "new_message",
            "conversation_id": "test_conversation",
            "message": {
                "source_role": "ES",
                "target_role": "BIC",
                "content": "New message from webhook"
            },
            "secret": "test_secret"
        }
        
        # Handle webhook
        result = self.wp_integration.handle_webhook(event_data)
        
        # Check that webhook was handled
        self.assertTrue(result)
        
        # Check that storage_manager.add_message was called
        self.mock_storage_manager.add_message.assert_called_with(
            "test_conversation",
            event_data["message"]
        )
        
        # Test handling webhook with invalid secret
        event_data["secret"] = "invalid_secret"
        
        result = self.wp_integration.handle_webhook(event_data)
        self.assertFalse(result)
        
        # Test handling webhook with missing data
        event_data["secret"] = "test_secret"
        del event_data["message"]
        
        result = self.wp_integration.handle_webhook(event_data)
        self.assertFalse(result)
    
    def test_list_conversation_posts(self):
        """Test listing conversation posts."""
        # Set up mock response for post search
        mock_posts = [
            {'post_id': 123, 'post_title': 'Test Conversation 1', 'custom_fields': [
                {'key': 'conversation_id', 'value': 'conversation1'}
            ]},
            {'post_id': 124, 'post_title': 'Test Conversation 2', 'custom_fields': [
                {'key': 'conversation_id', 'value': 'conversation2'}
            ]}
        ]
        self.mock_wp_client.call.return_value = mock_posts
        
        # List conversation posts
        posts = self.wp_integration.list_conversation_posts()
        
        # Check that posts were listed
        self.assertEqual(len(posts), 2)
        self.assertEqual(posts[0]['post_id'], 123)
        self.assertEqual(posts[0]['conversation_id'], 'conversation1')
        self.assertEqual(posts[1]['post_id'], 124)
        self.assertEqual(posts[1]['conversation_id'], 'conversation2')
        
        # Test listing posts with no results
        self.mock_wp_client.call.return_value = []
        
        posts = self.wp_integration.list_conversation_posts()
        self.assertEqual(len(posts), 0)

if __name__ == '__main__':
    unittest.main() 