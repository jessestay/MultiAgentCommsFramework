"""
Unit tests for the TriggerSystem class.
"""

import os
import json
import unittest
import tempfile
import shutil
import datetime
from unittest.mock import MagicMock, patch

from role_automation.trigger_system import TriggerSystem

class TestTriggerSystem(unittest.TestCase):
    """Test cases for the TriggerSystem class."""
    
    def setUp(self):
        """Set up test environment."""
        # Create temporary directory for test files
        self.test_dir = tempfile.mkdtemp()
        self.config_path = os.path.join(self.test_dir, 'triggers.json')
        
        # Create test configuration
        self.test_config = {
            "scheduled_triggers": [
                {
                    "id": "daily_report",
                    "schedule": "daily",
                    "time": "09:00",
                    "source_role": "ES",
                    "target_role": "BIC",
                    "message_template": "Daily report for {date}",
                    "active": True
                }
            ],
            "event_triggers": [
                {
                    "id": "new_client",
                    "event_type": "new_client",
                    "source_role": "ES",
                    "target_role": "MD",
                    "message_template": "New client: {client_name}",
                    "active": True
                }
            ]
        }
        
        # Write test configuration to file
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        with open(self.config_path, 'w') as f:
            json.dump(self.test_config, f)
        
        # Create mock objects
        self.mock_security_manager = MagicMock()
        self.mock_message_router = MagicMock()
        
        # Initialize TriggerSystem with test configuration
        self.trigger_system = TriggerSystem(
            self.mock_security_manager,
            self.mock_message_router,
            config_path=self.config_path
        )
    
    def tearDown(self):
        """Clean up test environment."""
        # Stop the trigger system if it's running
        if hasattr(self.trigger_system, '_running') and self.trigger_system._running:
            self.trigger_system.stop()
        
        shutil.rmtree(self.test_dir)
    
    def test_load_config(self):
        """Test loading configuration from file."""
        # Check that configuration was loaded correctly
        self.assertEqual(len(self.trigger_system.scheduled_triggers), 1)
        self.assertEqual(len(self.trigger_system.event_triggers), 1)
        
        # Check scheduled trigger details
        scheduled_trigger = self.trigger_system.scheduled_triggers[0]
        self.assertEqual(scheduled_trigger["id"], "daily_report")
        self.assertEqual(scheduled_trigger["schedule"], "daily")
        self.assertEqual(scheduled_trigger["time"], "09:00")
        
        # Check event trigger details
        event_trigger = self.trigger_system.event_triggers[0]
        self.assertEqual(event_trigger["id"], "new_client")
        self.assertEqual(event_trigger["event_type"], "new_client")
        
        # Test loading non-existent configuration
        non_existent_path = os.path.join(self.test_dir, 'non_existent.json')
        trigger_system = TriggerSystem(
            self.mock_security_manager,
            self.mock_message_router,
            config_path=non_existent_path
        )
        
        # Check that default configuration was created
        self.assertTrue(os.path.exists(non_existent_path))
        with open(non_existent_path, 'r') as f:
            config = json.load(f)
        
        self.assertIn("scheduled_triggers", config)
        self.assertIn("event_triggers", config)
    
    def test_add_scheduled_trigger(self):
        """Test adding a scheduled trigger."""
        # Add a new scheduled trigger
        trigger_data = {
            "id": "weekly_summary",
            "schedule": "weekly",
            "day_of_week": "Monday",
            "time": "10:00",
            "source_role": "ES",
            "target_role": "BIC",
            "message_template": "Weekly summary for {week_number}",
            "active": True
        }
        
        result = self.trigger_system.add_scheduled_trigger(trigger_data)
        
        # Check that addition was successful
        self.assertTrue(result)
        
        # Check that trigger was added to configuration
        self.assertEqual(len(self.trigger_system.scheduled_triggers), 2)
        
        # Check that configuration was saved to file
        with open(self.config_path, 'r') as f:
            config = json.load(f)
        
        self.assertEqual(len(config["scheduled_triggers"]), 2)
        
        # Test adding a trigger with an existing ID
        duplicate_trigger = {
            "id": "weekly_summary",
            "schedule": "daily",
            "time": "12:00"
        }
        
        result = self.trigger_system.add_scheduled_trigger(duplicate_trigger)
        self.assertFalse(result)
        
        # Test adding a trigger with missing required fields
        invalid_trigger = {
            "id": "invalid_trigger",
            "schedule": "daily"
            # Missing time field
        }
        
        result = self.trigger_system.add_scheduled_trigger(invalid_trigger)
        self.assertFalse(result)
    
    def test_add_event_trigger(self):
        """Test adding an event trigger."""
        # Add a new event trigger
        trigger_data = {
            "id": "task_completed",
            "event_type": "task_completed",
            "source_role": "ES",
            "target_role": "BIC",
            "message_template": "Task completed: {task_name}",
            "active": True
        }
        
        result = self.trigger_system.add_event_trigger(trigger_data)
        
        # Check that addition was successful
        self.assertTrue(result)
        
        # Check that trigger was added to configuration
        self.assertEqual(len(self.trigger_system.event_triggers), 2)
        
        # Check that configuration was saved to file
        with open(self.config_path, 'r') as f:
            config = json.load(f)
        
        self.assertEqual(len(config["event_triggers"]), 2)
        
        # Test adding a trigger with an existing ID
        duplicate_trigger = {
            "id": "task_completed",
            "event_type": "different_event"
        }
        
        result = self.trigger_system.add_event_trigger(duplicate_trigger)
        self.assertFalse(result)
        
        # Test adding a trigger with missing required fields
        invalid_trigger = {
            "id": "invalid_trigger"
            # Missing event_type field
        }
        
        result = self.trigger_system.add_event_trigger(invalid_trigger)
        self.assertFalse(result)
    
    def test_update_trigger(self):
        """Test updating a trigger."""
        # Update an existing scheduled trigger
        updated_data = {
            "id": "daily_report",
            "time": "10:00",  # Changed from 09:00
            "active": False   # Changed from True
        }
        
        result = self.trigger_system.update_trigger("scheduled", "daily_report", updated_data)
        
        # Check that update was successful
        self.assertTrue(result)
        
        # Check that trigger was updated in configuration
        updated_trigger = next(t for t in self.trigger_system.scheduled_triggers if t["id"] == "daily_report")
        self.assertEqual(updated_trigger["time"], "10:00")
        self.assertFalse(updated_trigger["active"])
        
        # Check that other fields were preserved
        self.assertEqual(updated_trigger["schedule"], "daily")
        self.assertEqual(updated_trigger["source_role"], "ES")
        
        # Test updating a non-existent trigger
        result = self.trigger_system.update_trigger("scheduled", "non_existent", {"time": "11:00"})
        self.assertFalse(result)
        
        # Test updating with an invalid trigger type
        result = self.trigger_system.update_trigger("invalid_type", "daily_report", {"time": "11:00"})
        self.assertFalse(result)
    
    def test_delete_trigger(self):
        """Test deleting a trigger."""
        # Delete an existing scheduled trigger
        result = self.trigger_system.delete_trigger("scheduled", "daily_report")
        
        # Check that deletion was successful
        self.assertTrue(result)
        
        # Check that trigger was removed from configuration
        self.assertEqual(len(self.trigger_system.scheduled_triggers), 0)
        
        # Check that configuration was saved to file
        with open(self.config_path, 'r') as f:
            config = json.load(f)
        
        self.assertEqual(len(config["scheduled_triggers"]), 0)
        
        # Test deleting a non-existent trigger
        result = self.trigger_system.delete_trigger("scheduled", "non_existent")
        self.assertFalse(result)
        
        # Test deleting with an invalid trigger type
        result = self.trigger_system.delete_trigger("invalid_type", "daily_report")
        self.assertFalse(result)
    
    @patch('role_automation.trigger_system.schedule')
    def test_start_stop(self, mock_schedule):
        """Test starting and stopping the trigger system."""
        # Start the trigger system
        self.trigger_system.start()
        
        # Check that the system is running
        self.assertTrue(self.trigger_system._running)
        
        # Check that schedule.run_pending was called
        mock_schedule.run_pending.assert_called()
        
        # Stop the trigger system
        self.trigger_system.stop()
        
        # Check that the system is stopped
        self.assertFalse(self.trigger_system._running)
    
    def test_fire_event(self):
        """Test firing an event."""
        # Fire an event that matches a trigger
        event_data = {
            "event_type": "new_client",
            "client_name": "Test Client"
        }
        
        self.trigger_system.fire_event(event_data)
        
        # Check that message_router.route_message was called
        self.mock_message_router.route_message.assert_called_once()
        
        # Check message content
        args, _ = self.mock_message_router.route_message.call_args
        message = args[0]
        self.assertEqual(message["source_role"], "ES")
        self.assertEqual(message["target_role"], "MD")
        self.assertEqual(message["content"], "New client: Test Client")
        
        # Test firing an event with no matching trigger
        self.mock_message_router.reset_mock()
        
        event_data = {
            "event_type": "unknown_event"
        }
        
        self.trigger_system.fire_event(event_data)
        
        # Check that message_router.route_message was not called
        self.mock_message_router.route_message.assert_not_called()
    
    @patch('role_automation.trigger_system.datetime')
    def test_process_scheduled_triggers(self, mock_datetime):
        """Test processing scheduled triggers."""
        # Set up mock datetime to return a specific time
        mock_now = datetime.datetime(2023, 1, 1, 9, 0)  # 9:00 AM
        mock_datetime.datetime.now.return_value = mock_now
        mock_datetime.datetime.side_effect = lambda *args, **kw: datetime.datetime(*args, **kw)
        
        # Process scheduled triggers
        self.trigger_system._process_scheduled_triggers()
        
        # Check that message_router.route_message was called for the daily trigger
        self.mock_message_router.route_message.assert_called_once()
        
        # Check message content
        args, _ = self.mock_message_router.route_message.call_args
        message = args[0]
        self.assertEqual(message["source_role"], "ES")
        self.assertEqual(message["target_role"], "BIC")
        expected_content = f"Daily report for {mock_now.strftime('%Y-%m-%d')}"
        self.assertEqual(message["content"], expected_content)
        
        # Test with a different time (no triggers should fire)
        self.mock_message_router.reset_mock()
        
        mock_now = datetime.datetime(2023, 1, 1, 10, 0)  # 10:00 AM
        mock_datetime.datetime.now.return_value = mock_now
        
        self.trigger_system._process_scheduled_triggers()
        
        # Check that message_router.route_message was not called
        self.mock_message_router.route_message.assert_not_called()
    
    def test_get_trigger(self):
        """Test retrieving a trigger."""
        # Get an existing scheduled trigger
        trigger = self.trigger_system.get_trigger("scheduled", "daily_report")
        
        # Check that trigger was retrieved
        self.assertIsNotNone(trigger)
        self.assertEqual(trigger["id"], "daily_report")
        
        # Get an existing event trigger
        trigger = self.trigger_system.get_trigger("event", "new_client")
        
        # Check that trigger was retrieved
        self.assertIsNotNone(trigger)
        self.assertEqual(trigger["id"], "new_client")
        
        # Test getting a non-existent trigger
        trigger = self.trigger_system.get_trigger("scheduled", "non_existent")
        self.assertIsNone(trigger)
        
        # Test getting with an invalid trigger type
        trigger = self.trigger_system.get_trigger("invalid_type", "daily_report")
        self.assertIsNone(trigger)
    
    def test_list_triggers(self):
        """Test listing triggers."""
        # List all triggers
        triggers = self.trigger_system.list_triggers()
        
        # Check that all triggers are listed
        self.assertEqual(len(triggers["scheduled"]), 1)
        self.assertEqual(len(triggers["event"]), 1)
        
        # Check trigger details
        self.assertEqual(triggers["scheduled"][0]["id"], "daily_report")
        self.assertEqual(triggers["event"][0]["id"], "new_client")
        
        # Test listing with filter
        triggers = self.trigger_system.list_triggers(trigger_type="scheduled")
        
        # Check that only scheduled triggers are listed
        self.assertEqual(len(triggers["scheduled"]), 1)
        self.assertNotIn("event", triggers)
        
        # Test listing with active filter
        # First, update a trigger to be inactive
        self.trigger_system.update_trigger("scheduled", "daily_report", {"active": False})
        
        triggers = self.trigger_system.list_triggers(active_only=True)
        
        # Check that only active triggers are listed
        self.assertEqual(len(triggers["scheduled"]), 0)
        self.assertEqual(len(triggers["event"]), 1)

if __name__ == '__main__':
    unittest.main() 