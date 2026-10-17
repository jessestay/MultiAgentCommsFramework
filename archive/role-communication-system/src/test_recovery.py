"""
Simple test script to verify the recovery procedures implementation.
"""

import os
import sys
import json
import sqlite3
import asyncio
from pathlib import Path
from unittest.mock import MagicMock

# Add the parent directory to the path so we can import from src
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.storage_manager import StorageManager
from src.role_manager import RoleManager
from src.role_communication import RoleCommunicationManager

async def test_unauthorized_role_access_recovery():
    """Test recovery from unauthorized role access."""
    print("Testing unauthorized role access recovery...")
    
    # Create temporary database
    db_path = "test_recovery.db"
    if os.path.exists(db_path):
        os.remove(db_path)
    
    # Create mock security manager
    security_manager = MagicMock()
    security_manager.verify_role_access.return_value = True
    
    # Initialize managers
    storage_manager = StorageManager(security_manager, db_path)
    role_manager = RoleManager(storage_manager)
    comm_manager = RoleCommunicationManager("conversations", encryption_enabled=False)
    
    # Create test conversation
    conversation_id = "recovery_test"
    workspace_path = "/test/workspace"
    metadata = {"topic": "Recovery Testing", "priority": "high"}
    
    storage_manager.create_conversation(conversation_id, metadata, workspace_path)
    
    # Test unauthorized access
    security_manager.verify_role_access.return_value = False
    
    # Attempt unauthorized access
    message = {
        "id": "unauth1",
        "source_role": "UNKNOWN",
        "target_role": "ES",
        "content": "Unauthorized message",
        "conversation_id": conversation_id
    }
    
    try:
        await comm_manager.send_message(message)
        print("ERROR: Unauthorized message was accepted")
    except Exception as e:
        print(f"SUCCESS: Unauthorized message was rejected: {e}")
    
    # Test recovery
    security_manager.verify_role_access.return_value = True
    
    # Send authorized message
    message = {
        "id": "auth1",
        "source_role": "ES",
        "target_role": "SET",
        "content": "Authorized message",
        "conversation_id": conversation_id
    }
    
    try:
        await comm_manager.send_message(message)
        print("SUCCESS: Authorized message was accepted")
    except Exception as e:
        print(f"ERROR: Authorized message was rejected: {e}")
    
    # Clean up
    os.remove(db_path)

async def test_malformed_message_recovery():
    """Test recovery from malformed message format."""
    print("\nTesting malformed message recovery...")
    
    # Create temporary database
    db_path = "test_recovery.db"
    if os.path.exists(db_path):
        os.remove(db_path)
    
    # Create mock security manager
    security_manager = MagicMock()
    security_manager.verify_role_access.return_value = True
    
    # Initialize managers
    storage_manager = StorageManager(security_manager, db_path)
    role_manager = RoleManager(storage_manager)
    comm_manager = RoleCommunicationManager("conversations", encryption_enabled=False)
    
    # Create test conversation
    conversation_id = "recovery_test"
    workspace_path = "/test/workspace"
    metadata = {"topic": "Recovery Testing", "priority": "high"}
    
    storage_manager.create_conversation(conversation_id, metadata, workspace_path)
    
    # Test malformed message
    malformed_message = {
        "id": "malformed1",
        # Missing source_role
        "target_role": "SET",
        "content": "Malformed message"
    }
    
    try:
        await comm_manager.send_message(malformed_message)
        print("ERROR: Malformed message was accepted")
    except Exception as e:
        print(f"SUCCESS: Malformed message was rejected: {e}")
    
    # Test recovery
    valid_message = {
        "id": "valid1",
        "source_role": "ES",
        "target_role": "SET",
        "content": "Valid message",
        "conversation_id": conversation_id
    }
    
    try:
        await comm_manager.send_message(valid_message)
        print("SUCCESS: Valid message was accepted")
    except Exception as e:
        print(f"ERROR: Valid message was rejected: {e}")
    
    # Clean up
    os.remove(db_path)

async def test_invalid_syntax_recovery():
    """Test recovery from invalid message syntax."""
    print("\nTesting invalid syntax recovery...")
    
    # Create temporary database
    db_path = "test_recovery.db"
    if os.path.exists(db_path):
        os.remove(db_path)
    
    # Create mock security manager
    security_manager = MagicMock()
    security_manager.verify_role_access.return_value = True
    
    # Initialize managers
    storage_manager = StorageManager(security_manager, db_path)
    role_manager = RoleManager(storage_manager)
    comm_manager = RoleCommunicationManager("conversations", encryption_enabled=False)
    
    # Create test conversation
    conversation_id = "recovery_test"
    workspace_path = "/test/workspace"
    metadata = {"topic": "Recovery Testing", "priority": "high"}
    
    storage_manager.create_conversation(conversation_id, metadata, workspace_path)
    
    # Test invalid syntax
    invalid_syntax_message = {
        "id": "invalid_syntax1",
        "source_role": "ES",
        "target_role": "SET",
        "content": "Invalid syntax message [ES: @SET: Missing closing bracket",
        "conversation_id": conversation_id
    }
    
    try:
        await comm_manager.validate_message_format(invalid_syntax_message)
        print("ERROR: Invalid syntax message was accepted")
    except Exception as e:
        print(f"SUCCESS: Invalid syntax message was rejected: {e}")
    
    # Test recovery
    valid_message = {
        "id": "valid_syntax1",
        "source_role": "ES",
        "target_role": "SET",
        "content": "[ES]: @SET: Valid syntax message",
        "conversation_id": conversation_id
    }
    
    try:
        await comm_manager.validate_message_format(valid_message)
        print("SUCCESS: Valid syntax message was accepted")
    except Exception as e:
        print(f"ERROR: Valid syntax message was rejected: {e}")
    
    # Clean up
    os.remove(db_path)

async def test_database_connection_recovery():
    """Test recovery from database connection failure."""
    print("\nTesting database connection recovery...")
    
    # Create temporary database
    db_path = "test_recovery.db"
    if os.path.exists(db_path):
        os.remove(db_path)
    
    # Create mock security manager
    security_manager = MagicMock()
    security_manager.verify_role_access.return_value = True
    
    # Initialize managers
    storage_manager = StorageManager(security_manager, db_path)
    
    # Create test conversation
    conversation_id = "recovery_test"
    workspace_path = "/test/workspace"
    metadata = {"topic": "Recovery Testing", "priority": "high"}
    
    storage_manager.create_conversation(conversation_id, metadata, workspace_path)
    
    # Add a message
    message = {
        "id": "db_msg1",
        "source_role": "ES",
        "target_role": "SET",
        "content": "Database test message"
    }
    storage_manager.add_message(conversation_id, message)
    
    # Simulate database connection failure by corrupting the database
    try:
        with sqlite3.connect(db_path) as conn:
            conn.execute("DROP TABLE messages")
        print("Simulated database corruption")
    except Exception as e:
        print(f"Error simulating database corruption: {e}")
    
    # Test recovery
    try:
        # This should fail but not crash
        storage_manager.get_conversation(conversation_id)
        print("ERROR: Database corruption not detected")
    except Exception as e:
        print(f"SUCCESS: Database corruption detected: {e}")
    
    # Clean up
    os.remove(db_path)

async def main():
    """Run all tests."""
    await test_unauthorized_role_access_recovery()
    await test_malformed_message_recovery()
    await test_invalid_syntax_recovery()
    await test_database_connection_recovery()

if __name__ == "__main__":
    asyncio.run(main()) 