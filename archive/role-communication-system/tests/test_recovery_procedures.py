"""
Recovery procedure tests for the role communication system.

Tests error handling and recovery procedures for different error categories:
1. Authorization Errors (1xxx)
2. Format Errors (2xxx)
3. State Errors (3xxx)
4. System Errors (4xxx)
"""

import pytest
import asyncio
import sqlite3
import json
import os
from unittest.mock import MagicMock, patch
from datetime import datetime
from typing import Dict, List, Any
from pathlib import Path

from src.storage_manager import StorageManager
from src.role_manager import RoleManager
from src.role_communication import RoleCommunicationManager

class TestRecoveryProcedures:
    """Test recovery procedures for different error categories."""
    
    @pytest.fixture
    def test_db_path(self, tmp_path) -> Path:
        """Create a temporary database path."""
        return tmp_path / "test_recovery.db"
    
    @pytest.fixture
    def mock_security_manager(self):
        """Create a mock security manager."""
        security_manager = MagicMock()
        security_manager.verify_role_access.return_value = True
        security_manager.encrypt_message.side_effect = lambda x: x
        security_manager.decrypt_message.side_effect = lambda x: x
        return security_manager
    
    @pytest.fixture
    def storage_manager(self, test_db_path, mock_security_manager):
        """Initialize storage manager with test database."""
        return StorageManager(mock_security_manager, test_db_path)
    
    @pytest.fixture
    def role_manager(self, storage_manager):
        """Initialize role manager."""
        return RoleManager(storage_manager)
    
    @pytest.fixture
    def comm_manager(self, storage_manager, role_manager):
        """Initialize communication manager."""
        return RoleCommunicationManager("conversations", encryption_enabled=False)
    
    @pytest.fixture
    def sample_conversation(self):
        """Create a sample conversation."""
        return {
            "id": "recovery_test",
            "workspace": "/test/workspace",
            "metadata": {
                "topic": "Recovery Testing",
                "priority": "high"
            }
        }
    
    #
    # 1. Authorization Error (1xxx) Recovery Tests
    #
    
    async def test_unauthorized_role_access_recovery(self, storage_manager, mock_security_manager, comm_manager, sample_conversation):
        """
        Test recovery from unauthorized role access (Error 1001).
        
        Scenario: A role attempts to access a conversation it's not authorized for,
        then the system recovers by properly logging the attempt and denying access.
        """
        # Setup
        storage_manager.create_conversation(sample_conversation["id"], sample_conversation["metadata"], sample_conversation["workspace"])
        
        # Mock security manager to deny access
        mock_security_manager.verify_role_access.return_value = False
        
        # Attempt unauthorized access
        message = {
            "id": "unauth1",
            "source_role": "UNKNOWN",
            "target_role": "ES",
            "content": "Unauthorized message",
            "conversation_id": sample_conversation["id"]
        }
        
        # Verify access is denied and properly logged
        with pytest.raises(Exception) as exc_info:
            await comm_manager.send_message(message)
        
        assert "unauthorized" in str(exc_info.value).lower()
        
        # Verify recovery: system remains stable and authorized roles can still communicate
        mock_security_manager.verify_role_access.return_value = True
        
        valid_message = {
            "id": "auth1",
            "source_role": "ES",
            "target_role": "SET",
            "content": "Authorized message",
            "conversation_id": sample_conversation["id"]
        }
        
        # This should succeed
        await comm_manager.send_message(valid_message)
        
        # Verify message was delivered
        messages = storage_manager.get_conversation(sample_conversation["id"])["messages"]
        assert len(messages) == 1
        assert messages[0]["id"] == "auth1"
    
    async def test_role_permission_boundary_recovery(self, storage_manager, mock_security_manager, comm_manager, sample_conversation):
        """
        Test recovery from role permission boundary violation (Error 1002).
        
        Scenario: A role attempts to perform an action beyond its permissions,
        then the system recovers by enforcing boundaries and maintaining system integrity.
        """
        # Setup
        storage_manager.create_conversation(sample_conversation["id"], sample_conversation["metadata"], sample_conversation["workspace"])
        
        # Mock security manager to allow initial access but deny specific action
        mock_security_manager.verify_role_access.return_value = True
        mock_security_manager.verify_action_permission.side_effect = lambda role, action: action != "delete_conversation"
        
        # Attempt unauthorized action
        with pytest.raises(Exception) as exc_info:
            storage_manager.delete_conversation(sample_conversation["id"], "CTW")
        
        assert "permission" in str(exc_info.value).lower()
        
        # Verify recovery: conversation still exists and can be accessed
        conversation = storage_manager.get_conversation(sample_conversation["id"])
        assert conversation is not None
        assert conversation["id"] == sample_conversation["id"]
        
        # Authorized role can perform the action
        mock_security_manager.verify_action_permission.side_effect = lambda role, action: True
        result = storage_manager.delete_conversation(sample_conversation["id"], "ES")
        assert result is True
    
    #
    # 2. Format Error (2xxx) Recovery Tests
    #
    
    async def test_malformed_message_recovery(self, storage_manager, comm_manager, sample_conversation):
        """
        Test recovery from malformed message format (Error 2001).
        
        Scenario: A malformed message is sent, then the system recovers by
        rejecting the message and maintaining valid communication.
        """
        # Setup
        storage_manager.create_conversation(sample_conversation["id"], sample_conversation["metadata"], sample_conversation["workspace"])
        
        # Send malformed message (missing required fields)
        malformed_message = {
            "id": "malformed1",
            # Missing source_role
            "target_role": "SET",
            "content": "Malformed message"
        }
        
        # Verify message is rejected
        with pytest.raises(Exception) as exc_info:
            await comm_manager.send_message(malformed_message)
        
        assert "format" in str(exc_info.value).lower() or "required" in str(exc_info.value).lower()
        
        # Verify recovery: system can still process valid messages
        valid_message = {
            "id": "valid1",
            "source_role": "ES",
            "target_role": "SET",
            "content": "Valid message",
            "conversation_id": sample_conversation["id"]
        }
        
        await comm_manager.send_message(valid_message)
        
        # Verify message was delivered
        messages = storage_manager.get_conversation(sample_conversation["id"])["messages"]
        assert len(messages) == 1
        assert messages[0]["id"] == "valid1"
    
    async def test_invalid_syntax_recovery(self, storage_manager, comm_manager, sample_conversation):
        """
        Test recovery from invalid message syntax (Error 2002).
        
        Scenario: A message with invalid syntax is sent, then the system
        recovers by properly handling the error and maintaining communication.
        """
        # Setup
        storage_manager.create_conversation(sample_conversation["id"], sample_conversation["metadata"], sample_conversation["workspace"])
        
        # Send message with invalid syntax
        invalid_syntax_message = {
            "id": "invalid_syntax1",
            "source_role": "ES",
            "target_role": "SET",
            "content": "Invalid syntax message [ES: @SET: Missing closing bracket",
            "conversation_id": sample_conversation["id"]
        }
        
        # Verify message is flagged but system remains stable
        with pytest.raises(Exception) as exc_info:
            await comm_manager.validate_message_format(invalid_syntax_message)
        
        assert "syntax" in str(exc_info.value).lower() or "format" in str(exc_info.value).lower()
        
        # Verify recovery: system can still process valid messages
        valid_message = {
            "id": "valid_syntax1",
            "source_role": "ES",
            "target_role": "SET",
            "content": "[ES]: @SET: Valid syntax message",
            "conversation_id": sample_conversation["id"]
        }
        
        await comm_manager.send_message(valid_message)
        
        # Verify message was delivered
        messages = storage_manager.get_conversation(sample_conversation["id"])["messages"]
        assert len(messages) == 1
        assert messages[0]["id"] == "valid_syntax1"
    
    #
    # 3. State Error (3xxx) Recovery Tests
    #
    
    async def test_invalid_state_transition_recovery(self, storage_manager, role_manager, sample_conversation):
        """
        Test recovery from invalid state transition (Error 3001).
        
        Scenario: A role attempts an invalid state transition, then the
        system recovers by maintaining the previous valid state.
        """
        # Setup
        storage_manager.create_conversation(sample_conversation["id"], sample_conversation["metadata"], sample_conversation["workspace"])
        
        # Set initial state
        initial_state = {"status": "available", "current_task": None}
        storage_manager.update_role_state("SET", sample_conversation["workspace"], initial_state)
        
        # Attempt invalid state transition (e.g., from available to completed without going through working)
        invalid_state = {"status": "completed", "current_task": "task1"}
        
        with pytest.raises(Exception) as exc_info:
            role_manager.validate_state_transition("SET", sample_conversation["workspace"], invalid_state)
        
        assert "state" in str(exc_info.value).lower() or "transition" in str(exc_info.value).lower()
        
        # Verify recovery: previous valid state is maintained
        current_state = storage_manager.get_role_state("SET", sample_conversation["workspace"])
        assert current_state["status"] == "available"
        
        # Valid state transition works
        valid_state = {"status": "working", "current_task": "task1"}
        role_manager.update_role_state("SET", sample_conversation["workspace"], valid_state)
        
        updated_state = storage_manager.get_role_state("SET", sample_conversation["workspace"])
        assert updated_state["status"] == "working"
        assert updated_state["current_task"] == "task1"
    
    async def test_conversation_state_corruption_recovery(self, storage_manager, sample_conversation):
        """
        Test recovery from conversation state corruption (Error 3002).
        
        Scenario: A conversation's state becomes corrupted, then the system
        recovers by restoring from backup or initializing a clean state.
        """
        # Setup
        storage_manager.create_conversation(sample_conversation["id"], sample_conversation["metadata"], sample_conversation["workspace"])
        
        # Add some messages
        message1 = {
            "id": "msg1",
            "source_role": "ES",
            "target_role": "SET",
            "content": "First message"
        }
        storage_manager.add_message(sample_conversation["id"], message1)
        
        # Simulate corruption by directly manipulating the database
        with sqlite3.connect(str(storage_manager.db_path)) as conn:
            cursor = conn.cursor()
            # Corrupt the conversation data
            cursor.execute(
                "UPDATE conversations SET metadata = ? WHERE id = ?",
                ("CORRUPTED_DATA", sample_conversation["id"])
            )
        
        # Attempt to access corrupted conversation
        with pytest.raises(Exception) as exc_info:
            storage_manager.get_conversation(sample_conversation["id"])
        
        assert "corrupt" in str(exc_info.value).lower() or "invalid" in str(exc_info.value).lower()
        
        # Verify recovery: system can restore from backup or initialize clean state
        storage_manager.recover_conversation(sample_conversation["id"])
        
        # Verify conversation is accessible again
        recovered_conversation = storage_manager.get_conversation(sample_conversation["id"])
        assert recovered_conversation is not None
        assert recovered_conversation["id"] == sample_conversation["id"]
        
        # Messages should still be accessible
        assert len(recovered_conversation["messages"]) == 1
        assert recovered_conversation["messages"][0]["id"] == "msg1"
    
    #
    # 4. System Error (4xxx) Recovery Tests
    #
    
    async def test_database_connection_recovery(self, storage_manager, sample_conversation):
        """
        Test recovery from database connection failure (Error 4001).
        
        Scenario: Database connection is lost, then the system recovers
        by reconnecting and maintaining data integrity.
        """
        # Setup
        storage_manager.create_conversation(sample_conversation["id"], sample_conversation["metadata"], sample_conversation["workspace"])
        
        # Add a message
        message1 = {
            "id": "db_msg1",
            "source_role": "ES",
            "target_role": "SET",
            "content": "Database test message"
        }
        storage_manager.add_message(sample_conversation["id"], message1)
        
        # Simulate database connection failure
        with patch('sqlite3.connect') as mock_connect:
            mock_connect.side_effect = sqlite3.OperationalError("database is locked")
            
            # Attempt operation during connection failure
            with pytest.raises(sqlite3.OperationalError):
                storage_manager.get_conversation(sample_conversation["id"])
        
        # Verify recovery: system reconnects and operations succeed
        # Connection should be re-established automatically
        conversation = storage_manager.get_conversation(sample_conversation["id"])
        assert conversation is not None
        assert conversation["id"] == sample_conversation["id"]
        assert len(conversation["messages"]) == 1
    
    async def test_resource_exhaustion_recovery(self, storage_manager, comm_manager, sample_conversation):
        """
        Test recovery from resource exhaustion (Error 4002).
        
        Scenario: System resources are exhausted (e.g., memory, disk space),
        then the system recovers by freeing resources and maintaining functionality.
        """
        # Setup
        storage_manager.create_conversation(sample_conversation["id"], sample_conversation["metadata"], sample_conversation["workspace"])
        
        # Simulate resource exhaustion
        with patch('os.path.getsize') as mock_getsize:
            # Simulate disk full condition
            mock_getsize.return_value = 10 ** 12  # 1 TB (unrealistically large)
            
            # Attempt operation during resource exhaustion
            with pytest.raises(Exception) as exc_info:
                storage_manager.enforce_storage_limits()
            
            assert "space" in str(exc_info.value).lower() or "resource" in str(exc_info.value).lower()
        
        # Verify recovery: system frees resources and continues functioning
        # Simulate cleanup
        storage_manager.cleanup_old_conversations(days=1)
        
        # System should now function normally
        message = {
            "id": "resource_msg1",
            "source_role": "ES",
            "target_role": "SET",
            "content": "Resource test message",
            "conversation_id": sample_conversation["id"]
        }
        
        await comm_manager.send_message(message)
        
        # Verify message was delivered
        conversation = storage_manager.get_conversation(sample_conversation["id"])
        assert len(conversation["messages"]) == 1
        assert conversation["messages"][0]["id"] == "resource_msg1"
    
    async def test_concurrent_access_recovery(self, storage_manager, sample_conversation):
        """
        Test recovery from concurrent access conflicts (Error 4003).
        
        Scenario: Multiple processes attempt to modify the same data simultaneously,
        then the system recovers by properly handling concurrency and maintaining data integrity.
        """
        # Setup
        storage_manager.create_conversation(sample_conversation["id"], sample_conversation["metadata"], sample_conversation["workspace"])
        
        # Simulate concurrent access by creating multiple messages simultaneously
        messages = []
        for i in range(10):
            messages.append({
                "id": f"concurrent_msg{i}",
                "source_role": "ES",
                "target_role": "SET",
                "content": f"Concurrent message {i}"
            })
        
        # Use asyncio.gather to simulate concurrent execution
        async def add_message(msg):
            return storage_manager.add_message(sample_conversation["id"], msg)
        
        # This might raise sqlite3.OperationalError due to database locks
        try:
            results = await asyncio.gather(*[add_message(msg) for msg in messages])
        except sqlite3.OperationalError as e:
            if "database is locked" in str(e):
                # This is expected behavior for concurrent access
                pass
        
        # Verify recovery: system should handle concurrency and maintain data integrity
        conversation = storage_manager.get_conversation(sample_conversation["id"])
        
        # Some messages should have been added successfully
        assert len(conversation["messages"]) > 0
        
        # All message IDs should be unique
        message_ids = [msg["id"] for msg in conversation["messages"]]
        assert len(message_ids) == len(set(message_ids)) 