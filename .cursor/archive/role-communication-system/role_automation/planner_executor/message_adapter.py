#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Message Adapter

This module provides an adapter between the existing MessageRouter class
and the interface expected by the Planner-Executor Architecture.
"""

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class MessageAdapter:
    """
    Adapter for the MessageRouter class to provide the interface
    expected by the Planner-Executor Architecture.
    """
    
    def __init__(self, message_router, storage_adapter=None):
        """
        Initialize the message adapter.
        
        Args:
            message_router: The existing MessageRouter instance
            storage_adapter: The StorageAdapter instance
        """
        self.message_router = message_router
        self.storage_adapter = storage_adapter
        
        logger.info("Message adapter initialized")
    
    def route_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """
        Route a message to the appropriate role.
        
        Args:
            message: The message object to route
            
        Returns:
            Dict containing success status and any error information
        """
        if not self.message_router:
            logger.warning("No message router available")
            return {"success": False, "error": "No message router available"}
        
        # Extract message components
        source_role = message.get("source_role")
        target_role = message.get("target_role")
        content = message.get("content")
        
        if not source_role or not content:
            logger.warning("Invalid message: missing source_role or content")
            return {"success": False, "error": "Invalid message: missing source_role or content"}
        
        # Format message for the MessageRouter
        formatted_message = f"[{source_role}]: "
        if target_role and target_role != "*":
            formatted_message += f"@{target_role}: "
        formatted_message += content
        
        # Route the message
        result = self.message_router.route_message(formatted_message)
        
        return result
    
    def get_messages_for_role(self, role_id: str, filter_criteria: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Get all messages for a specific role.
        
        Args:
            role_id: The ID of the role
            filter_criteria: Optional criteria to filter messages
            
        Returns:
            Dict containing success status and messages
        """
        if not self.storage_adapter:
            logger.warning("No storage adapter available")
            return {"success": False, "error": "No storage adapter available"}
        
        # Get all conversations involving this role
        role_filter = {"metadata": {"roles": [role_id]}}
        conversations = self.storage_adapter.list_conversations(role_filter)
        
        messages = []
        for conversation in conversations:
            conversation_messages = self.storage_adapter.get_conversation_messages(conversation["id"])
            
            # Filter messages for this role
            for message in conversation_messages:
                # Include messages sent by this role or targeted to this role
                if message.get("source_role") == role_id or message.get("target_role") == role_id:
                    # Apply additional filters if provided
                    if filter_criteria:
                        include = True
                        for key, value in filter_criteria.items():
                            if key in message and message[key] != value:
                                include = False
                                break
                        
                        if not include:
                            continue
                    
                    messages.append(message)
        
        return {"success": True, "messages": messages}
    
    def notify_role(self, source_role: str, target_role: str, content: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Send a notification to a role.
        
        Args:
            source_role: The ID of the source role
            target_role: The ID of the target role
            content: The notification content
            metadata: Optional metadata to include
            
        Returns:
            Dict containing success status and any error information
        """
        message = {
            "source_role": source_role,
            "target_role": target_role,
            "content": content
        }
        
        if metadata:
            message["metadata"] = metadata
        
        return self.route_message(message) 