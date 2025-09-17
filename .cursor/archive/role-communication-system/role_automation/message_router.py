#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Message Router

This module handles the routing of messages between roles, conversation management,
and message formatting according to the established communication protocol.
"""

import re
import uuid
import logging
import datetime
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

class MessageRouter:
    """
    Routes messages between roles and manages conversations.
    """
    
    def __init__(self, security_manager=None, storage_manager=None):
        """
        Initialize the message router.
        
        Args:
            security_manager: The security manager for access control
            storage_manager: The storage manager for data persistence
        """
        self.security_manager = security_manager
        self.storage_manager = storage_manager
        
        # Regex patterns for message parsing
        self.role_header_pattern = re.compile(r'^\[([A-Z]{2,5})\]:\s*(.*)', re.DOTALL)
        self.target_role_pattern = re.compile(r'^@([A-Z]{2,5}):\s*(.*)', re.DOTALL)
        
        logger.info("Message router initialized")
    
    def parse_message(self, message_text: str) -> Dict[str, Any]:
        """
        Parse a message to extract source role, target role, and content.
        
        Args:
            message_text: The raw message text
            
        Returns:
            Dict containing source_role, target_role (if any), and content
        """
        # Extract source role
        header_match = self.role_header_pattern.match(message_text)
        if not header_match:
            logger.warning(f"Invalid message format (missing role header): {message_text}")
            return {"error": "Invalid message format: missing role header"}
        
        source_role = header_match.group(1)
        content = header_match.group(2).strip()
        
        # Extract target role if present
        target_role = None
        target_match = self.target_role_pattern.match(content)
        if target_match:
            target_role = target_match.group(1)
            content = target_match.group(2).strip()
        
        return {
            "source_role": source_role,
            "target_role": target_role,
            "content": content if target_role is None else f"@{target_role}: {content}"
        }
    
    def route_message(self, message_text: str) -> Dict[str, Any]:
        """
        Route a message to the appropriate role(s).
        
        Args:
            message_text: The raw message text
            
        Returns:
            Dict containing success status, conversation_id, and error (if any)
        """
        # Parse the message
        parsed = self.parse_message(message_text)
        if "error" in parsed:
            return {"success": False, "error": parsed["error"]}
        
        source_role = parsed["source_role"]
        target_role = parsed["target_role"]
        content = parsed["content"]
        
        # Validate roles
        if self.security_manager:
            valid_roles = self.security_manager.get_valid_roles()
            if source_role not in valid_roles:
                logger.warning(f"Invalid source role: {source_role}")
                return {"success": False, "error": f"Invalid source role: {source_role}"}
            if target_role and target_role not in valid_roles:
                logger.warning(f"Invalid target role: {target_role}")
                return {"success": False, "error": f"Invalid target role: {target_role}"}
        
        # Create message object
        message = {
            "id": f"msg-{uuid.uuid4()}",
            "timestamp": datetime.datetime.now().isoformat(),
            "source_role": source_role,
            "content": content
        }
        
        if target_role:
            message["target_role"] = target_role
        
        # Store the message
        if self.storage_manager:
            # Determine if this is part of an existing conversation
            conversation_id = None
            # TODO: Implement logic to find existing conversation
            
            # If no existing conversation, create a new one
            if not conversation_id:
                conversation_id = f"conv-{uuid.uuid4()}"
                roles = [source_role]
                if target_role:
                    roles.append(target_role)
                
                conversation = {
                    "id": conversation_id,
                    "created_at": datetime.datetime.now().isoformat(),
                    "metadata": {
                        "roles": roles,
                        "title": f"Conversation between {source_role}" + (f" and {target_role}" if target_role else "")
                    },
                    "messages": [message]
                }
                
                self.storage_manager.store_conversation(conversation)
                logger.info(f"Created new conversation: {conversation_id}")
            else:
                # Add message to existing conversation
                self.storage_manager.add_message_to_conversation(conversation_id, message)
                logger.info(f"Added message to conversation: {conversation_id}")
            
            return {"success": True, "conversation_id": conversation_id}
        else:
            # No storage manager, just return success
            logger.warning("No storage manager available, message not stored")
            return {"success": True, "conversation_id": None}
    
    def get_conversation_messages(self, conversation_id: str, role: str) -> Optional[Dict[str, Any]]:
        """
        Get all messages in a conversation that a role has access to.
        
        Args:
            conversation_id: The ID of the conversation
            role: The role requesting access
            
        Returns:
            The conversation object or None if not found or no access
        """
        if not self.storage_manager:
            logger.warning("No storage manager available, cannot retrieve conversation")
            return None
        
        # Get the conversation
        conversation = self.storage_manager.get_conversation(conversation_id)
        if not conversation:
            logger.warning(f"Conversation not found: {conversation_id}")
            return None
        
        # Check if the role has access
        if self.security_manager:
            has_access = self.security_manager.check_conversation_access(conversation, role)
            if not has_access:
                logger.warning(f"Role {role} does not have access to conversation {conversation_id}")
                return None
        
        return conversation
    
    def format_conversation_for_display(self, conversation: Dict[str, Any]) -> str:
        """
        Format a conversation for display.
        
        Args:
            conversation: The conversation object
            
        Returns:
            Formatted string representation of the conversation
        """
        if not conversation:
            return "No conversation to display"
        
        # Format header
        result = [
            f"Conversation: {conversation['id']}",
            f"Created: {conversation['created_at']}",
            f"Roles: {', '.join(conversation['metadata']['roles'])}",
            f"Title: {conversation['metadata'].get('title', 'Untitled')}",
            "-" * 50
        ]
        
        # Format messages
        for message in conversation["messages"]:
            timestamp = message["timestamp"]
            source_role = message["source_role"]
            content = message["content"]
            
            formatted_message = f"[{timestamp}] [{source_role}]: {content}"
            result.append(formatted_message)
        
        return "\n".join(result) 