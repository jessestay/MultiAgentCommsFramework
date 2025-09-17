#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Storage Manager

This module handles the storage and retrieval of conversations and role context.
It provides a consistent interface for data persistence across the system.
"""

import os
import json
import logging
import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

class StorageManager:
    """
    Manages storage and retrieval of conversations and role context.
    """
    
    def __init__(self, security_manager=None):
        """
        Initialize the storage manager.
        
        Args:
            security_manager: The security manager for access control
        """
        self.security_manager = security_manager
        
        # Define storage directories
        self.conversations_dir = os.path.join(os.getcwd(), "conversations")
        self.archives_dir = os.path.join(os.getcwd(), "conversation_archives")
        self.roles_dir = os.path.join(os.getcwd(), ".cursor", "roles")
        
        # Create directories if they don't exist
        os.makedirs(self.conversations_dir, exist_ok=True)
        os.makedirs(self.archives_dir, exist_ok=True)
        os.makedirs(self.roles_dir, exist_ok=True)
        
        logger.info("Storage manager initialized")
    
    def store_conversation(self, conversation: Dict[str, Any]) -> bool:
        """
        Store a conversation.
        
        Args:
            conversation: The conversation object to store
            
        Returns:
            True if successful, False otherwise
        """
        if not conversation or "id" not in conversation:
            logger.error("Invalid conversation object")
            return False
        
        conversation_id = conversation["id"]
        file_path = os.path.join(self.conversations_dir, f"{conversation_id}.json")
        
        try:
            # Update timestamp
            conversation["updated_at"] = datetime.datetime.now().isoformat()
            
            # Write to file
            with open(file_path, 'w') as f:
                json.dump(conversation, f, indent=2)
            
            logger.info(f"Stored conversation: {conversation_id}")
            return True
        except Exception as e:
            logger.error(f"Error storing conversation {conversation_id}: {e}")
            return False
    
    def get_conversation(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a conversation by ID.
        
        Args:
            conversation_id: The ID of the conversation to retrieve
            
        Returns:
            The conversation object or None if not found
        """
        file_path = os.path.join(self.conversations_dir, f"{conversation_id}.json")
        
        if not os.path.exists(file_path):
            logger.warning(f"Conversation not found: {conversation_id}")
            return None
        
        try:
            with open(file_path, 'r') as f:
                conversation = json.load(f)
            
            logger.info(f"Retrieved conversation: {conversation_id}")
            return conversation
        except Exception as e:
            logger.error(f"Error retrieving conversation {conversation_id}: {e}")
            return None
    
    def add_message_to_conversation(self, conversation_id: str, message: Dict[str, Any]) -> bool:
        """
        Add a message to an existing conversation.
        
        Args:
            conversation_id: The ID of the conversation
            message: The message to add
            
        Returns:
            True if successful, False otherwise
        """
        conversation = self.get_conversation(conversation_id)
        if not conversation:
            logger.error(f"Conversation not found: {conversation_id}")
            return False
        
        # Add message to conversation
        if "messages" not in conversation:
            conversation["messages"] = []
        
        conversation["messages"].append(message)
        conversation["updated_at"] = datetime.datetime.now().isoformat()
        
        # Store updated conversation
        return self.store_conversation(conversation)
    
    def list_conversations(self, filter_criteria: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        List conversations, optionally filtered by criteria.
        
        Args:
            filter_criteria: Optional criteria to filter conversations
            
        Returns:
            List of conversation objects matching the criteria
        """
        conversations = []
        
        # Get all conversation files
        conversation_files = list(Path(self.conversations_dir).glob("*.json"))
        
        for file_path in conversation_files:
            try:
                with open(file_path, 'r') as f:
                    conversation = json.load(f)
                
                # Apply filters if provided
                if filter_criteria:
                    if not self._matches_criteria(conversation, filter_criteria):
                        continue
                
                conversations.append(conversation)
            except Exception as e:
                logger.error(f"Error reading conversation file {file_path}: {e}")
        
        logger.info(f"Listed {len(conversations)} conversations")
        return conversations
    
    def _matches_criteria(self, conversation: Dict[str, Any], criteria: Dict[str, Any]) -> bool:
        """
        Check if a conversation matches the filter criteria.
        
        Args:
            conversation: The conversation to check
            criteria: The filter criteria
            
        Returns:
            True if the conversation matches the criteria, False otherwise
        """
        for key, value in criteria.items():
            if key not in conversation:
                return False
            
            if isinstance(value, dict):
                # Nested criteria
                if not isinstance(conversation[key], dict):
                    return False
                
                if not self._matches_criteria(conversation[key], value):
                    return False
            elif isinstance(value, list):
                # List criteria (e.g., roles)
                if not isinstance(conversation[key], list):
                    return False
                
                # Check if any value in the criteria list is in the conversation list
                if not any(v in conversation[key] for v in value):
                    return False
            else:
                # Simple equality
                if conversation[key] != value:
                    return False
        
        return True
    
    def archive_conversation(self, conversation_id: str) -> bool:
        """
        Archive a conversation.
        
        Args:
            conversation_id: The ID of the conversation to archive
            
        Returns:
            True if successful, False otherwise
        """
        conversation = self.get_conversation(conversation_id)
        if not conversation:
            logger.error(f"Conversation not found: {conversation_id}")
            return False
        
        # Create archive filename
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        archive_file = os.path.join(self.archives_dir, f"conversation_{conversation_id}_{timestamp}.json")
        
        try:
            # Write to archive file
            with open(archive_file, 'w') as f:
                json.dump(conversation, f, indent=2)
            
            # Remove from active conversations
            os.remove(os.path.join(self.conversations_dir, f"{conversation_id}.json"))
            
            logger.info(f"Archived conversation: {conversation_id}")
            return True
        except Exception as e:
            logger.error(f"Error archiving conversation {conversation_id}: {e}")
            return False
    
    def store_role_context(self, role: str, context: Dict[str, Any]) -> bool:
        """
        Store context for a role.
        
        Args:
            role: The role abbreviation
            context: The context data to store
            
        Returns:
            True if successful, False otherwise
        """
        file_path = os.path.join(self.roles_dir, f"{role.lower()}.json")
        
        try:
            # Update timestamp
            context["updated_at"] = datetime.datetime.now().isoformat()
            
            # Write to file
            with open(file_path, 'w') as f:
                json.dump(context, f, indent=2)
            
            logger.info(f"Stored context for role: {role}")
            return True
        except Exception as e:
            logger.error(f"Error storing context for role {role}: {e}")
            return False
    
    def get_role_context(self, role: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve context for a role.
        
        Args:
            role: The role abbreviation
            
        Returns:
            The role context or None if not found
        """
        file_path = os.path.join(self.roles_dir, f"{role.lower()}.json")
        
        if not os.path.exists(file_path):
            logger.warning(f"Context not found for role: {role}")
            return None
        
        try:
            with open(file_path, 'r') as f:
                context = json.load(f)
            
            logger.info(f"Retrieved context for role: {role}")
            return context
        except Exception as e:
            logger.error(f"Error retrieving context for role {role}: {e}")
            return None 