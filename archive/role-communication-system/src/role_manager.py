"""
Role Manager for handling role states and transitions.

Manages role state transitions, permissions, and validation.
"""

import logging
from typing import Dict, List, Optional, Any

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RoleManager:
    """
    Manages role states, transitions, and permissions.
    """
    
    # Valid role states and their allowed transitions
    VALID_STATES = {
        "available": ["working", "unavailable"],
        "working": ["available", "paused", "completed"],
        "paused": ["working", "available"],
        "completed": ["available"],
        "unavailable": ["available"]
    }
    
    # Valid roles in the system
    VALID_ROLES = ["ES", "SET", "CTW", "BIC", "MD", "SMM", "UFL", "DLC", "DRC"]
    
    def __init__(self, storage_manager):
        """
        Initialize the role manager.
        
        Args:
            storage_manager: Storage manager instance for persisting role states
        """
        self.storage_manager = storage_manager
        logger.info("RoleManager initialized")
    
    def validate_role(self, role: str) -> bool:
        """
        Validate if a role is recognized by the system.
        
        Args:
            role: Role identifier to validate
            
        Returns:
            bool: True if valid, False otherwise
        """
        if role not in self.VALID_ROLES:
            logger.warning(f"Invalid role: {role}")
            return False
        return True
    
    def validate_state_transition(self, role: str, workspace_path: str, new_state: Dict[str, Any]) -> bool:
        """
        Validate if a state transition is allowed.
        
        Args:
            role: Role identifier
            workspace_path: Workspace path
            new_state: New state to transition to
            
        Returns:
            bool: True if valid transition, False otherwise
            
        Raises:
            ValueError: If the transition is invalid
        """
        # Validate role
        if not self.validate_role(role):
            raise ValueError(f"Invalid role: {role}")
        
        # Get current state
        current_state = self.storage_manager.get_role_state(role, workspace_path)
        
        # If no current state, any initial state is valid
        if not current_state:
            if "status" not in new_state:
                raise ValueError("New state must include 'status' field")
            
            if new_state["status"] not in self.VALID_STATES:
                raise ValueError(f"Invalid state: {new_state['status']}")
            
            return True
        
        # Validate state transition
        if "status" not in new_state:
            raise ValueError("New state must include 'status' field")
        
        current_status = current_state.get("status")
        new_status = new_state["status"]
        
        if current_status not in self.VALID_STATES:
            logger.warning(f"Current state '{current_status}' is invalid, allowing transition")
            return True
        
        if new_status not in self.VALID_STATES:
            raise ValueError(f"Invalid state: {new_status}")
        
        if new_status not in self.VALID_STATES[current_status]:
            raise ValueError(
                f"Invalid state transition: {current_status} -> {new_status}. "
                f"Allowed transitions: {self.VALID_STATES[current_status]}"
            )
        
        return True
    
    def update_role_state(self, role: str, workspace_path: str, new_state: Dict[str, Any]) -> bool:
        """
        Update a role's state with validation.
        
        Args:
            role: Role identifier
            workspace_path: Workspace path
            new_state: New state to set
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Validate the state transition
            self.validate_state_transition(role, workspace_path, new_state)
            
            # Update the state
            result = self.storage_manager.update_role_state(role, workspace_path, new_state)
            
            if result:
                logger.info(f"Updated state for role {role} to {new_state.get('status')}")
            else:
                logger.error(f"Failed to update state for role {role}")
            
            return result
        except ValueError as e:
            logger.error(f"Invalid state transition: {e}")
            return False
    
    def get_role_state(self, role: str, workspace_path: str) -> Optional[Dict[str, Any]]:
        """
        Get a role's current state.
        
        Args:
            role: Role identifier
            workspace_path: Workspace path
            
        Returns:
            Dict containing role state, or None if not found
        """
        return self.storage_manager.get_role_state(role, workspace_path)
    
    def get_roles_by_state(self, workspace_path: str, status: str) -> List[str]:
        """
        Get all roles with a specific state in a workspace.
        
        Args:
            workspace_path: Workspace path
            status: Status to filter by
            
        Returns:
            List of role identifiers
        """
        try:
            roles = []
            
            for role in self.VALID_ROLES:
                state = self.storage_manager.get_role_state(role, workspace_path)
                if state and state.get("status") == status:
                    roles.append(role)
            
            return roles
        except Exception as e:
            logger.error(f"Error getting roles by state: {e}")
            return []
    
    def reset_role_state(self, role: str, workspace_path: str) -> bool:
        """
        Reset a role's state to 'available'.
        
        Args:
            role: Role identifier
            workspace_path: Workspace path
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            initial_state = {
                "status": "available",
                "current_task": None,
                "last_reset": "manual"
            }
            
            result = self.storage_manager.update_role_state(role, workspace_path, initial_state)
            
            if result:
                logger.info(f"Reset state for role {role}")
            else:
                logger.error(f"Failed to reset state for role {role}")
            
            return result
        except Exception as e:
            logger.error(f"Error resetting role state: {e}")
            return False 