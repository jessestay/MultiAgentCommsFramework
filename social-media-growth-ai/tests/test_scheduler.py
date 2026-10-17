import os
import unittest
import tempfile
import sqlite3
import datetime
import json
from unittest.mock import MagicMock, patch
from src.scheduler.scheduler import PostScheduler, ScheduleStatus
from src.scheduler.models import ScheduledPost
from src.scheduler.db import SchedulerDatabase

class TestScheduler(unittest.TestCase):
    """Tests for the Facebook post scheduling system."""
    
    def setUp(self):
        """Set up test environment."""
        # Create a temporary database for testing
        self.db_fd, self.db_path = tempfile.mkstemp()
        self.scheduler_db = SchedulerDatabase(self.db_path)
        self.scheduler_db.init_db()
        
        # Create a mock Facebook API client
        self.mock_facebook_client = MagicMock()
        self.mock_facebook_client.create_post.return_value = {"id": "mock_post_id"}
        
        # Initialize the scheduler with mocks
        self.scheduler = PostScheduler(self.scheduler_db, self.mock_facebook_client)
    
    def tearDown(self):
        """Clean up after tests."""
        # Make sure to close the database connection before removing the file
        if self.scheduler_db:
            self.scheduler_db.close()
        
        # Close the file descriptor
        if hasattr(self, 'db_fd'):
            os.close(self.db_fd)
        
        # Try to remove the file, with error handling
        try:
            if hasattr(self, 'db_path') and os.path.exists(self.db_path):
                os.unlink(self.db_path)
        except (PermissionError, OSError) as e:
            print(f"Warning: Could not remove temporary file {self.db_path}: {e}")
    
    def test_create_scheduled_post(self):
        """Test creating a scheduled post."""
        # Arrange
        post_data = {
            "message": "Test scheduled post",
            "page_id": "test_page_id",
            "scheduled_time": datetime.datetime.now() + datetime.timedelta(hours=1)
        }
        
        # Act
        post_id = self.scheduler.schedule_post(**post_data)
        
        # Assert
        self.assertIsNotNone(post_id)
        post = self.scheduler_db.get_post(post_id)
        self.assertEqual(post.message, post_data["message"])
        self.assertEqual(post.status, ScheduleStatus.PENDING)
    
    def test_get_pending_posts(self):
        """Test retrieving pending posts that are due."""
        # Arrange
        past_time = datetime.datetime.now() - datetime.timedelta(minutes=5)
        future_time = datetime.datetime.now() + datetime.timedelta(hours=1)
        
        # Add a post scheduled in the past (should be pending)
        self.scheduler.schedule_post(
            message="Past post", 
            page_id="test_page_id", 
            scheduled_time=past_time
        )
        
        # Add a post scheduled in the future
        self.scheduler.schedule_post(
            message="Future post", 
            page_id="test_page_id", 
            scheduled_time=future_time
        )
        
        # Act
        pending_posts = self.scheduler.get_due_posts()
        
        # Assert
        self.assertEqual(len(pending_posts), 1)
        self.assertEqual(pending_posts[0].message, "Past post")
    
    def test_publish_due_posts(self):
        """Test publishing posts that are due."""
        # Arrange
        past_time = datetime.datetime.now() - datetime.timedelta(minutes=5)
        
        post_id = self.scheduler.schedule_post(
            message="Post to publish", 
            page_id="test_page_id", 
            scheduled_time=past_time
        )
        
        # Act
        published = self.scheduler.publish_due_posts()
        
        # Assert
        self.assertEqual(len(published), 1)
        self.assertEqual(published[0].id, post_id)
        self.assertEqual(published[0].status, ScheduleStatus.PUBLISHED)
        self.mock_facebook_client.create_post.assert_called_once()
    
    def test_handle_api_error(self):
        """Test error handling when the API fails."""
        # Arrange
        past_time = datetime.datetime.now() - datetime.timedelta(minutes=5)
        
        self.mock_facebook_client.create_post.side_effect = Exception("API Error")
        
        post_id = self.scheduler.schedule_post(
            message="Error post", 
            page_id="test_page_id", 
            scheduled_time=past_time
        )
        
        # Act
        published = self.scheduler.publish_due_posts()
        
        # Assert
        self.assertEqual(len(published), 1)
        self.assertEqual(published[0].id, post_id)
        self.assertEqual(published[0].status, ScheduleStatus.FAILED)
        self.assertIsNotNone(published[0].error_message)
    
    def test_edit_scheduled_post(self):
        """Test editing a scheduled post."""
        # Arrange
        future_time = datetime.datetime.now() + datetime.timedelta(hours=1)
        post_id = self.scheduler.schedule_post(
            message="Original message", 
            page_id="test_page_id", 
            scheduled_time=future_time
        )
        
        # Act
        updated = self.scheduler.update_post(
            post_id=post_id,
            message="Updated message",
            scheduled_time=future_time + datetime.timedelta(hours=1)
        )
        
        # Assert
        self.assertTrue(updated)
        post = self.scheduler_db.get_post(post_id)
        self.assertEqual(post.message, "Updated message")
    
    def test_cancel_scheduled_post(self):
        """Test cancelling a scheduled post."""
        # Arrange
        future_time = datetime.datetime.now() + datetime.timedelta(hours=1)
        post_id = self.scheduler.schedule_post(
            message="Post to cancel", 
            page_id="test_page_id", 
            scheduled_time=future_time
        )
        
        # Act
        cancelled = self.scheduler.cancel_post(post_id)
        
        # Assert
        self.assertTrue(cancelled)
        post = self.scheduler_db.get_post(post_id)
        self.assertEqual(post.status, ScheduleStatus.CANCELLED)
    
    def test_retry_failed_post(self):
        """Test retrying a failed post."""
        # Arrange
        past_time = datetime.datetime.now() - datetime.timedelta(minutes=5)
        
        # First make it fail
        self.mock_facebook_client.create_post.side_effect = Exception("API Error")
        post_id = self.scheduler.schedule_post(
            message="Failed post", 
            page_id="test_page_id", 
            scheduled_time=past_time
        )
        self.scheduler.publish_due_posts()
        
        # Reset the mock for retry
        self.mock_facebook_client.create_post.side_effect = None
        self.mock_facebook_client.create_post.return_value = {"id": "mock_post_id"}
        
        # Act
        retried = self.scheduler.retry_post(post_id)
        
        # Assert
        self.assertTrue(retried)
        post = self.scheduler_db.get_post(post_id)
        self.assertEqual(post.status, ScheduleStatus.PUBLISHED)


if __name__ == '__main__':
    unittest.main() 