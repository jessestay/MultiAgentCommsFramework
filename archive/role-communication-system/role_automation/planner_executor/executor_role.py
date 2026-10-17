"""
ExecutorRole Interface

This module defines the ExecutorRole interface, which is implemented by
specialized roles to execute specific tasks assigned by a planner.
"""

import logging
import datetime
from typing import Dict, List, Any, Optional, Tuple

logger = logging.getLogger(__name__)

class ExecutorRole:
    """
    Base class for roles that execute specific tasks (e.g., BIC, MD, etc.).
    
    An executor is responsible for:
    - Executing specific steps from a plan
    - Reporting progress to the planner
    - Providing artifacts from task execution
    - Handling dependencies between tasks
    - Requesting clarification when needed
    """
    
    def __init__(self, role_id: str, storage_manager=None, message_router=None):
        """
        Initialize the ExecutorRole.
        
        Args:
            role_id (str): The identifier for this role
            storage_manager: The storage manager for retrieving plans and storing results
            message_router: The message router for communicating with other roles
        """
        self.role_id = role_id
        self.storage_manager = storage_manager
        self.message_router = message_router
        self.assigned_tasks = {}  # plan_id -> list of step_ids
        logger.info(f"Initialized ExecutorRole with ID: {role_id}")
    
    def get_assigned_tasks(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get all tasks assigned to this role.
        
        Returns:
            Dict[str, List[Dict[str, Any]]]: Dictionary of plan_id -> list of assigned steps
        """
        assigned_tasks = {}
        
        if not self.storage_manager:
            logger.warning("Cannot get assigned tasks: No storage manager available")
            return assigned_tasks
        
        try:
            # Check if storage_manager has list_plans method (adapter)
            if hasattr(self.storage_manager, 'list_plans'):
                plans = self.storage_manager.list_plans()
                
                for plan in plans:
                    # Check if this role is assigned to any steps
                    role_assignments = plan.get("role_assignments", {})
                    if self.role_id in role_assignments:
                        assigned_step_ids = role_assignments[self.role_id]
                        assigned_steps = [s for s in plan["steps"] if s["id"] in assigned_step_ids]
                        
                        if assigned_steps:
                            assigned_tasks[plan["id"]] = assigned_steps
                
                return assigned_tasks
            
            # Get all plan conversations
            filter_criteria = {"metadata": {"type": "plan"}}
            conversations = self.storage_manager.list_conversations(filter_criteria)
            
            for conv in conversations:
                plan_id = conv.get("metadata", {}).get("plan_id")
                if not plan_id:
                    continue
                
                # Get the plan
                plan = self._retrieve_plan(plan_id)
                if not plan:
                    continue
                
                # Check if this role is assigned to any steps
                role_assignments = plan.get("role_assignments", {})
                if self.role_id in role_assignments:
                    assigned_step_ids = role_assignments[self.role_id]
                    assigned_steps = [s for s in plan["steps"] if s["id"] in assigned_step_ids]
                    
                    if assigned_steps:
                        assigned_tasks[plan_id] = assigned_steps
            
            return assigned_tasks
        except Exception as e:
            logger.error(f"Error getting assigned tasks: {e}", exc_info=True)
            return assigned_tasks
    
    def execute_step(self, plan_id: str, step_id: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Execute a specific step from a plan.
        
        Args:
            plan_id (str): The ID of the plan containing the step
            step_id (str): The ID of the step to execute
            context (Dict[str, Any], optional): Additional context for execution
            
        Returns:
            Dict[str, Any]: Execution result
        """
        # This is an abstract method that should be implemented by subclasses
        logger.warning(f"execute_step called on base ExecutorRole class for step {step_id}")
        
        # Default implementation just marks the step as in progress
        plan = self._retrieve_plan(plan_id)
        if not plan:
            return {"success": False, "message": f"Plan {plan_id} not found"}
        
        # Find the step
        step = next((s for s in plan["steps"] if s["id"] == step_id), None)
        if not step:
            return {"success": False, "message": f"Step {step_id} not found in plan {plan_id}"}
        
        # Check if step is assigned to this role
        if step.get("assigned_role") != self.role_id:
            return {"success": False, "message": f"Step {step_id} is not assigned to role {self.role_id}"}
        
        # Check dependencies
        dependencies = step.get("dependencies", [])
        if dependencies:
            # Check if all dependencies are completed
            dependency_steps = [s for s in plan["steps"] if s["id"] in dependencies]
            incomplete_deps = [s["id"] for s in dependency_steps if s.get("status") != "completed"]
            
            if incomplete_deps:
                return {
                    "success": False, 
                    "message": f"Dependencies not completed: {', '.join(incomplete_deps)}"
                }
        
        # Update step status to in_progress
        self.report_progress(plan_id, step_id, "in_progress")
        
        return {
            "success": True,
            "message": f"Step {step_id} execution started",
            "status": "in_progress"
        }
    
    def report_progress(self, plan_id: str, step_id: str, status: str, 
                        progress: float = 0.0, artifacts: Optional[List[Any]] = None, 
                        message: Optional[str] = None) -> Dict[str, Any]:
        """
        Report progress on a step to the planner.
        
        Args:
            plan_id (str): The ID of the plan containing the step
            step_id (str): The ID of the step to update
            status (str): The new status ('pending', 'in_progress', 'completed', 'blocked')
            progress (float): Completion percentage (0.0 to 1.0)
            artifacts (List[Any], optional): Any artifacts produced by the step
            message (str, optional): Additional message about the progress
            
        Returns:
            Dict[str, Any]: The result of the progress update
        """
        if not self.storage_manager:
            logger.warning("Cannot report progress: No storage manager available")
            return {"success": False, "message": "No storage manager available"}
        
        try:
            # Get the plan
            plan = self._retrieve_plan(plan_id)
            if not plan:
                return {"success": False, "message": f"Plan {plan_id} not found"}
            
            # Find the step
            step = next((s for s in plan["steps"] if s["id"] == step_id), None)
            if not step:
                return {"success": False, "message": f"Step {step_id} not found in plan {plan_id}"}
            
            # Check if step is assigned to this role
            if step.get("assigned_role") != self.role_id:
                return {"success": False, "message": f"Step {step_id} is not assigned to role {self.role_id}"}
            
            # Update step status
            step["status"] = status
            step["progress"] = progress
            step["updated_at"] = datetime.datetime.now().isoformat()
            
            if artifacts:
                if "artifacts" not in step:
                    step["artifacts"] = []
                step["artifacts"].extend(artifacts)
            
            if message:
                step["message"] = message
            
            plan["updated_at"] = datetime.datetime.now().isoformat()
            
            # Check if all steps are completed
            if status == "completed":
                all_completed = all(s["status"] == "completed" for s in plan["steps"])
                if all_completed:
                    plan["status"] = "completed"
            
            # Store the updated plan
            self._store_plan(plan)
            
            # Notify the planner if message router is available
            if self.message_router:
                self._notify_planner(plan, step, status, message)
            
            logger.info(f"Reported progress for step {step_id} in plan {plan_id}: {status}")
            
            return {
                "success": True,
                "message": f"Progress updated for step {step_id}",
                "status": status,
                "progress": progress
            }
        except Exception as e:
            logger.error(f"Error reporting progress: {e}", exc_info=True)
            return {"success": False, "message": f"Error reporting progress: {str(e)}"}
    
    def request_clarification(self, plan_id: str, step_id: str, 
                              question: str) -> Dict[str, Any]:
        """
        Request clarification from the planner about a step.
        
        Args:
            plan_id (str): The ID of the plan containing the step
            step_id (str): The ID of the step needing clarification
            question (str): The question to ask the planner
            
        Returns:
            Dict[str, Any]: The result of the clarification request
        """
        if not self.message_router:
            logger.warning("Cannot request clarification: No message router available")
            return {"success": False, "message": "No message router available"}
        
        try:
            # Get the plan
            plan = self._retrieve_plan(plan_id)
            if not plan:
                return {"success": False, "message": f"Plan {plan_id} not found"}
            
            # Find the step
            step = next((s for s in plan["steps"] if s["id"] == step_id), None)
            if not step:
                return {"success": False, "message": f"Step {step_id} not found in plan {plan_id}"}
            
            # Create clarification request message
            metadata = {
                "type": "clarification_request",
                "plan_id": plan_id,
                "step_id": step_id,
                "question": question
            }
            
            content = f"Clarification needed for step '{step['description']}': {question}"
            
            # Check if message_router has notify_role method (adapter)
            if hasattr(self.message_router, 'notify_role'):
                self.message_router.notify_role(self.role_id, plan["created_by"], content, metadata)
            else:
                # Format message for standard MessageRouter
                message = f"[{self.role_id}]: @{plan['created_by']}: {content}"
                self.message_router.route_message(message)
            
            # Update step status to blocked
            step["status"] = "blocked"
            step["blocked_reason"] = f"Waiting for clarification: {question}"
            step["updated_at"] = datetime.datetime.now().isoformat()
            plan["updated_at"] = datetime.datetime.now().isoformat()
            
            # Store the updated plan
            self._store_plan(plan)
            
            logger.info(f"Requested clarification for step {step_id} in plan {plan_id}")
            
            return {
                "success": True,
                "message": f"Clarification requested for step {step_id}",
                "status": "blocked"
            }
        except Exception as e:
            logger.error(f"Error requesting clarification: {e}", exc_info=True)
            return {"success": False, "message": f"Error requesting clarification: {str(e)}"}
    
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
                "target_role": plan["created_by"],
                "content": "Plan update from executor",
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
    
    def _notify_planner(self, plan: Dict[str, Any], step: Dict[str, Any], 
                        status: str, message: Optional[str] = None) -> None:
        """
        Notify the planner about step progress.
        
        Args:
            plan (Dict[str, Any]): The plan containing the step
            step (Dict[str, Any]): The step that was updated
            status (str): The new status
            message (str, optional): Additional message
        """
        try:
            # Create notification content
            content = f"Step '{step['description']}' status updated to {status}"
            if message:
                content += f": {message}"
            
            # Create metadata
            metadata = {
                "type": "progress_update",
                "plan_id": plan["id"],
                "step_id": step["id"],
                "status": status
            }
            
            if message:
                metadata["message"] = message
            
            # Check if message_router has notify_role method (adapter)
            if hasattr(self.message_router, 'notify_role'):
                self.message_router.notify_role(self.role_id, plan["created_by"], content, metadata)
            else:
                # Format message for standard MessageRouter
                formatted_message = f"[{self.role_id}]: @{plan['created_by']}: {content}"
                self.message_router.route_message(formatted_message)
            
            logger.info(f"Notified planner about step {step['id']} progress")
        except Exception as e:
            logger.error(f"Error notifying planner: {e}", exc_info=True)