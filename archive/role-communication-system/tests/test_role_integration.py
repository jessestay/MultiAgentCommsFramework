"""
Integration tests for role-based communication workflows.

Tests complete conversation cycles and message routing between multiple roles.
"""

import pytest
import asyncio
from datetime import datetime
from typing import Dict, List, Any
from pathlib import Path

from src.storage_manager import StorageManager
from src.security_manager import SecurityManager
from src.role_communication_manager import RoleCommunicationManager
from src.message_router import MessageRouter

class TestRoleIntegration:
    @pytest.fixture
    def test_db_path(self, tmp_path) -> Path:
        """Create a temporary database path."""
        return tmp_path / "test_role_communications.db"
    
    @pytest.fixture
    def managers(self, test_db_path):
        """Initialize all required managers."""
        security_manager = SecurityManager()
        storage_manager = StorageManager(security_manager, test_db_path)
        message_router = MessageRouter(security_manager, storage_manager)
        comm_manager = RoleCommunicationManager(message_router)
        
        return {
            "security": security_manager,
            "storage": storage_manager,
            "router": message_router,
            "comm": comm_manager
        }
    
    @pytest.fixture
    def sample_workflow(self) -> Dict[str, Any]:
        """Create a sample workflow with multiple roles."""
        return {
            "conversation_id": "feature_implementation",
            "workspace": "/test/workspace",
            "roles": ["ES", "SET", "CTW"],
            "metadata": {
                "topic": "Storage System Implementation",
                "priority": "high"
            }
        }
    
    async def test_complete_conversation_cycle(self, managers, sample_workflow):
        """Test a complete conversation cycle between multiple roles."""
        storage = managers["storage"]
        comm = managers["comm"]
        
        # Start conversation (ES to SET)
        conv_id = sample_workflow["conversation_id"]
        storage.create_conversation(conv_id, sample_workflow["metadata"], sample_workflow["workspace"])
        
        # ES delegates task to SET
        es_message = {
            "id": "msg1",
            "source_role": "ES",
            "target_role": "SET",
            "content": "[ES]: @SET: Please implement the storage system with SQLite backend",
            "urgent": True
        }
        await comm.send_message(es_message)
        
        # SET acknowledges and updates ES
        set_response = {
            "id": "msg2",
            "source_role": "SET",
            "target_role": "ES",
            "content": "[SET]: @ES: Starting implementation. Will coordinate with CTW for documentation.",
            "urgent": False
        }
        await comm.send_message(set_response)
        
        # SET requests documentation from CTW
        set_to_ctw = {
            "id": "msg3",
            "source_role": "SET",
            "target_role": "CTW",
            "content": "[SET]: @CTW: Please prepare documentation for the storage system API",
            "urgent": False
        }
        await comm.send_message(set_to_ctw)
        
        # Verify message routing and states
        es_messages = storage.get_unread_messages("ES", sample_workflow["workspace"])
        set_messages = storage.get_unread_messages("SET", sample_workflow["workspace"])
        ctw_messages = storage.get_unread_messages("CTW", sample_workflow["workspace"])
        
        assert len(es_messages) == 1
        assert len(set_messages) == 1
        assert len(ctw_messages) == 1
        
        # Verify message order and urgency
        assert es_messages[0]["source_role"] == "SET"
        assert set_messages[0]["urgent"] is True
        assert ctw_messages[0]["source_role"] == "SET"
    
    async def test_role_state_transitions(self, managers, sample_workflow):
        """Test role state changes during a workflow."""
        storage = managers["storage"]
        comm = managers["comm"]
        
        # Initialize role states
        es_initial_state = {"status": "active", "current_task": None}
        set_initial_state = {"status": "available", "current_task": None}
        
        storage.update_role_state("ES", sample_workflow["workspace"], es_initial_state)
        storage.update_role_state("SET", sample_workflow["workspace"], set_initial_state)
        
        # ES assigns task
        await comm.send_message({
            "id": "msg1",
            "source_role": "ES",
            "target_role": "SET",
            "content": "[ES]: @SET: Implement storage system",
            "metadata": {"task_id": "storage_impl"}
        })
        
        # Update role states
        es_delegating_state = {
            "status": "active",
            "current_task": "delegating_storage_impl",
            "last_action": "task_delegation"
        }
        storage.update_role_state("ES", sample_workflow["workspace"], es_delegating_state)
        
        set_working_state = {
            "status": "working",
            "current_task": "storage_impl",
            "assigned_by": "ES"
        }
        storage.update_role_state("SET", sample_workflow["workspace"], set_working_state)
        
        # Verify states
        es_state = storage.get_role_state("ES", sample_workflow["workspace"])
        set_state = storage.get_role_state("SET", sample_workflow["workspace"])
        
        assert es_state["status"] == "active"
        assert es_state["current_task"] == "delegating_storage_impl"
        assert set_state["status"] == "working"
        assert set_state["current_task"] == "storage_impl"
    
    async def test_message_routing_patterns(self, managers, sample_workflow):
        """Test various message routing patterns between roles."""
        storage = managers["storage"]
        comm = managers["comm"]
        
        # Direct message (ES -> SET)
        await comm.send_message({
            "id": "direct1",
            "source_role": "ES",
            "target_role": "SET",
            "content": "Direct message to SET"
        })
        
        # Broadcast message (ES -> all)
        await comm.send_message({
            "id": "broadcast1",
            "source_role": "ES",
            "content": "Broadcast message to all roles"
        })
        
        # Chain message (ES -> SET -> CTW)
        await comm.send_message({
            "id": "chain1",
            "source_role": "ES",
            "target_role": "SET",
            "content": "Message for SET to forward"
        })
        
        await comm.send_message({
            "id": "chain2",
            "source_role": "SET",
            "target_role": "CTW",
            "content": "Forwarded message from ES",
            "metadata": {"original_source": "ES"}
        })
        
        # Verify message delivery
        conversation = storage.get_conversation(sample_workflow["conversation_id"])
        messages = conversation["messages"]
        
        # Check direct message
        direct_msg = next(m for m in messages if m["id"] == "direct1")
        assert direct_msg["target_role"] == "SET"
        
        # Check broadcast message
        broadcast_msg = next(m for m in messages if m["id"] == "broadcast1")
        assert broadcast_msg["target_role"] is None
        
        # Check chain messages
        chain_msgs = [m for m in messages if m["id"].startswith("chain")]
        assert len(chain_msgs) == 2
        assert chain_msgs[1]["metadata"]["original_source"] == "ES"
    
    async def test_urgent_message_handling(self, managers, sample_workflow):
        """Test handling of urgent messages across roles."""
        storage = managers["storage"]
        comm = managers["comm"]
        
        # Send mix of urgent and normal messages
        messages = [
            {
                "id": "normal1",
                "source_role": "ES",
                "target_role": "SET",
                "content": "Normal message 1",
                "urgent": False
            },
            {
                "id": "urgent1",
                "source_role": "ES",
                "target_role": "SET",
                "content": "Urgent message 1",
                "urgent": True
            },
            {
                "id": "normal2",
                "source_role": "ES",
                "target_role": "SET",
                "content": "Normal message 2",
                "urgent": False
            },
            {
                "id": "urgent2",
                "source_role": "ES",
                "target_role": "SET",
                "content": "Urgent message 2",
                "urgent": True
            }
        ]
        
        for msg in messages:
            await comm.send_message(msg)
        
        # Verify message ordering
        unread = storage.get_unread_messages("SET", sample_workflow["workspace"])
        
        # Urgent messages should come first
        assert unread[0]["urgent"] is True
        assert unread[1]["urgent"] is True
        assert unread[2]["urgent"] is False
        assert unread[3]["urgent"] is False
    
    async def test_workspace_isolation(self, managers):
        """Test message isolation between different workspaces."""
        storage = managers["storage"]
        comm = managers["comm"]
        
        # Create conversations in different workspaces
        workspace1 = "/test/workspace1"
        workspace2 = "/test/workspace2"
        
        # Send messages in workspace1
        storage.create_conversation("conv1", {}, workspace1)
        await comm.send_message({
            "id": "msg1",
            "source_role": "ES",
            "target_role": "SET",
            "content": "Message in workspace1",
            "workspace": workspace1
        })
        
        # Send messages in workspace2
        storage.create_conversation("conv2", {}, workspace2)
        await comm.send_message({
            "id": "msg2",
            "source_role": "ES",
            "target_role": "SET",
            "content": "Message in workspace2",
            "workspace": workspace2
        })
        
        # Verify workspace isolation
        messages1 = storage.get_unread_messages("SET", workspace1)
        messages2 = storage.get_unread_messages("SET", workspace2)
        
        assert len(messages1) == 1
        assert len(messages2) == 1
        assert messages1[0]["id"] == "msg1"
        assert messages2[0]["id"] == "msg2" 