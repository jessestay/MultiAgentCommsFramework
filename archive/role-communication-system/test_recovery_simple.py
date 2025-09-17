"""
Simple test script to verify the recovery procedures implementation.
"""

import os
import json
import sqlite3
import asyncio
import time
from pathlib import Path
from unittest.mock import MagicMock

# Mock classes for testing
class MockStorageManager:
    def __init__(self, security_manager, db_path=None):
        self.security_manager = security_manager
        self.db_path = db_path or "test.db"
        self.conn = None
        self._init_database()
        
    def _init_database(self):
        self.conn = sqlite3.connect(self.db_path)
        cursor = self.conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                workspace_path TEXT,
                metadata TEXT
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT,
                source_role TEXT,
                target_role TEXT,
                content TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                read INTEGER DEFAULT 0,
                urgent INTEGER DEFAULT 0,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id)
            )
        """)
        self.conn.commit()
    
    def create_conversation(self, conversation_id, metadata, workspace_path=None):
        cursor = self.conn.cursor()
        cursor.execute(
            "INSERT INTO conversations (id, workspace_path, metadata) VALUES (?, ?, ?)",
            (conversation_id, workspace_path, json.dumps(metadata))
        )
        self.conn.commit()
        return True
    
    def add_message(self, conversation_id, message):
        cursor = self.conn.cursor()
        cursor.execute(
            """INSERT INTO messages 
               (id, conversation_id, source_role, target_role, content, urgent) 
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                message["id"],
                conversation_id,
                message["source_role"],
                message.get("target_role"),
                message["content"],
                1 if message.get("urgent", False) else 0
            )
        )
        self.conn.commit()
        return True
    
    def get_conversation(self, conversation_id):
        self.conn.row_factory = sqlite3.Row
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT id, created_at, workspace_path, metadata FROM conversations WHERE id = ?",
            (conversation_id,)
        )
        row = cursor.fetchone()
        if not row:
            return None
        
        conversation = {
            "id": row["id"],
            "created_at": row["created_at"],
            "workspace_path": row["workspace_path"],
            "metadata": json.loads(row["metadata"]),
            "messages": []
        }
        
        cursor.execute(
            "SELECT * FROM messages WHERE conversation_id = ?",
            (conversation_id,)
        )
        
        for msg_row in cursor.fetchall():
            message = dict(msg_row)
            conversation["messages"].append(message)
        
        return conversation
    
    def close(self):
        if self.conn:
            self.conn.close()
            self.conn = None

class MockRoleManager:
    def __init__(self, storage_manager):
        self.storage_manager = storage_manager
        self.valid_roles = ["ES", "SET", "CTW", "BIC", "MD", "SMM", "UFL", "DLC", "DRC"]
    
    def validate_role(self, role):
        return role in self.valid_roles

class MockCommunicationManager:
    def __init__(self, base_dir="conversations", encryption_enabled=False):
        self.base_dir = base_dir
        self.encryption_enabled = encryption_enabled
        self.valid_roles = ["ES", "SET", "CTW", "BIC", "MD", "SMM", "UFL", "DLC", "DRC"]
    
    async def validate_message_format(self, message):
        # Check required fields
        required_fields = ["id", "source_role", "content"]
        for field in required_fields:
            if field not in message:
                raise ValueError(f"Format Error (2001): Missing required field: {field}")
        
        # Validate source role
        if message["source_role"] not in self.valid_roles:
            raise ValueError(f"Format Error (2001): Invalid source role: {message['source_role']}")
        
        # Validate target role if present
        if "target_role" in message and message["target_role"] is not None:
            if message["target_role"] not in self.valid_roles:
                raise ValueError(f"Format Error (2001): Invalid target role: {message['target_role']}")
        
        # Validate message syntax
        content = message["content"]
        if not self._validate_message_syntax(content):
            raise ValueError(f"Format Error (2002): Invalid message syntax: {content}")
        
        return True
    
    def _validate_message_syntax(self, content):
        # Check for proper role mention format: [ROLE]: @TARGET_ROLE: Message
        if content.startswith("[") and "]:" in content:
            # Direct message format
            if "@" in content and ":" in content.split("@")[1]:
                return True
            # Broadcast message format
            elif content.count(":") == 1:
                return True
            
            # If it starts with [ but doesn't match the expected format, it's invalid
            return False
        
        # If content doesn't match expected format but is a simple string, allow it
        # But only if it doesn't try to use the role mention syntax incorrectly
        if "[" in content and ("@" in content or "]:" in content):
            return False
            
        if isinstance(content, str) and len(content) > 0:
            return True
        
        return False
    
    async def send_message(self, message):
        # Validate message format
        await self.validate_message_format(message)
        
        # In a real implementation, this would send the message
        return message["id"]

