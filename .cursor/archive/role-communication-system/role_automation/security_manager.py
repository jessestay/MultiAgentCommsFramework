#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Security Manager

This module handles access control, permissions, and security policies for the role management system.
It ensures that roles only have access to appropriate conversations and data.
"""

import os
import json
import logging
from typing import Dict, List, Set, Optional, Any

logger = logging.getLogger(__name__)

class SecurityManager:
    """
    Manages access control and permissions for the role management system.
    """
    
    def __init__(self, role_definitions_path=None):
        """
        Initialize the security manager.
        
        Args:
            role_definitions_path: Path to the role definitions file
        """
        # Set default path if not provided
        self.role_definitions_path = role_definitions_path or os.path.join(
            os.getcwd(), ".cursor", "rules", "role-definitions.mdc"
        )
        
        # Load role definitions
        self.role_definitions = self._load_role_definitions()
        
        # Cache of valid roles
        self._valid_roles = None
        
        logger.info("Security manager initialized")
    
    def _load_role_definitions(self) -> Dict[str, Any]:
        """
        Load role definitions from the MDC file.
        
        Returns:
            Dict containing role definitions
        """
        try:
            if os.path.exists(self.role_definitions_path):
                # Parse the MDC file to extract role definitions
                roles = {}
                
                with open(self.role_definitions_path, 'r') as f:
                    content = f.read()
                
                # Extract role abbreviations from the content
                # This is a simple parser for demonstration purposes
                # In a real implementation, this would be more robust
                lines = content.split('\n')
                current_role = None
                
                for line in lines:
                    # Look for role headers
                    if line.startswith('## '):
                        current_role = line[3:].strip()
                        roles[current_role] = {
                            "name": current_role,
                            "abbreviation": None,
                            "permissions": []
                        }
                    
                    # Look for abbreviation
                    if current_role and "**Abbreviation**:" in line:
                        abbr = line.split("**Abbreviation**:")[1].strip()
                        roles[current_role]["abbreviation"] = abbr
                
                # Create a mapping of abbreviations to roles
                role_map = {}
                for role_name, role_data in roles.items():
                    if role_data["abbreviation"]:
                        role_map[role_data["abbreviation"]] = role_data
                
                logger.info(f"Loaded {len(role_map)} role definitions")
                return {"roles": role_map}
            else:
                logger.warning(f"Role definitions file not found: {self.role_definitions_path}")
                return {"roles": {}}
        except Exception as e:
            logger.error(f"Error loading role definitions: {e}")
            return {"roles": {}}
    
    def get_valid_roles(self) -> Set[str]:
        """
        Get the set of valid role abbreviations.
        
        Returns:
            Set of valid role abbreviations
        """
        if self._valid_roles is None:
            self._valid_roles = set()
            
            # Extract abbreviations from role definitions
            for role_abbr in self.role_definitions.get("roles", {}).keys():
                self._valid_roles.add(role_abbr)
            
            # Add default roles if not found in definitions
            default_roles = {"ES", "BIC", "MD", "SMM", "CTW", "UFL", "DLC", "SE", "DRC", "SET"}
            self._valid_roles.update(default_roles)
        
        return self._valid_roles
    
    def is_valid_role(self, role: str) -> bool:
        """
        Check if a role is valid.
        
        Args:
            role: The role abbreviation to check
            
        Returns:
            True if the role is valid, False otherwise
        """
        return role in self.get_valid_roles()
    
    def check_conversation_access(self, conversation: Dict[str, Any], role: str) -> bool:
        """
        Check if a role has access to a conversation.
        
        Args:
            conversation: The conversation to check
            role: The role requesting access
            
        Returns:
            True if the role has access, False otherwise
        """
        # Validate role
        if not self.is_valid_role(role):
            logger.warning(f"Invalid role: {role}")
            return False
        
        # Check if the role is in the conversation's roles list
        if "metadata" in conversation and "roles" in conversation["metadata"]:
            if role in conversation["metadata"]["roles"]:
                return True
        
        # Executive Secretary has access to all conversations
        if role == "ES":
            return True
        
        logger.warning(f"Role {role} does not have access to conversation {conversation.get('id', 'unknown')}")
        return False
    
    def get_role_permissions(self, role: str) -> List[str]:
        """
        Get the permissions for a role.
        
        Args:
            role: The role abbreviation
            
        Returns:
            List of permission strings
        """
        if not self.is_valid_role(role):
            logger.warning(f"Invalid role: {role}")
            return []
        
        role_data = self.role_definitions.get("roles", {}).get(role, {})
        return role_data.get("permissions", [])
    
    def can_communicate(self, source_role: str, target_role: str) -> bool:
        """
        Check if a source role can communicate with a target role.
        
        Args:
            source_role: The source role abbreviation
            target_role: The target role abbreviation
            
        Returns:
            True if communication is allowed, False otherwise
        """
        # Validate roles
        if not self.is_valid_role(source_role):
            logger.warning(f"Invalid source role: {source_role}")
            return False
        
        if not self.is_valid_role(target_role):
            logger.warning(f"Invalid target role: {target_role}")
            return False
        
        # Executive Secretary can communicate with all roles
        if source_role == "ES":
            return True
        
        # By default, all valid roles can communicate with each other
        # In a real implementation, this would check specific permissions
        return True
    
    def add_role_to_conversation(self, conversation: Dict[str, Any], role: str) -> bool:
        """
        Add a role to a conversation's access list.
        
        Args:
            conversation: The conversation to modify
            role: The role to add
            
        Returns:
            True if successful, False otherwise
        """
        if not self.is_valid_role(role):
            logger.warning(f"Invalid role: {role}")
            return False
        
        if "metadata" not in conversation:
            conversation["metadata"] = {}
        
        if "roles" not in conversation["metadata"]:
            conversation["metadata"]["roles"] = []
        
        if role not in conversation["metadata"]["roles"]:
            conversation["metadata"]["roles"].append(role)
            logger.info(f"Added role {role} to conversation {conversation.get('id', 'unknown')}")
            return True
        
        return False
    
    def remove_role_from_conversation(self, conversation: Dict[str, Any], role: str) -> bool:
        """
        Remove a role from a conversation's access list.
        
        Args:
            conversation: The conversation to modify
            role: The role to remove
            
        Returns:
            True if successful, False otherwise
        """
        if not self.is_valid_role(role):
            logger.warning(f"Invalid role: {role}")
            return False
        
        if "metadata" in conversation and "roles" in conversation["metadata"]:
            if role in conversation["metadata"]["roles"]:
                conversation["metadata"]["roles"].remove(role)
                logger.info(f"Removed role {role} from conversation {conversation.get('id', 'unknown')}")
                return True
        
        return False 