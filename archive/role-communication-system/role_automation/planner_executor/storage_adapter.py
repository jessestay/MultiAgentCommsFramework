#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Storage Adapter

This module provides an adapter between the existing StorageManager and MessageRouter
classes and the interfaces expected by the Planner-Executor Architecture.
"""

import os
import json
import uuid
import logging
import datetime
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

class StorageAdapter:
    """
    Adapter for the StorageManager and MessageRouter classes to provide
    the interface expected by the Planner-Executor Architecture.
    """
    
    def __init__(self, storage_manager, message_router=None):
        """
        Initialize the storage adapter.
        
        Args:
            storage_manager: The existing StorageManager instance
            message_router: The existing MessageRouter instance
        """
        self.storage_manager = storage_manager
        self.message_router = message_router
        self.plans_dir = os.path.join(os.getcwd(), "plans")
        
        # Create plans directory if it doesn't exist
        os.makedirs(self.plans_dir, exist_ok=True)
        
        logger.info("Storage adapter initialized")
    
    def create_conversation(self, conversation_id: str, metadata: Dict[str, Any]) -> bool:
        """
        Create a new conversation.
        
        Args:
            conversation_id: The ID for the new conversation
            metadata: Metadata for the conversation
            
        Returns:
            True if successful, False otherwise
        """
        conversation = {
            "id": conversation_id,
            "created_at": datetime.datetime.now().isoformat(),
            "updated_at": datetime.datetime.now().isoformat(),
            "metadata": metadata,
            "messages": []
        }
        
        return self.storage_manager.store_conversation(conversation)
    
    def add_message(self, conversation_id: str, message: Dict[str, Any]) -> bool:
        """
        Add a message to a conversation.
        
        Args:
            conversation_id: The ID of the conversation
            message: The message to add
            
        Returns:
            True if successful, False otherwise
        """
        # Add timestamp if not present
        if "timestamp" not in message:
            message["timestamp"] = datetime.datetime.now().isoformat()
        
        # Add message ID if not present
        if "id" not in message:
            message["id"] = f"msg-{uuid.uuid4()}"
        
        # Format message for MessageRouter if needed
        if self.message_router and "target_role" in message and message["target_role"] != "*":
            # Route the message through MessageRouter
            formatted_message = f"[{message['source_role']}]: @{message['target_role']}: {message['content']}"
            self.message_router.route_message(formatted_message)
        
        # Store the message in the conversation
        return self.storage_manager.add_message_to_conversation(conversation_id, message)
    
    def get_conversation(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a conversation by ID.
        
        Args:
            conversation_id: The ID of the conversation
            
        Returns:
            The conversation or None if not found
        """
        return self.storage_manager.get_conversation(conversation_id)
    
    def get_conversation_messages(self, conversation_id: str) -> List[Dict[str, Any]]:
        """
        Get all messages in a conversation.
        
        Args:
            conversation_id: The ID of the conversation
            
        Returns:
            List of messages in the conversation
        """
        conversation = self.storage_manager.get_conversation(conversation_id)
        if not conversation or "messages" not in conversation:
            return []
        
        return conversation["messages"]
    
    def list_conversations(self, filter_criteria: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        List conversations, optionally filtered by criteria.
        
        Args:
            filter_criteria: Optional criteria to filter conversations
            
        Returns:
            List of conversations matching the criteria
        """
        return self.storage_manager.list_conversations(filter_criteria)
    
    def store_plan(self, plan: Dict[str, Any]) -> bool:
        """
        Store a plan.
        
        Args:
            plan: The plan to store
            
        Returns:
            True if successful, False otherwise
        """
        plan_id = plan["id"]
        file_path = os.path.join(self.plans_dir, f"{plan_id}.json")
        
        try:
            # Update timestamp
            plan["updated_at"] = datetime.datetime.now().isoformat()
            
            # Write to file
            with open(file_path, 'w') as f:
                json.dump(plan, f, indent=2)
            
            logger.info(f"Stored plan: {plan_id}")
            return True
        except Exception as e:
            logger.error(f"Error storing plan {plan_id}: {e}")
            return False
    
    def get_plan(self, plan_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a plan by ID.
        
        Args:
            plan_id: The ID of the plan
            
        Returns:
            The plan or None if not found
        """
        file_path = os.path.join(self.plans_dir, f"{plan_id}.json")
        
        if not os.path.exists(file_path):
            logger.warning(f"Plan not found: {plan_id}")
            return None
        
        try:
            with open(file_path, 'r') as f:
                plan = json.load(f)
            
            logger.info(f"Retrieved plan: {plan_id}")
            return plan
        except Exception as e:
            logger.error(f"Error retrieving plan {plan_id}: {e}")
            return None
    
    def list_plans(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        List all plans, optionally filtered by status.
        
        Args:
            status: Optional status to filter plans
            
        Returns:
            List of plans matching the status
        """
        plans = []
        
        for file_name in os.listdir(self.plans_dir):
            if not file_name.endswith(".json"):
                continue
            
            file_path = os.path.join(self.plans_dir, file_name)
            try:
                with open(file_path, 'r') as f:
                    plan = json.load(f)
                
                if status is None or plan.get("status") == status:
                    plans.append(plan)
            except Exception as e:
                logger.error(f"Error reading plan file {file_path}: {e}")
        
        return plans 