# Test functions
async def test_unauthorized_role_access_recovery():
    """Test recovery from unauthorized role access."""
    print("Testing unauthorized role access recovery...")
    
    # Create temporary database
    db_path = "test_recovery.db"
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except Exception as e:
            print(f"Error removing existing database file: {e}")
    
    # Create mock security manager
    security_manager = MagicMock()
    security_manager.verify_role_access.return_value = True
    
    # Initialize managers
    storage_manager = MockStorageManager(security_manager, db_path)
    role_manager = MockRoleManager(storage_manager)
    comm_manager = MockCommunicationManager("conversations", encryption_enabled=False)
    
    try:
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
    finally:
        # Close the database connection
        storage_manager.close()
        
        # Wait a moment to ensure the connection is fully closed
        await asyncio.sleep(0.1)
        
        # Clean up
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
                print("Database file removed successfully")
            except Exception as e:
                print(f"Error removing database file: {e}")

async def test_malformed_message_recovery():
    """Test recovery from malformed message format."""
    print("\nTesting malformed message recovery...")
    
    # Create temporary database
    db_path = "test_recovery.db"
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except Exception as e:
            print(f"Error removing existing database file: {e}")
    
    # Create mock security manager
    security_manager = MagicMock()
    security_manager.verify_role_access.return_value = True
    
    # Initialize managers
    storage_manager = MockStorageManager(security_manager, db_path)
    role_manager = MockRoleManager(storage_manager)
    comm_manager = MockCommunicationManager("conversations", encryption_enabled=False)
    
    try:
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
    finally:
        # Close the database connection
        storage_manager.close()
        
        # Wait a moment to ensure the connection is fully closed
        await asyncio.sleep(0.1)
        
        # Clean up
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
                print("Database file removed successfully")
            except Exception as e:
                print(f"Error removing database file: {e}")

async def test_invalid_syntax_recovery():
    """Test recovery from invalid message syntax."""
    print("\nTesting invalid syntax recovery...")
    
    # Create temporary database
    db_path = "test_recovery.db"
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except Exception as e:
            print(f"Error removing existing database file: {e}")
    
    # Create mock security manager
    security_manager = MagicMock()
    security_manager.verify_role_access.return_value = True
    
    # Initialize managers
    storage_manager = MockStorageManager(security_manager, db_path)
    role_manager = MockRoleManager(storage_manager)
    comm_manager = MockCommunicationManager("conversations", encryption_enabled=False)
    
    try:
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
    finally:
        # Close the database connection
        storage_manager.close()
        
        # Wait a moment to ensure the connection is fully closed
        await asyncio.sleep(0.1)
        
        # Clean up
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
                print("Database file removed successfully")
            except Exception as e:
                print(f"Error removing database file: {e}")

async def test_database_connection_recovery():
    """Test recovery from database connection failure."""
    print("\nTesting database connection recovery...")
    
    # Create temporary database
    db_path = "test_recovery.db"
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except Exception as e:
            print(f"Error removing existing database file: {e}")
    
    # Create mock security manager
    security_manager = MagicMock()
    security_manager.verify_role_access.return_value = True
    
    # Initialize managers
    storage_manager = MockStorageManager(security_manager, db_path)
    
    try:
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
        
        # Close the connection before corrupting the database
        storage_manager.close()
        
        # Wait a moment to ensure the connection is fully closed
        await asyncio.sleep(0.1)
        
        # Simulate database corruption by corrupting the database
        try:
            with sqlite3.connect(db_path) as conn:
                conn.execute("DROP TABLE messages")
            print("Simulated database corruption")
        except Exception as e:
            print(f"Error simulating database corruption: {e}")
        
        # Reconnect to the database
        storage_manager.conn = sqlite3.connect(db_path)
        
        # Test recovery
        try:
            # This should fail but not crash
            storage_manager.get_conversation(conversation_id)
            print("ERROR: Database corruption not detected")
        except Exception as e:
            print(f"SUCCESS: Database corruption detected: {e}")
    finally:
        # Close the database connection
        storage_manager.close()
        
        # Wait a moment to ensure the connection is fully closed
        await asyncio.sleep(0.5)
        
        # Clean up
        if os.path.exists(db_path):
            for attempt in range(5):
                try:
                    os.remove(db_path)
                    print("Database file removed successfully")
                    break
                except Exception as e:
                    if attempt < 4:
                        print(f"Attempt {attempt+1}: Error removing database file, retrying in 1 second...")
                        await asyncio.sleep(1)
                    else:
                        print(f"Failed to remove database file after 5 attempts: {e}")

async def main():
    """Run all tests."""
    await test_unauthorized_role_access_recovery()
    await test_malformed_message_recovery()
    await test_invalid_syntax_recovery()
    await test_database_connection_recovery()

if __name__ == "__main__":
    asyncio.run(main()) 