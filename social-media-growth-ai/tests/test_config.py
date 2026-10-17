"""
Test suite for the Facebook API configuration module.
"""

import os
import json
import tempfile
import unittest
from unittest.mock import patch, MagicMock

import sys
# Add the src directory to the path so we can import from it
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.analytics.config import (
    FacebookAPIConfigError,
    load_credentials_from_env,
    load_credentials_from_file,
    validate_credentials,
    refresh_access_token,
    load_facebook_api_config,
    save_credentials_to_file,
    test_credentials
)


class TestFacebookAPIConfig(unittest.TestCase):
    """Test cases for the Facebook API configuration module."""
    
    def setUp(self):
        """Set up test fixtures."""
        # Create a temporary directory for test files
        self.temp_dir = tempfile.mkdtemp()
        
        # Test credentials
        self.valid_credentials = {
            'app_id': '123456789',
            'app_secret': 'test_secret',
            'access_token': 'EAABBCCDDEEFFGGHHIIJJKKLLMMNNOOPPtest_token',
            'page_id': '987654321'
        }
        
        # Create a test config file
        self.config_path = os.path.join(self.temp_dir, 'fb_config.json')
        with open(self.config_path, 'w') as f:
            json.dump(self.valid_credentials, f)
            
        # Set up environment variables for testing
        self.env_vars = {
            'FB_APP_ID': '123456789',
            'FB_APP_SECRET': 'test_secret',
            'FB_ACCESS_TOKEN': 'EAABBCCDDEEFFGGHHIIJJKKLLMMNNOOPPtest_token',
            'FB_PAGE_ID': '987654321'
        }
        
    def tearDown(self):
        """Tear down test fixtures."""
        # Clean up temporary files
        if os.path.exists(self.config_path):
            os.remove(self.config_path)
        
        if os.path.exists(self.temp_dir):
            os.rmdir(self.temp_dir)
    
    @patch.dict(os.environ, {
        'FB_APP_ID': '123456789',
        'FB_APP_SECRET': 'test_secret',
        'FB_ACCESS_TOKEN': 'EAABBCCDDEEFFGGHHIIJJKKLLMMNNOOPPtest_token',
        'FB_PAGE_ID': '987654321'
    })
    def test_load_credentials_from_env_success(self):
        """Test loading credentials from environment variables."""
        credentials = load_credentials_from_env()
        
        self.assertEqual(credentials['app_id'], '123456789')
        self.assertEqual(credentials['app_secret'], 'test_secret')
        self.assertEqual(credentials['access_token'], 'EAABBCCDDEEFFGGHHIIJJKKLLMMNNOOPPtest_token')
        self.assertEqual(credentials['page_id'], '987654321')
    
    @patch.dict(os.environ, {
        'FB_APP_SECRET': 'test_secret',
        'FB_ACCESS_TOKEN': 'test_token'
    }, clear=True)
    def test_load_credentials_from_env_missing_vars(self):
        """Test loading credentials with missing environment variables."""
        with self.assertRaises(FacebookAPIConfigError) as context:
            load_credentials_from_env()
        
        self.assertIn('Missing required environment variables', str(context.exception))
        self.assertIn('FB_APP_ID', str(context.exception))
    
    def test_load_credentials_from_file_success(self):
        """Test loading credentials from a file."""
        credentials = load_credentials_from_file(self.config_path)
        
        self.assertEqual(credentials['app_id'], '123456789')
        self.assertEqual(credentials['app_secret'], 'test_secret')
        self.assertEqual(credentials['access_token'], 'EAABBCCDDEEFFGGHHIIJJKKLLMMNNOOPPtest_token')
        self.assertEqual(credentials['page_id'], '987654321')
    
    def test_load_credentials_from_file_not_found(self):
        """Test loading credentials from a non-existent file."""
        with self.assertRaises(FacebookAPIConfigError) as context:
            load_credentials_from_file('/nonexistent/path/config.json')
        
        self.assertIn('Configuration file not found', str(context.exception))
    
    def test_load_credentials_from_file_invalid_json(self):
        """Test loading credentials from a file with invalid JSON."""
        # Create a file with invalid JSON
        invalid_json_path = os.path.join(self.temp_dir, 'invalid.json')
        with open(invalid_json_path, 'w') as f:
            f.write('{invalid json')
        
        with self.assertRaises(FacebookAPIConfigError) as context:
            load_credentials_from_file(invalid_json_path)
        
        self.assertIn('Invalid JSON format', str(context.exception))
        
        # Clean up
        os.remove(invalid_json_path)
    
    def test_load_credentials_from_file_missing_keys(self):
        """Test loading credentials from a file with missing required keys."""
        # Create a file with missing keys
        missing_keys_path = os.path.join(self.temp_dir, 'missing_keys.json')
        with open(missing_keys_path, 'w') as f:
            json.dump({'app_id': '123456789'}, f)
        
        with self.assertRaises(FacebookAPIConfigError) as context:
            load_credentials_from_file(missing_keys_path)
        
        self.assertIn('Missing required keys', str(context.exception))
        
        # Clean up
        os.remove(missing_keys_path)
    
    def test_validate_credentials_success(self):
        """Test validating valid credentials."""
        self.assertTrue(validate_credentials(self.valid_credentials))
    
    def test_validate_credentials_missing_keys(self):
        """Test validating credentials with missing keys."""
        invalid_credentials = {'app_id': '123456789', 'app_secret': 'test_secret'}
        
        with self.assertRaises(FacebookAPIConfigError) as context:
            validate_credentials(invalid_credentials)
        
        self.assertIn('Missing required credentials', str(context.exception))
    
    def test_validate_credentials_invalid_app_id(self):
        """Test validating credentials with an invalid app ID."""
        invalid_credentials = self.valid_credentials.copy()
        invalid_credentials['app_id'] = 'not_numeric'
        
        with self.assertRaises(FacebookAPIConfigError) as context:
            validate_credentials(invalid_credentials)
        
        self.assertIn('App ID should contain only digits', str(context.exception))
    
    def test_validate_credentials_short_token(self):
        """Test validating credentials with a token that's too short."""
        invalid_credentials = self.valid_credentials.copy()
        invalid_credentials['access_token'] = 'short'
        
        with self.assertRaises(FacebookAPIConfigError) as context:
            validate_credentials(invalid_credentials)
        
        self.assertIn('Access token appears to be too short', str(context.exception))
    
    @patch('requests.get')
    def test_refresh_access_token_success(self, mock_get):
        """Test refreshing an access token successfully."""
        # Set up the mock response
        mock_response = MagicMock()
        mock_response.json.return_value = {'access_token': 'new_test_token'}
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response
        
        # Call the function
        updated_credentials = refresh_access_token(self.valid_credentials)
        
        # Verify the result
        self.assertEqual(updated_credentials['access_token'], 'new_test_token')
        mock_get.assert_called_once()
        
        # Verify the request parameters
        call_args = mock_get.call_args[1]['params']
        self.assertEqual(call_args['client_id'], '123456789')
        self.assertEqual(call_args['client_secret'], 'test_secret')
        self.assertEqual(call_args['fb_exchange_token'], 'EAABBCCDDEEFFGGHHIIJJKKLLMMNNOOPPtest_token')
    
    @patch('requests.get')
    def test_refresh_access_token_failure(self, mock_get):
        """Test refreshing an access token with an API error."""
        # Set up the mock response to raise an exception
        mock_get.side_effect = Exception('API error')
        
        # Call the function and check for exception
        with self.assertRaises(FacebookAPIConfigError) as context:
            refresh_access_token(self.valid_credentials)
        
        self.assertIn('Failed to refresh Facebook access token', str(context.exception))
    
    @patch('src.analytics.config.load_credentials_from_env')
    @patch('src.analytics.config.validate_credentials')
    def test_load_facebook_api_config_from_env(self, mock_validate, mock_load_env):
        """Test loading configuration from environment variables."""
        # Set up mocks
        mock_load_env.return_value = self.valid_credentials
        mock_validate.return_value = True
        
        # Call the function
        result = load_facebook_api_config()
        
        # Verify the result
        self.assertEqual(result, self.valid_credentials)
        mock_load_env.assert_called_once()
        mock_validate.assert_called_once_with(self.valid_credentials)
    
    @patch('src.analytics.config.load_credentials_from_env')
    @patch('src.analytics.config.load_credentials_from_file')
    @patch('src.analytics.config.validate_credentials')
    def test_load_facebook_api_config_fallback_to_file(self, mock_validate, mock_load_file, mock_load_env):
        """Test loading configuration falling back to file when env vars fail."""
        # Set up mocks
        mock_load_env.side_effect = FacebookAPIConfigError('Missing vars')
        mock_load_file.return_value = self.valid_credentials
        mock_validate.return_value = True
        
        # Call the function
        result = load_facebook_api_config(config_path=self.config_path)
        
        # Verify the result
        self.assertEqual(result, self.valid_credentials)
        mock_load_env.assert_called_once()
        mock_load_file.assert_called_once_with(self.config_path)
        mock_validate.assert_called_once_with(self.valid_credentials)
    
    @patch('src.analytics.config.load_credentials_from_env')
    @patch('src.analytics.config.load_credentials_from_file')
    def test_load_facebook_api_config_both_methods_fail(self, mock_load_file, mock_load_env):
        """Test loading configuration when both methods fail."""
        # Set up mocks
        mock_load_env.side_effect = FacebookAPIConfigError('Missing env vars')
        mock_load_file.side_effect = FacebookAPIConfigError('File not found')
        
        # Call the function and check for exception
        with self.assertRaises(FacebookAPIConfigError) as context:
            load_facebook_api_config(config_path=self.config_path)
        
        self.assertIn('Failed to load Facebook API credentials', str(context.exception))
    
    @patch('src.analytics.config.load_credentials_from_env')
    @patch('src.analytics.config.refresh_access_token')
    def test_load_facebook_api_config_with_refresh(self, mock_refresh, mock_load_env):
        """Test loading configuration with token refresh."""
        # Set up mocks
        mock_load_env.return_value = self.valid_credentials
        mock_refresh.return_value = {**self.valid_credentials, 'access_token': 'refreshed_token'}
        
        # Call the function
        result = load_facebook_api_config(refresh_token=True)
        
        # Verify the result
        self.assertEqual(result['access_token'], 'refreshed_token')
        mock_load_env.assert_called_once()
        mock_refresh.assert_called_once_with(self.valid_credentials)
    
    def test_save_credentials_to_file_success(self):
        """Test saving credentials to a file successfully."""
        # Test file path
        test_save_path = os.path.join(self.temp_dir, 'saved_config.json')
        
        # Save the credentials
        result = save_credentials_to_file(self.valid_credentials, test_save_path)
        
        # Verify the result
        self.assertTrue(result)
        self.assertTrue(os.path.exists(test_save_path))
        
        # Verify the saved content
        with open(test_save_path, 'r') as f:
            saved_credentials = json.load(f)
        
        self.assertEqual(saved_credentials, self.valid_credentials)
        
        # Clean up
        os.remove(test_save_path)
    
    @patch('src.analytics.config.validate_credentials')
    def test_save_credentials_to_file_validation_error(self, mock_validate):
        """Test saving credentials with validation error."""
        # Set up mock to raise an exception
        mock_validate.side_effect = FacebookAPIConfigError('Invalid credentials')
        
        # Test file path
        test_save_path = os.path.join(self.temp_dir, 'saved_config.json')
        
        # Save the credentials
        result = save_credentials_to_file(self.valid_credentials, test_save_path)
        
        # Verify the result
        self.assertFalse(result)
        self.assertFalse(os.path.exists(test_save_path))
    
    @patch('requests.get')
    def test_test_credentials_success(self, mock_get):
        """Test testing credentials with a successful API call."""
        # Set up mock response
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response
        
        # Test the credentials
        success, error = test_credentials(self.valid_credentials)
        
        # Verify the result
        self.assertTrue(success)
        self.assertIsNone(error)
    
    @patch('requests.get')
    def test_test_credentials_api_error(self, mock_get):
        """Test testing credentials with an API error."""
        # Set up mock to raise an exception
        mock_get.side_effect = Exception('API error')
        
        # Test the credentials
        success, error = test_credentials(self.valid_credentials)
        
        # Verify the result
        self.assertFalse(success)
        self.assertIn('API test failed', error)


if __name__ == '__main__':
    unittest.main() 