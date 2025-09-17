"""
PlannerRole Base Class

This module defines the PlannerRole base class, which is responsible for
creating, managing, and validating plans. The Executive Secretary role
will inherit from this class to function as the primary planner in the system.
"""

import uuid
import datetime
import logging
from typing import Dict, List, Any, Optional, Tuple

from role_automation.planner_executor.validation import validate_plan

logger = logging.getLogger(__name__)

class PlannerRole:
    """
    Base class for roles that function as planners (e.g., Executive Secretary).
    
    A planner is responsible for:
    - Creating structured plans with clear steps
    - Assigning tasks to appropriate roles
    - Managing dependencies between tasks
    - Validating plans before execution
    - Monitoring execution progress
    - Adapting plans as needed
    """
    
    def __init__(self, role_id: str, storage_manager=None, message_router=None):
        """
        Initialize the PlannerRole.
        
        Args:
            role_id (str): The identifier for this role
            storage_manager: The storage manager for persisting plans
            message_router: The message router for communicating with other roles
        """
        self.role_id = role_id
        self.storage_manager = storage_manager
        self.message_router = message_router
        logger.info(f"Initialized PlannerRole with ID: {role_id}")
    
    def create_plan(self, task_description: str, available_roles: List[str]) -> Dict[str, Any]:
        """
        Create a structured plan with role assignments and dependencies.
        
        Args:
            task_description (str): Description of the overall task
            available_roles (List[str]): List of available role IDs
            
        Returns:
            Dict[str, Any]: A structured plan
        """
        plan_id = str(uuid.uuid4())
        timestamp = datetime.datetime.now().isoformat()
        
        plan = {
            "id": plan_id,
            "description": task_description,
            "created_by": self.role_id,
            "created_at": timestamp,
            "updated_at": timestamp,
            "status": "planning",
            "steps": [],
            "role_assignments": {},
            "dependencies": {},
            "available_roles": available_roles,
            "metadata": {}
        }
        
        logger.info(f"Created new plan: {plan_id}")
        
        # Store the plan if storage manager is available
        if self.storage_manager:
            self._store_plan(plan)
        
        return plan
    
    def add_step(self, plan: Dict[str, Any], step_description: str, 
                 acceptance_criteria: List[str], estimated_effort: int = 1) -> Dict[str, Any]:
        """
        Add a step to the plan.
        
        Args:
            plan (Dict[str, Any]): The plan to update
            step_description (str): Description of the step
            acceptance_criteria (List[str]): Criteria for step completion
            estimated_effort (int): Estimated effort (1-5)
            
        Returns:
            Dict[str, Any]: The updated plan
        """
        step_id = f"step_{len(plan['steps']) + 1}"
        timestamp = datetime.datetime.now().isoformat()
        
        step = {
            "id": step_id,
            "description": step_description,
            "acceptance_criteria": acceptance_criteria,
            "estimated_effort": estimated_effort,
            "status": "pending",
            "created_at": timestamp,
            "updated_at": timestamp,
            "assigned_role": None,
            "dependencies": []
        }
        
        plan["steps"].append(step)
        plan["updated_at"] = timestamp
        
        logger.info(f"Added step {step_id} to plan {plan['id']}")
        
        # Store the updated plan
        if self.storage_manager:
            self._store_plan(plan)
        
        return plan
    
    def assign_role(self, plan: Dict[str, Any], step_id: str, role_id: str) -> Dict[str, Any]:
        """
        Assign a role to a step in the plan.
        
        Args:
            plan (Dict[str, Any]): The plan to update
            step_id (str): The ID of the step to assign
            role_id (str): The ID of the role to assign
            
        Returns:
            Dict[str, Any]: The updated plan
        """
        # Verify role is available
        if role_id not in plan["available_roles"]:
            logger.warning(f"Role {role_id} is not available for plan {plan['id']}")
            return plan
        
        # Find the step
        step = next((s for s in plan["steps"] if s["id"] == step_id), None)
        if not step:
            logger.warning(f"Step {step_id} not found in plan {plan['id']}")
            return plan
        
        # Assign the role
        step["assigned_role"] = role_id
        step["updated_at"] = datetime.datetime.now().isoformat()
        plan["updated_at"] = datetime.datetime.now().isoformat()
        
        # Update role assignments
        if role_id not in plan["role_assignments"]:
            plan["role_assignments"][role_id] = []
        
        if step_id not in plan["role_assignments"][role_id]:
            plan["role_assignments"][role_id].append(step_id)
        
        logger.info(f"Assigned role {role_id} to step {step_id} in plan {plan['id']}")
        
        # Store the updated plan
        if self.storage_manager:
            self._store_plan(plan)
        
        return plan
    
    def add_dependency(self, plan: Dict[str, Any], step_id: str, 
                       dependency_step_id: str) -> Dict[str, Any]:
        """
        Add a dependency between steps.
        
        Args:
            plan (Dict[str, Any]): The plan to update
            step_id (str): The ID of the dependent step
            dependency_step_id (str): The ID of the step that must be completed first
            
        Returns:
            Dict[str, Any]: The updated plan
        """
        # Find the steps
        step = next((s for s in plan["steps"] if s["id"] == step_id), None)
        dependency_step = next((s for s in plan["steps"] if s["id"] == dependency_step_id), None)
        
        if not step or not dependency_step:
            logger.warning(f"Step not found in plan {plan['id']}")
            return plan
        
        # Add dependency
        if dependency_step_id not in step["dependencies"]:
            step["dependencies"].append(dependency_step_id)
        
        # Update dependencies mapping
        if dependency_step_id not in plan["dependencies"]:
            plan["dependencies"][dependency_step_id] = []
        
        if step_id not in plan["dependencies"][dependency_step_id]:
            plan["dependencies"][dependency_step_id].append(step_id)
        
        plan["updated_at"] = datetime.datetime.now().isoformat()
        
        logger.info(f"Added dependency: {step_id} depends on {dependency_step_id} in plan {plan['id']}")
        
        # Store the updated plan
        if self.storage_manager:
            self._store_plan(plan)
        
        return plan
    
    def validate_plan(self, plan: Dict[str, Any]) -> Tuple[bool, str, List[str]]:
        """
        Validate that the plan is executable with available roles.
        
        Args:
            plan (Dict[str, Any]): The plan to validate
            
        Returns:
            Tuple[bool, str, List[str]]: (is_valid, message, issues)
        """
        return validate_plan(plan)
    
    def finalize_plan(self, plan: Dict[str, Any]) -> Dict[str, Any]:
        """
        Finalize the plan and mark it ready for execution.
        
        Args:
            plan (Dict[str, Any]): The plan to finalize
            
        Returns:
            Dict[str, Any]: The finalized plan
        """
        # Validate the plan first
        is_valid, message, issues = self.validate_plan(plan)
        
        if not is_valid:
            logger.warning(f"Cannot finalize invalid plan {plan['id']}: {message}")
            plan["metadata"]["validation_issues"] = issues
            return plan
        
        # Mark plan as ready for execution
        plan["status"] = "ready"
        plan["updated_at"] = datetime.datetime.now().isoformat()
        
        logger.info(f"Finalized plan {plan['id']}")
        
        # Notify assigned roles if message router is available
        if self.message_router:
            self._notify_assigned_roles(plan)
        
        # Store the updated plan
        if self.storage_manager:
            self._store_plan(plan)
        
        return plan
    
    def update_step_status(self, plan: Dict[str, Any], step_id: str, 
                           status: str, artifacts: Optional[List[Any]] = None) -> Dict[str, Any]:
        """
        Update the status of a step in the plan.
        
        Args:
            plan (Dict[str, Any]): The plan to update
            step_id (str): The ID of the step to update
            status (str): The new status ('pending', 'in_progress', 'completed', 'blocked')
            artifacts (List[Any], optional): Any artifacts produced by the step
            
        Returns:
            Dict[str, Any]: The updated plan
        """
        # Find the step
        step = next((s for s in plan["steps"] if s["id"] == step_id), None)
        if not step:
            logger.warning(f"Step {step_id} not found in plan {plan['id']}")
            return plan
        
        # Update step status
        step["status"] = status
        step["updated_at"] = datetime.datetime.now().isoformat()
        
        if artifacts:
            if "artifacts" not in step:
                step["artifacts"] = []
            step["artifacts"].extend(artifacts)
        
        plan["updated_at"] = datetime.datetime.now().isoformat()
        
        # Check if all steps are completed
        all_completed = all(s["status"] == "completed" for s in plan["steps"])
        if all_completed:
            plan["status"] = "completed"
        
        logger.info(f"Updated step {step_id} status to {status} in plan {plan['id']}")
        
        # Store the updated plan
        if self.storage_manager:
            self._store_plan(plan)
        
        return plan
    
    def get_plan(self, plan_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a plan by ID.
        
        Args:
            plan_id (str): The ID of the plan to retrieve
            
        Returns:
            Optional[Dict[str, Any]]: The plan or None if not found
        """
        if not self.storage_manager:
            logger.warning("Cannot retrieve plan: No storage manager available")
            return None
        
        return self._retrieve_plan(plan_id)
    
    def list_plans(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        List all plans, optionally filtered by status.
        
        Args:
            status (str, optional): Filter plans by status
            
        Returns:
            List[Dict[str, Any]]: List of plans
        """
        if not self.storage_manager:
            logger.warning("Cannot list plans: No storage manager available")
            return []
        
        return self._list_plans(status)
    
    def _store_plan(self, plan: Dict[str, Any]) -> bool:
        """
        Store a plan using the storage manager.
        
        Args:
            plan (Dict[str, Any]): The plan to store
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Check if storage_manager has store_plan method (adapter)
            if hasattr(self.storage_manager, 'store_plan'):
                return self.storage_manager.store_plan(plan)
            
            # Create a conversation for the plan if it doesn't exist
            conversation_id = f"plan_{plan['id']}"
            
            # Check if conversation exists
            conversation = self.storage_manager.get_conversation(conversation_id)
            
            if not conversation:
                # Create new conversation
                metadata = {
                    "type": "plan",
                    "plan_id": plan["id"],
                    "description": plan["description"],
                    "roles": plan["available_roles"]
                }
                
                # Check if storage_manager has create_conversation method (adapter)
                if hasattr(self.storage_manager, 'create_conversation'):
                    self.storage_manager.create_conversation(conversation_id, metadata)
                else:
                    # Create conversation directly
                    conversation = {
                        "id": conversation_id,
                        "created_at": datetime.datetime.now().isoformat(),
                        "updated_at": datetime.datetime.now().isoformat(),
                        "metadata": metadata,
                        "messages": []
                    }
                    self.storage_manager.store_conversation(conversation)
            
            # Store plan as a message
            message = {
                "source_role": self.role_id,
                "target_role": "*",
                "content": "Plan update",
                "metadata": {
                    "plan": plan
                }
            }
            
            # Check if storage_manager has add_message method (adapter)
            if hasattr(self.storage_manager, 'add_message'):
                return self.storage_manager.add_message(conversation_id, message)
            else:
                return self.storage_manager.add_message_to_conversation(conversation_id, message)
        except Exception as e:
            logger.error(f"Error storing plan {plan['id']}: {e}", exc_info=True)
            return False
    
    def _retrieve_plan(self, plan_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a plan using the storage manager.
        
        Args:
            plan_id (str): The ID of the plan to retrieve
            
        Returns:
            Optional[Dict[str, Any]]: The plan or None if not found
        """
        try:
            # Check if storage_manager has get_plan method (adapter)
            if hasattr(self.storage_manager, 'get_plan'):
                return self.storage_manager.get_plan(plan_id)
            
            conversation_id = f"plan_{plan_id}"
            
            # Check if storage_manager has get_conversation_messages method (adapter)
            if hasattr(self.storage_manager, 'get_conversation_messages'):
                messages = self.storage_manager.get_conversation_messages(conversation_id)
            else:
                # Get conversation and extract messages
                conversation = self.storage_manager.get_conversation(conversation_id)
                if not conversation or "messages" not in conversation:
                    logger.warning(f"No messages found for plan {plan_id}")
                    return None
                messages = conversation["messages"]
            
            if not messages:
                logger.warning(f"No messages found for plan {plan_id}")
                return None
            
            # Get the latest plan message
            plan_messages = [m for m in messages if "metadata" in m and "plan" in m["metadata"]]
            if not plan_messages:
                logger.warning(f"No plan messages found for plan {plan_id}")
                return None
            
            # Sort by timestamp (newest first)
            plan_messages.sort(key=lambda m: m.get("timestamp", ""), reverse=True)
            
            # Return the latest plan
            return plan_messages[0]["metadata"]["plan"]
        except Exception as e:
            logger.error(f"Error retrieving plan {plan_id}: {e}", exc_info=True)
            return None
    
    def _list_plans(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        List plans using the storage manager.
        
        Args:
            status (str, optional): Filter plans by status
            
        Returns:
            List[Dict[str, Any]]: List of plans
        """
        try:
            # Check if storage_manager has list_plans method (adapter)
            if hasattr(self.storage_manager, 'list_plans'):
                return self.storage_manager.list_plans(status)
            
            # Get all plan conversations
            filter_criteria = {"metadata": {"type": "plan"}}
            conversations = self.storage_manager.list_conversations(filter_criteria)
            
            plans = []
            for conv in conversations:
                plan_id = conv.get("metadata", {}).get("plan_id")
                if plan_id:
                    plan = self._retrieve_plan(plan_id)
                    if plan and (status is None or plan.get("status") == status):
                        plans.append(plan)
            
            return plans
        except Exception as e:
            logger.error(f"Error listing plans: {e}", exc_info=True)
            return []
    
    def _notify_assigned_roles(self, plan: Dict[str, Any]) -> None:
        """
        Notify roles assigned to the plan.
        
        Args:
            plan (Dict[str, Any]): The plan with assignments
        """
        for role_id, step_ids in plan["role_assignments"].items():
            # Get assigned steps
            assigned_steps = [s for s in plan["steps"] if s["id"] in step_ids]
            
            # Create notification message
            message = {
                "source_role": self.role_id,
                "target_role": role_id,
                "content": f"You have been assigned {len(assigned_steps)} tasks in plan '{plan['description']}'",
                "metadata": {
                    "plan_id": plan["id"],
                    "assigned_steps": assigned_steps
                }
            }
            
            # Send message
            try:
                # Check if message_router has route_message method that accepts dict (adapter)
                if hasattr(self.message_router, 'route_message') and hasattr(self.message_router, 'notify_role'):
                    self.message_router.notify_role(self.role_id, role_id, message["content"], message["metadata"])
                else:
                    # Format message for standard MessageRouter
                    formatted_message = f"[{self.role_id}]: @{role_id}: {message['content']}"
                    self.message_router.route_message(formatted_message)
                
                logger.info(f"Notified role {role_id} about assignments in plan {plan['id']}")
            except Exception as e:
                logger.error(f"Error notifying role {role_id}: {e}", exc_info=True) 