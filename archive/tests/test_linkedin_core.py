import unittest
from unittest.mock import patch, MagicMock
from linkedin_core import LinkedInCore

class TestLinkedInCore(unittest.TestCase):
    
    @patch('selenium.webdriver.Chrome')
    def test_stealth_setup(self, mock_chrome):
        # Arrange
        mock_driver = MagicMock()
        mock_chrome.return_value = mock_driver
        
        # Act
        driver = LinkedInCore.setup_driver()
        
        # Assert
        self.assertTrue(mock_driver.execute_script.called)
        # Verify stealth was applied
        
    # Add more tests for other core functions 