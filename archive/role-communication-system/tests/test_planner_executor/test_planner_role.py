"""
Unit tests for the PlannerRole class.
"""

import unittest
import uuid
from unittest.mock import MagicMock, patch
from datetime import datetime

from role_automation.planner_executor.planner_role import PlannerRole

class TestPlannerRole(unittest.TestCase):
    """Test cases for the PlannerRole class."""
    
    def setUp(self):
        """Set up test environment."""
        self.storage_manager = MagicMock()
        self.message_router = MagicMock()
        self.planner = PlannerRole("TEST_PLANNER", self.storage_manager, self.message_router)
    
    @patch('uuid.uuid4')
    @patch('datetime.datetime')
    def test_create_plan(self, mock_datetime, mock_uuid):
        """Test creating a plan."""
        # Mock UUID and datetime
        mock_uuid.return_value = uuid.UUID('12345678-1234-5678-1234-567812345678')
        mock_datetime.now.return_value = datetime(2023, 1, 1, 12, 0, 0)
        mock_datetime.now().isoformat.return_value = "2023-01-01T12:00:00"
        
        # Create a plan
        task_description = "Test task"
        available_roles = ["ES", "BIC", "MD"]
        plan = self.planner.create_plan(task_description, available_roles)
        
        # Check plan structure
        self.assertEqual(plan["id"], "12345678-1234-5678-1234-567812345678")
        self.assertEqual(plan["description"], task_description)
        self.assertEqual(plan["created_by"], "TEST_PLANNER")
        self.assertEqual(plan["created_at"], "2023-01-01T12:00:00")
        self.assertEqual(plan["updated_at"], "2023-01-01T12:00:00")
        self.assertEqual(plan["status"], "planning")
        self.assertEqual(plan["steps"], [])
        self.assertEqual(plan["role_assignments"], {})
        self.assertEqual(plan["dependencies"], {})
        self.assertEqual(plan["available_roles"], available_roles)
        self.assertEqual(plan["metadata"], {})
        
        # Check that the plan was stored
        self.storage_manager._store_plan.assert_called_once_with(plan)
    
    @patch('datetime.datetime')
    def test_add_step(self, mock_datetime):
        """Test adding a step to a plan."""
        # Mock datetime
        mock_datetime.now.return_value = datetime(2023, 1, 1, 12, 0, 0)
        mock_datetime.now().isoformat.return_value = "2023-01-01T12:00:00"
        
        # Create a plan
        plan = {
            "id": "test-plan",
            "description": "Test plan",
            "created_by": "TEST_PLANNER",
            "created_at": "2023-01-01T12:00:00",
            "updated_at": "2023-01-01T12:00:00",
            "status": "planning",
            "steps": [],
            "role_assignments": {},
            "dependencies": {},
            "available_roles": ["ES", "BIC", "MD"],
            "metadata": {}
        }
        
        # Add a step
        step_description = "Test step"
        acceptance_criteria = ["Criterion 1", "Criterion 2"]
        updated_plan = self.planner.add_step(plan, step_description, acceptance_criteria, 3)
        
        # Check that the step was added
        self.assertEqual(len(updated_plan["steps"]), 1)
        step = updated_plan["steps"][0]
        self.assertEqual(step["id"], "step_1")
        self.assertEqual(step["description"], step_description)
        self.assertEqual(step["acceptance_criteria"], acceptance_criteria)
        self.assertEqual(step["estimated_effort"], 3)
        self.assertEqual(step["status"], "pending")
        self.assertEqual(step["created_at"], "2023-01-01T12:00:00")
        self.assertEqual(step["updated_at"], "2023-01-01T12:00:00")
        self.assertIsNone(step["assigned_role"])
        self.assertEqual(step["dependencies"], [])
        
        # Check that the plan was updated
        self.assertEqual(updated_plan["updated_at"], "2023-01-01T12:00:00")
        
        # Check that the plan was stored
        self.storage_manager._store_plan.assert_called_once_with(updated_plan)
    
    @patch('datetime.datetime')
    def test_assign_role(self, mock_datetime):
        """Test assigning a role to a step."""
        # Mock datetime
        mock_datetime.now.return_value = datetime(2023, 1, 1, 12, 0, 0)
        mock_datetime.now().isoformat.return_value = "2023-01-01T12:00:00"
        
        # Create a plan with a step
        plan = {
            "id": "test-plan",
            "description": "Test plan",
            "created_by": "TEST_PLANNER",
            "created_at": "2023-01-01T12:00:00",
            "updated_at": "2023-01-01T12:00:00",
            "status": "planning",
            "steps": [
                {
                    "id": "step_1",
                    "description": "Test step",
                    "acceptance_criteria": ["Criterion 1", "Criterion 2"],
                    "estimated_effort": 3,
                    "status": "pending",
                    "created_at": "2023-01-01T12:00:00",
                    "updated_at": "2023-01-01T12:00:00",
                    "assigned_role": None,
                    "dependencies": []
                }
            ],
            "role_assignments": {},
            "dependencies": {},
            "available_roles": ["ES", "BIC", "MD"],
            "metadata": {}
        }
        
        # Assign a role
        updated_plan = self.planner.assign_role(plan, "step_1", "BIC")
        
        # Check that the role was assigned
        self.assertEqual(updated_plan["steps"][0]["assigned_role"], "BIC")
        self.assertEqual(updated_plan["steps"][0]["updated_at"], "2023-01-01T12:00:00")
        
        # Check that the role assignment was updated
        self.assertEqual(updated_plan["role_assignments"], {"BIC": ["step_1"]})
        
        # Check that the plan was updated
        self.assertEqual(updated_plan["updated_at"], "2023-01-01T12:00:00")
        
        # Check that the plan was stored
        self.storage_manager._store_plan.assert_called_once_with(updated_plan)
        
        # Test assigning a role that is not available
        self.storage_manager.reset_mock()
        result = self.planner.assign_role(plan, "step_1", "UNKNOWN")
        
        # Check that the plan was not modified
        self.assertEqual(result, plan)
        self.storage_manager._store_plan.assert_not_called()
        
        # Test assigning a role to a non-existent step
        self.storage_manager.reset_mock()
        result = self.planner.assign_role(plan, "non_existent", "BIC")
        
        # Check that the plan was not modified
        self.assertEqual(result, plan)
        self.storage_manager._store_plan.assert_not_called()
    
    @patch('datetime.datetime')
    def test_add_dependency(self, mock_datetime):
        """Test adding a dependency between steps."""
        # Mock datetime
        mock_datetime.now.return_value = datetime(2023, 1, 1, 12, 0, 0)
        mock_datetime.now().isoformat.return_value = "2023-01-01T12:00:00"
        
        # Create a plan with two steps
        plan = {
            "id": "test-plan",
            "description": "Test plan",
            "created_by": "TEST_PLANNER",
            "created_at": "2023-01-01T12:00:00",
            "updated_at": "2023-01-01T12:00:00",
            "status": "planning",
            "steps": [
                {
                    "id": "step_1",
                    "description": "Test step 1",
                    "acceptance_criteria": ["Criterion 1"],
                    "estimated_effort": 1,
                    "status": "pending",
                    "created_at": "2023-01-01T12:00:00",
                    "updated_at": "2023-01-01T12:00:00",
                    "assigned_role": None,
                    "dependencies": []
                },
                {
                    "id": "step_2",
                    "description": "Test step 2",
                    "acceptance_criteria": ["Criterion 2"],
                    "estimated_effort": 2,
                    "status": "pending",
                    "created_at": "2023-01-01T12:00:00",
                    "updated_at": "2023-01-01T12:00:00",
                    "assigned_role": None,
                    "dependencies": []
                }
            ],
            "role_assignments": {},
            "dependencies": {},
            "available_roles": ["ES", "BIC", "MD"],
            "metadata": {}
        }
        
        # Add a dependency
        updated_plan = self.planner.add_dependency(plan, "step_2", "step_1")
        
        # Check that the dependency was added to the step
        self.assertEqual(updated_plan["steps"][1]["dependencies"], ["step_1"])
        
        # Check that the dependency was added to the plan
        self.assertEqual(updated_plan["dependencies"], {"step_1": ["step_2"]})
        
        # Check that the plan was updated
        self.assertEqual(updated_plan["updated_at"], "2023-01-01T12:00:00")
        
        # Check that the plan was stored
        self.storage_manager._store_plan.assert_called_once_with(updated_plan)
        
        # Test adding a dependency with non-existent steps
        self.storage_manager.reset_mock()
        result = self.planner.add_dependency(plan, "non_existent", "step_1")
        
        # Check that the plan was not modified
        self.assertEqual(result, plan)
        self.storage_manager._store_plan.assert_not_called()
    
    @patch('role_automation.planner_executor.validation.validate_plan')
    def test_validate_plan(self, mock_validate_plan):
        """Test validating a plan."""
        # Mock validation result
        mock_validate_plan.return_value = (True, "Plan is valid", [])
        
        # Create a plan
        plan = {
            "id": "test-plan",
            "description": "Test plan",
            "created_by": "TEST_PLANNER",
            "created_at": "2023-01-01T12:00:00",
            "updated_at": "2023-01-01T12:00:00",
            "status": "planning",
            "steps": [],
            "role_assignments": {},
            "dependencies": {},
            "available_roles": ["ES", "BIC", "MD"],
            "metadata": {}
        }
        
        # Validate the plan
        is_valid, message, issues = self.planner.validate_plan(plan)
        
        # Check validation result
        self.assertTrue(is_valid)
        self.assertEqual(message, "Plan is valid")
        self.assertEqual(issues, [])
        
        # Check that validate_plan was called
        mock_validate_plan.assert_called_once_with(plan)
    
    @patch('datetime.datetime')
    @patch('role_automation.planner_executor.validation.validate_plan')
    def test_finalize_plan(self, mock_validate_plan, mock_datetime):
        """Test finalizing a plan."""
        # Mock datetime
        mock_datetime.now.return_value = datetime(2023, 1, 1, 12, 0, 0)
        mock_datetime.now().isoformat.return_value = "2023-01-01T12:00:00"
        
        # Mock validation result
        mock_validate_plan.return_value = (True, "Plan is valid", [])
        
        # Create a plan
        plan = {
            "id": "test-plan",
            "description": "Test plan",
            "created_by": "TEST_PLANNER",
            "created_at": "2023-01-01T12:00:00",
            "updated_at": "2023-01-01T12:00:00",
            "status": "planning",
            "steps": [
                {
                    "id": "step_1",
                    "description": "Test step",
                    "acceptance_criteria": ["Criterion 1"],
                    "estimated_effort": 1,
                    "status": "pending",
                    "created_at": "2023-01-01T12:00:00",
                    "updated_at": "2023-01-01T12:00:00",
                    "assigned_role": "BIC",
                    "dependencies": []
                }
            ],
            "role_assignments": {"BIC": ["step_1"]},
            "dependencies": {},
            "available_roles": ["ES", "BIC", "MD"],
            "metadata": {}
        }
        
        # Finalize the plan
        updated_plan = self.planner.finalize_plan(plan)
        
        # Check that the plan status was updated
        self.assertEqual(updated_plan["status"], "ready")
        self.assertEqual(updated_plan["updated_at"], "2023-01-01T12:00:00")
        
        # Check that the plan was stored
        self.storage_manager._store_plan.assert_called_once_with(updated_plan)
        
        # Check that assigned roles were notified
        self.planner._notify_assigned_roles.assert_called_once_with(updated_plan)
        
        # Test finalizing an invalid plan
        self.storage_manager.reset_mock()
        self.planner._notify_assigned_roles.reset_mock()
        mock_validate_plan.return_value = (False, "Plan is invalid", ["Error 1"])
        
        result = self.planner.finalize_plan(plan)
        
        # Check that the plan was not finalized
        self.assertEqual(result["status"], "planning")
        self.assertEqual(result["metadata"]["validation_issues"], ["Error 1"])
        self.storage_manager._store_plan.assert_not_called()
        self.planner._notify_assigned_roles.assert_not_called()
    
    @patch('datetime.datetime')
    def test_update_step_status(self, mock_datetime):
        """Test updating the status of a step."""
        # Mock datetime
        mock_datetime.now.return_value = datetime(2023, 1, 1, 12, 0, 0)
        mock_datetime.now().isoformat.return_value = "2023-01-01T12:00:00"
        
        # Create a plan with a step
        plan = {
            "id": "test-plan",
            "description": "Test plan",
            "created_by": "TEST_PLANNER",
            "created_at": "2023-01-01T12:00:00",
            "updated_at": "2023-01-01T12:00:00",
            "status": "ready",
            "steps": [
                {
                    "id": "step_1",
                    "description": "Test step",
                    "acceptance_criteria": ["Criterion 1"],
                    "estimated_effort": 1,
                    "status": "pending",
                    "created_at": "2023-01-01T12:00:00",
                    "updated_at": "2023-01-01T12:00:00",
                    "assigned_role": "BIC",
                    "dependencies": []
                }
            ],
            "role_assignments": {"BIC": ["step_1"]},
            "dependencies": {},
            "available_roles": ["ES", "BIC", "MD"],
            "metadata": {}
        }
        
        # Update step status
        artifacts = [{"type": "document", "url": "https://example.com/doc"}]
        updated_plan = self.planner.update_step_status(plan, "step_1", "completed", artifacts)
        
        # Check that the step status was updated
        self.assertEqual(updated_plan["steps"][0]["status"], "completed")
        self.assertEqual(updated_plan["steps"][0]["updated_at"], "2023-01-01T12:00:00")
        self.assertEqual(updated_plan["steps"][0]["artifacts"], artifacts)
        
        # Check that the plan was updated
        self.assertEqual(updated_plan["updated_at"], "2023-01-01T12:00:00")
        self.assertEqual(updated_plan["status"], "completed")  # All steps are completed
        
        # Check that the plan was stored
        self.storage_manager._store_plan.assert_called_once_with(updated_plan)
        
        # Test updating a non-existent step
        self.storage_manager.reset_mock()
        result = self.planner.update_step_status(plan, "non_existent", "completed")
        
        # Check that the plan was not modified
        self.assertEqual(result, plan)
        self.storage_manager._store_plan.assert_not_called()
    
    def test_get_plan(self):
        """Test retrieving a plan."""
        # Mock _retrieve_plan
        self.planner._retrieve_plan = MagicMock()
        self.planner._retrieve_plan.return_value = {"id": "test-plan"}
        
        # Get the plan
        plan = self.planner.get_plan("test-plan")
        
        # Check that _retrieve_plan was called
        self.planner._retrieve_plan.assert_called_once_with("test-plan")
        
        # Check that the plan was returned
        self.assertEqual(plan, {"id": "test-plan"})
        
        # Test with no storage manager
        self.planner.storage_manager = None
        plan = self.planner.get_plan("test-plan")
        
        # Check that None was returned
        self.assertIsNone(plan)
    
    def test_list_plans(self):
        """Test listing plans."""
        # Mock _list_plans
        self.planner._list_plans = MagicMock()
        self.planner._list_plans.return_value = [{"id": "plan1"}, {"id": "plan2"}]
        
        # List plans
        plans = self.planner.list_plans()
        
        # Check that _list_plans was called
        self.planner._list_plans.assert_called_once_with(None)
        
        # Check that plans were returned
        self.assertEqual(plans, [{"id": "plan1"}, {"id": "plan2"}])
        
        # Test with status filter
        self.planner._list_plans.reset_mock()
        plans = self.planner.list_plans("completed")
        
        # Check that _list_plans was called with status
        self.planner._list_plans.assert_called_once_with("completed")
        
        # Test with no storage manager
        self.planner.storage_manager = None
        plans = self.planner.list_plans()
        
        # Check that empty list was returned
        self.assertEqual(plans, [])
    
    def test_store_plan(self):
        """Test storing a plan."""
        # Create a plan
        plan = {
            "id": "test-plan",
            "description": "Test plan",
            "created_by": "TEST_PLANNER",
            "created_at": "2023-01-01T12:00:00",
            "updated_at": "2023-01-01T12:00:00",
            "status": "planning",
            "steps": [],
            "role_assignments": {},
            "dependencies": {},
            "available_roles": ["ES", "BIC", "MD"],
            "metadata": {}
        }
        
        # Mock storage manager methods
        self.storage_manager.get_conversation.return_value = None
        self.storage_manager.create_conversation.return_value = True
        self.storage_manager.add_message.return_value = True
        
        # Store the plan
        result = self.planner._store_plan(plan)
        
        # Check that the conversation was created
        self.storage_manager.get_conversation.assert_called_once_with("plan_test-plan")
        self.storage_manager.create_conversation.assert_called_once()
        
        # Check that the message was added
        self.storage_manager.add_message.assert_called_once()
        args, _ = self.storage_manager.add_message.call_args
        self.assertEqual(args[0], "plan_test-plan")
        self.assertEqual(args[1]["source_role"], "TEST_PLANNER")
        self.assertEqual(args[1]["target_role"], "*")
        self.assertEqual(args[1]["content"], "Plan update")
        self.assertEqual(args[1]["metadata"]["plan"], plan)
        
        # Check result
        self.assertTrue(result)
        
        # Test with existing conversation
        self.storage_manager.reset_mock()
        self.storage_manager.get_conversation.return_value = {"id": "plan_test-plan"}
        
        result = self.planner._store_plan(plan)
        
        # Check that the conversation was not created
        self.storage_manager.get_conversation.assert_called_once_with("plan_test-plan")
        self.storage_manager.create_conversation.assert_not_called()
        
        # Check that the message was added
        self.storage_manager.add_message.assert_called_once()
        
        # Test with error
        self.storage_manager.reset_mock()
        self.storage_manager.get_conversation.side_effect = Exception("Test error")
        
        result = self.planner._store_plan(plan)
        
        # Check result
        self.assertFalse(result)
    
    def test_retrieve_plan(self):
        """Test retrieving a plan."""
        # Mock storage manager methods
        messages = [
            {
                "metadata": {
                    "plan": {"id": "test-plan", "version": 1}
                },
                "timestamp": "2023-01-01T12:00:00"
            },
            {
                "metadata": {
                    "plan": {"id": "test-plan", "version": 2}
                },
                "timestamp": "2023-01-01T13:00:00"
            }
        ]
        self.storage_manager.get_conversation_messages.return_value = messages
        
        # Retrieve the plan
        plan = self.planner._retrieve_plan("test-plan")
        
        # Check that get_conversation_messages was called
        self.storage_manager.get_conversation_messages.assert_called_once_with("plan_test-plan")
        
        # Check that the latest plan was returned
        self.assertEqual(plan, {"id": "test-plan", "version": 2})
        
        # Test with no messages
        self.storage_manager.reset_mock()
        self.storage_manager.get_conversation_messages.return_value = []
        
        plan = self.planner._retrieve_plan("test-plan")
        
        # Check that None was returned
        self.assertIsNone(plan)
        
        # Test with no plan messages
        self.storage_manager.reset_mock()
        self.storage_manager.get_conversation_messages.return_value = [{"content": "Not a plan message"}]
        
        plan = self.planner._retrieve_plan("test-plan")
        
        # Check that None was returned
        self.assertIsNone(plan)
        
        # Test with error
        self.storage_manager.reset_mock()
        self.storage_manager.get_conversation_messages.side_effect = Exception("Test error")
        
        plan = self.planner._retrieve_plan("test-plan")
        
        # Check that None was returned
        self.assertIsNone(plan)
    
    def test_list_plans_implementation(self):
        """Test the implementation of _list_plans."""
        # Mock storage manager methods
        conversations = [
            {
                "id": "plan_1",
                "metadata": {
                    "type": "plan",
                    "plan_id": "plan1"
                }
            },
            {
                "id": "plan_2",
                "metadata": {
                    "type": "plan",
                    "plan_id": "plan2"
                }
            },
            {
                "id": "not_a_plan",
                "metadata": {
                    "type": "conversation"
                }
            }
        ]
        self.storage_manager.list_conversations.return_value = conversations
        
        # Mock _retrieve_plan
        self.planner._retrieve_plan = MagicMock()
        self.planner._retrieve_plan.side_effect = [
            {"id": "plan1", "status": "planning"},
            {"id": "plan2", "status": "completed"}
        ]
        
        # List all plans
        plans = self.planner._list_plans()
        
        # Check that list_conversations was called
        self.storage_manager.list_conversations.assert_called_once()
        args, _ = self.storage_manager.list_conversations.call_args
        self.assertEqual(args[0], {"metadata": {"type": "plan"}})
        
        # Check that _retrieve_plan was called for each plan
        self.assertEqual(self.planner._retrieve_plan.call_count, 2)
        self.planner._retrieve_plan.assert_any_call("plan1")
        self.planner._retrieve_plan.assert_any_call("plan2")
        
        # Check that all plans were returned
        self.assertEqual(len(plans), 2)
        self.assertEqual(plans[0]["id"], "plan1")
        self.assertEqual(plans[1]["id"], "plan2")
        
        # Test with status filter
        self.storage_manager.reset_mock()
        self.planner._retrieve_plan.reset_mock()
        self.planner._retrieve_plan.side_effect = [
            {"id": "plan1", "status": "planning"},
            {"id": "plan2", "status": "completed"}
        ]
        
        plans = self.planner._list_plans("completed")
        
        # Check that only completed plans were returned
        self.assertEqual(len(plans), 1)
        self.assertEqual(plans[0]["id"], "plan2")
        
        # Test with error
        self.storage_manager.reset_mock()
        self.storage_manager.list_conversations.side_effect = Exception("Test error")
        
        plans = self.planner._list_plans()
        
        # Check that empty list was returned
        self.assertEqual(plans, [])
    
    def test_notify_assigned_roles(self):
        """Test notifying assigned roles."""
        # Create a plan with assignments
        plan = {
            "id": "test-plan",
            "description": "Test plan",
            "created_by": "TEST_PLANNER",
            "created_at": "2023-01-01T12:00:00",
            "updated_at": "2023-01-01T12:00:00",
            "status": "ready",
            "steps": [
                {
                    "id": "step_1",
                    "description": "Test step 1",
                    "acceptance_criteria": ["Criterion 1"],
                    "estimated_effort": 1,
                    "status": "pending",
                    "created_at": "2023-01-01T12:00:00",
                    "updated_at": "2023-01-01T12:00:00",
                    "assigned_role": "BIC",
                    "dependencies": []
                },
                {
                    "id": "step_2",
                    "description": "Test step 2",
                    "acceptance_criteria": ["Criterion 2"],
                    "estimated_effort": 2,
                    "status": "pending",
                    "created_at": "2023-01-01T12:00:00",
                    "updated_at": "2023-01-01T12:00:00",
                    "assigned_role": "MD",
                    "dependencies": []
                }
            ],
            "role_assignments": {
                "BIC": ["step_1"],
                "MD": ["step_2"]
            },
            "dependencies": {},
            "available_roles": ["ES", "BIC", "MD"],
            "metadata": {}
        }
        
        # Notify assigned roles
        self.planner._notify_assigned_roles(plan)
        
        # Check that message_router.route_message was called for each role
        self.assertEqual(self.message_router.route_message.call_count, 2)
        
        # Check first message
        args1, _ = self.message_router.route_message.call_args_list[0]
        message1 = args1[0]
        self.assertEqual(message1["source_role"], "TEST_PLANNER")
        self.assertEqual(message1["target_role"], "BIC")
        self.assertIn("You have been assigned 1 tasks", message1["content"])
        self.assertEqual(message1["metadata"]["plan_id"], "test-plan")
        self.assertEqual(len(message1["metadata"]["assigned_steps"]), 1)
        self.assertEqual(message1["metadata"]["assigned_steps"][0]["id"], "step_1")
        
        # Check second message
        args2, _ = self.message_router.route_message.call_args_list[1]
        message2 = args2[0]
        self.assertEqual(message2["source_role"], "TEST_PLANNER")
        self.assertEqual(message2["target_role"], "MD")
        self.assertIn("You have been assigned 1 tasks", message2["content"])
        self.assertEqual(message2["metadata"]["plan_id"], "test-plan")
        self.assertEqual(len(message2["metadata"]["assigned_steps"]), 1)
        self.assertEqual(message2["metadata"]["assigned_steps"][0]["id"], "step_2")
        
        # Test with error
        self.message_router.reset_mock()
        self.message_router.route_message.side_effect = Exception("Test error")
        
        # This should not raise an exception
        self.planner._notify_assigned_roles(plan)

if __name__ == '__main__':
    unittest.main() 