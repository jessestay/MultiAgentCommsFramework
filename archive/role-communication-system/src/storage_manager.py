"""
Storage Manager for Role Communications

Implements persistent storage using SQLite, similar to Cursor's notepad storage system.
"""

import os
import sqlite3
import json
import logging
import shutil
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class StorageManager:
    def __init__(self, security_manager, db_path: Optional[str] = None):
        """Initialize the storage manager with SQLite backend.
        
        Args:
            security_manager: Security manager instance for access control
            db_path: Optional path to SQLite database file. Defaults to ~/.cursor/role_communications.db
        """
        self.security_manager = security_manager
        
        # Set up database path
        if db_path is None:
            cursor_dir = Path.home() / '.cursor'
            cursor_dir.mkdir(exist_ok=True)
            self.db_path = cursor_dir / 'role_communications.db'
        else:
            self.db_path = Path(db_path)
            
        # Initialize database
        self._init_database()
        
        # Set up backup directory
        self.backup_dir = Path(self.db_path).parent / 'backups'
        self.backup_dir.mkdir(exist_ok=True)
    
    def _init_database(self):
        """Initialize SQLite database with required tables and indexes."""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            
            # Enable foreign keys
            cursor.execute("PRAGMA foreign_keys = ON")
            
            # Create conversations table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    workspace_path TEXT,
                    metadata TEXT
                )
            """)
            
            # Create messages table
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
            
            # Create roles table for tracking role state
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS role_states (
                    role TEXT,
                    workspace_path TEXT,
                    state TEXT,
                    last_active TIMESTAMP,
                    PRIMARY KEY (role, workspace_path)
                )
            """)
            
            # Create indexes for common queries
            
            # Index for looking up messages by role
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_source_role 
                ON messages(source_role)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_target_role 
                ON messages(target_role)
            """)
            
            # Index for unread messages
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_unread 
                ON messages(target_role, read) 
                WHERE read = 0
            """)
            
            # Index for urgent messages
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_urgent 
                ON messages(target_role, urgent) 
                WHERE urgent = 1
            """)
            
            # Create backup table to track backups
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS backups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    path TEXT,
                    description TEXT
                )
            """)
            
            # Create error_log table for tracking errors
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS error_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    error_code INTEGER,
                    error_category TEXT,
                    error_message TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    context TEXT
                )
            """)
    
    def create_conversation(self, conversation_id: str, metadata: Dict[str, Any], workspace_path: Optional[str] = None) -> bool:
        """Create a new conversation.
        
        Args:
            conversation_id: Unique identifier for the conversation
            metadata: Additional metadata for the conversation
            workspace_path: Optional workspace path for context
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                
                # Check if conversation already exists
                cursor.execute("SELECT id FROM conversations WHERE id = ?", (conversation_id,))
                if cursor.fetchone():
                    logger.warning(f"Conversation {conversation_id} already exists")
                    return False
                
                # Insert new conversation
                cursor.execute(
                    "INSERT INTO conversations (id, workspace_path, metadata) VALUES (?, ?, ?)",
                    (conversation_id, workspace_path, json.dumps(metadata))
                )
                
                logger.info(f"Created conversation {conversation_id}")
                return True
        except sqlite3.Error as e:
            logger.error(f"Error creating conversation: {e}")
            self._log_error(4001, "System", f"Database error creating conversation: {e}", 
                           {"conversation_id": conversation_id})
            return False
    
    def add_message(self, conversation_id: str, message: Dict[str, Any]) -> bool:
        """Add a message to a conversation.
        
        Args:
            conversation_id: Conversation identifier
            message: Message data including id, source_role, target_role, content
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Validate required fields
            required_fields = ["id", "source_role", "content"]
            for field in required_fields:
                if field not in message:
                    logger.error(f"Missing required field: {field}")
                    self._log_error(2001, "Format", f"Missing required field: {field}", 
                                  {"conversation_id": conversation_id, "message_id": message.get("id", "unknown")})
                    return False
            
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                
                # Check if conversation exists
                cursor.execute("SELECT id FROM conversations WHERE id = ?", (conversation_id,))
                if not cursor.fetchone():
                    logger.error(f"Conversation {conversation_id} not found")
                    return False
                
                # Check if message already exists
                cursor.execute("SELECT id FROM messages WHERE id = ?", (message["id"],))
                if cursor.fetchone():
                    logger.warning(f"Message {message['id']} already exists")
                    return False
                
                # Insert message
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
                
                logger.info(f"Added message {message['id']} to conversation {conversation_id}")
                return True
        except sqlite3.Error as e:
            logger.error(f"Error adding message: {e}")
            self._log_error(4001, "System", f"Database error adding message: {e}", 
                           {"conversation_id": conversation_id, "message_id": message.get("id", "unknown")})
            
            # If database is locked, retry after a short delay
            if "database is locked" in str(e):
                time.sleep(0.5)  # Wait 500ms
                try:
                    return self.add_message(conversation_id, message)
                except Exception as retry_e:
                    logger.error(f"Retry failed: {retry_e}")
                    return False
            
            return False
    
    def get_conversation(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """Get a conversation by ID.
        
        Args:
            conversation_id: Conversation identifier
            
        Returns:
            Dict containing conversation data and messages, or None if not found
        """
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                # Get conversation
                cursor.execute(
                    "SELECT id, created_at, workspace_path, metadata FROM conversations WHERE id = ?",
                    (conversation_id,)
                )
                row = cursor.fetchone()
                
                if not row:
                    logger.warning(f"Conversation {conversation_id} not found")
                    return None
                
                # Parse conversation data
                try:
                    metadata = json.loads(row["metadata"])
                except json.JSONDecodeError:
                    logger.error(f"Corrupted metadata for conversation {conversation_id}")
                    self._log_error(3002, "State", f"Corrupted metadata for conversation", 
                                  {"conversation_id": conversation_id})
                    
                    # Try to recover from backup
                    recovered = self.recover_conversation(conversation_id)
                    if recovered:
                        return self.get_conversation(conversation_id)
                    
                    # If recovery failed, return minimal valid data
                    metadata = {"recovered": True, "original_corrupted": True}
                
                conversation = {
                    "id": row["id"],
                    "created_at": row["created_at"],
                    "workspace_path": row["workspace_path"],
                    "metadata": metadata,
                    "messages": []
                }
                
                # Get messages
                cursor.execute(
                    """SELECT id, source_role, target_role, content, timestamp, read, urgent 
                       FROM messages WHERE conversation_id = ? 
                       ORDER BY CASE WHEN urgent = 1 THEN 0 ELSE 1 END, timestamp""",
                    (conversation_id,)
                )
                
                for msg_row in cursor.fetchall():
                    message = {
                        "id": msg_row["id"],
                        "source_role": msg_row["source_role"],
                        "target_role": msg_row["target_role"],
                        "content": msg_row["content"],
                        "timestamp": msg_row["timestamp"],
                        "read": bool(msg_row["read"]),
                        "urgent": bool(msg_row["urgent"])
                    }
                    conversation["messages"].append(message)
                
                return conversation
        except sqlite3.Error as e:
            logger.error(f"Error getting conversation: {e}")
            self._log_error(4001, "System", f"Database error getting conversation: {e}", 
                           {"conversation_id": conversation_id})
            return None
    
    def get_unread_messages(self, role: str, workspace_path: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get unread messages for a specific role.
        
        Args:
            role: Role identifier
            workspace_path: Optional workspace path for filtering
            
        Returns:
            List of unread messages
        """
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                query = """
                    SELECT m.id, m.conversation_id, m.source_role, m.target_role, 
                           m.content, m.timestamp, m.urgent
                    FROM messages m
                    JOIN conversations c ON m.conversation_id = c.id
                    WHERE m.target_role = ? AND m.read = 0
                """
                
                params = [role]
                
                if workspace_path:
                    query += " AND c.workspace_path = ?"
                    params.append(workspace_path)
                
                # Order by urgency (urgent first) then timestamp
                query += " ORDER BY m.urgent DESC, m.timestamp ASC"
                
                cursor.execute(query, params)
                
                messages = []
                for row in cursor.fetchall():
                    message = {
                        "id": row["id"],
                        "conversation_id": row["conversation_id"],
                        "source_role": row["source_role"],
                        "target_role": row["target_role"],
                        "content": row["content"],
                        "timestamp": row["timestamp"],
                        "urgent": bool(row["urgent"])
                    }
                    messages.append(message)
                
                return messages
        except sqlite3.Error as e:
            logger.error(f"Error getting unread messages: {e}")
            self._log_error(4001, "System", f"Database error getting unread messages: {e}", 
                           {"role": role, "workspace_path": workspace_path})
            return []
    
    def mark_messages_read(self, message_ids: List[str]) -> bool:
        """Mark messages as read.
        
        Args:
            message_ids: List of message IDs to mark as read
            
        Returns:
            bool: True if successful, False otherwise
        """
        if not message_ids:
            return True
            
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                
                # Use parameterized query with multiple placeholders
                placeholders = ",".join(["?"] * len(message_ids))
                cursor.execute(
                    f"UPDATE messages SET read = 1 WHERE id IN ({placeholders})",
                    message_ids
                )
                
                logger.info(f"Marked {cursor.rowcount} messages as read")
                return cursor.rowcount > 0
        except sqlite3.Error as e:
            logger.error(f"Error marking messages as read: {e}")
            self._log_error(4001, "System", f"Database error marking messages as read: {e}", 
                           {"message_ids": message_ids})
            return False
    
    def update_role_state(self, role: str, workspace_path: str, state: Dict[str, Any]) -> bool:
        """Update the state of a role.
        
        Args:
            role: Role identifier
            workspace_path: Workspace path for context
            state: State data
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                
                # Insert or replace role state
                cursor.execute(
                    """INSERT OR REPLACE INTO role_states 
                       (role, workspace_path, state, last_active) 
                       VALUES (?, ?, ?, datetime('now'))""",
                    (role, workspace_path, json.dumps(state))
                )
                
                logger.info(f"Updated state for role {role} in workspace {workspace_path}")
                return True
        except sqlite3.Error as e:
            logger.error(f"Error updating role state: {e}")
            self._log_error(4001, "System", f"Database error updating role state: {e}", 
                           {"role": role, "workspace_path": workspace_path})
            return False
    
    def get_role_state(self, role: str, workspace_path: str) -> Optional[Dict[str, Any]]:
        """Get the state of a role.
        
        Args:
            role: Role identifier
            workspace_path: Workspace path for context
            
        Returns:
            Dict containing role state, or None if not found
        """
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                cursor.execute(
                    "SELECT state, last_active FROM role_states WHERE role = ? AND workspace_path = ?",
                    (role, workspace_path)
                )
                
                row = cursor.fetchone()
                if not row:
                    logger.info(f"No state found for role {role} in workspace {workspace_path}")
                    return None
                
                try:
                    state = json.loads(row["state"])
                    state["last_active"] = row["last_active"]
                    return state
                except json.JSONDecodeError:
                    logger.error(f"Corrupted state for role {role}")
                    self._log_error(3002, "State", f"Corrupted state data", 
                                  {"role": role, "workspace_path": workspace_path})
                    return None
        except sqlite3.Error as e:
            logger.error(f"Error getting role state: {e}")
            self._log_error(4001, "System", f"Database error getting role state: {e}", 
                           {"role": role, "workspace_path": workspace_path})
            return None
    
    def delete_conversation(self, conversation_id: str, requesting_role: str) -> bool:
        """Delete a conversation.
        
        Args:
            conversation_id: Conversation identifier
            requesting_role: Role requesting the deletion
            
        Returns:
            bool: True if successful, False otherwise
        """
        # Check if role has permission to delete
        if not self.security_manager.verify_action_permission(requesting_role, "delete_conversation"):
            logger.warning(f"Role {requesting_role} does not have permission to delete conversations")
            self._log_error(1002, "Authorization", f"Permission boundary violation", 
                           {"role": requesting_role, "action": "delete_conversation"})
            raise PermissionError(f"Role {requesting_role} does not have permission to delete conversations")
        
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                
                # Delete messages first (due to foreign key constraint)
                cursor.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
                
                # Then delete conversation
                cursor.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
                
                if cursor.rowcount == 0:
                    logger.warning(f"Conversation {conversation_id} not found for deletion")
                    return False
                
                logger.info(f"Deleted conversation {conversation_id}")
                return True
        except sqlite3.Error as e:
            logger.error(f"Error deleting conversation: {e}")
            self._log_error(4001, "System", f"Database error deleting conversation: {e}", 
                           {"conversation_id": conversation_id})
            return False
    
    def create_backup(self, description: str = "Scheduled backup") -> bool:
        """Create a backup of the database.
        
        Args:
            description: Description of the backup
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Generate backup filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = self.backup_dir / f"role_communications_{timestamp}.db"
            
            # Create backup by copying the database file
            shutil.copy2(str(self.db_path), str(backup_path))
            
            # Record backup in the database
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO backups (path, description) VALUES (?, ?)",
                    (str(backup_path), description)
                )
            
            logger.info(f"Created backup at {backup_path}")
            return True
        except (sqlite3.Error, IOError) as e:
            logger.error(f"Error creating backup: {e}")
            self._log_error(4001, "System", f"Error creating backup: {e}", {})
            return False
    
    def recover_conversation(self, conversation_id: str) -> bool:
        """Recover a corrupted conversation from backup.
        
        Args:
            conversation_id: Conversation identifier
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # First, try to find the most recent backup
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                cursor.execute(
                    "SELECT path FROM backups ORDER BY timestamp DESC LIMIT 1"
                )
                
                row = cursor.fetchone()
                if not row:
                    logger.warning("No backups found for recovery")
                    return self._initialize_clean_conversation(conversation_id)
                
                backup_path = row["path"]
            
            # Connect to backup database
            with sqlite3.connect(backup_path) as backup_conn:
                backup_conn.row_factory = sqlite3.Row
                backup_cursor = backup_conn.cursor()
                
                # Get conversation data from backup
                backup_cursor.execute(
                    "SELECT id, workspace_path, metadata FROM conversations WHERE id = ?",
                    (conversation_id,)
                )
                
                conv_row = backup_cursor.fetchone()
                if not conv_row:
                    logger.warning(f"Conversation {conversation_id} not found in backup")
                    return self._initialize_clean_conversation(conversation_id)
                
                # Get messages from backup
                backup_cursor.execute(
                    """SELECT id, source_role, target_role, content, timestamp, read, urgent 
                       FROM messages WHERE conversation_id = ?""",
                    (conversation_id,)
                )
                
                messages = []
                for msg_row in backup_cursor.fetchall():
                    message = {
                        "id": msg_row["id"],
                        "source_role": msg_row["source_role"],
                        "target_role": msg_row["target_role"],
                        "content": msg_row["content"],
                        "timestamp": msg_row["timestamp"],
                        "read": bool(msg_row["read"]),
                        "urgent": bool(msg_row["urgent"])
                    }
                    messages.append(message)
            
            # Restore conversation from backup
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                
                # Delete existing corrupted data
                cursor.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
                cursor.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
                
                # Restore conversation
                cursor.execute(
                    "INSERT INTO conversations (id, workspace_path, metadata) VALUES (?, ?, ?)",
                    (
                        conv_row["id"],
                        conv_row["workspace_path"],
                        conv_row["metadata"]
                    )
                )
                
                # Restore messages
                for message in messages:
                    cursor.execute(
                        """INSERT INTO messages 
                           (id, conversation_id, source_role, target_role, content, timestamp, read, urgent) 
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            message["id"],
                            conversation_id,
                            message["source_role"],
                            message["target_role"],
                            message["content"],
                            message["timestamp"],
                            1 if message["read"] else 0,
                            1 if message["urgent"] else 0
                        )
                    )
            
            logger.info(f"Recovered conversation {conversation_id} from backup")
            return True
        except (sqlite3.Error, IOError) as e:
            logger.error(f"Error recovering conversation: {e}")
            self._log_error(4001, "System", f"Error recovering conversation: {e}", 
                           {"conversation_id": conversation_id})
            
            # If recovery from backup fails, initialize a clean conversation
            return self._initialize_clean_conversation(conversation_id)
    
    def _initialize_clean_conversation(self, conversation_id: str) -> bool:
        """Initialize a clean conversation when recovery fails.
        
        Args:
            conversation_id: Conversation identifier
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                
                # Delete any existing corrupted data
                cursor.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
                cursor.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
                
                # Create a new clean conversation
                metadata = {
                    "recovered": True,
                    "recovery_time": datetime.now().isoformat(),
                    "note": "This conversation was recreated after corruption"
                }
                
                cursor.execute(
                    "INSERT INTO conversations (id, metadata) VALUES (?, ?)",
                    (conversation_id, json.dumps(metadata))
                )
                
                logger.info(f"Initialized clean conversation {conversation_id} after recovery failure")
                return True
        except sqlite3.Error as e:
            logger.error(f"Error initializing clean conversation: {e}")
            self._log_error(4001, "System", f"Error initializing clean conversation: {e}", 
                           {"conversation_id": conversation_id})
            return False
    
    def enforce_storage_limits(self) -> bool:
        """Enforce storage limits to prevent resource exhaustion.
        
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Check database file size
            db_size = os.path.getsize(str(self.db_path))
            max_size = 100 * 1024 * 1024  # 100 MB limit
            
            if db_size > max_size:
                logger.warning(f"Database size ({db_size} bytes) exceeds limit ({max_size} bytes)")
                
                # Clean up old conversations
                self.cleanup_old_conversations()
                
                # Check if cleanup was sufficient
                new_size = os.path.getsize(str(self.db_path))
                if new_size > max_size:
                    logger.error("Database still exceeds size limit after cleanup")
                    self._log_error(4002, "System", "Resource exhaustion: Database size limit exceeded", 
                                  {"current_size": new_size, "max_size": max_size})
                    raise Exception("Database size limit exceeded")
            
            return True
        except Exception as e:
            logger.error(f"Error enforcing storage limits: {e}")
            self._log_error(4002, "System", f"Error enforcing storage limits: {e}", {})
            return False
    
    def cleanup_old_conversations(self, days: int = 30) -> bool:
        """Clean up conversations older than specified days.
        
        Args:
            days: Number of days to keep conversations
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            cutoff_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
            
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                
                # Get old conversations
                cursor.execute(
                    "SELECT id FROM conversations WHERE created_at < ?",
                    (cutoff_date,)
                )
                
                old_conversations = [row[0] for row in cursor.fetchall()]
                
                # Delete old conversations
                for conv_id in old_conversations:
                    # Delete messages first (due to foreign key constraint)
                    cursor.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
                    
                    # Then delete conversation
                    cursor.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
                
                logger.info(f"Cleaned up {len(old_conversations)} old conversations")
                return True
        except sqlite3.Error as e:
            logger.error(f"Error cleaning up old conversations: {e}")
            self._log_error(4001, "System", f"Error cleaning up old conversations: {e}", {})
            return False
    
    def _log_error(self, error_code: int, error_category: str, error_message: str, context: Dict[str, Any]) -> None:
        """Log an error to the error_log table.
        
        Args:
            error_code: Error code (e.g., 1001, 2001)
            error_category: Error category (Authorization, Format, State, System)
            error_message: Error message
            context: Additional context for the error
        """
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                
                cursor.execute(
                    """INSERT INTO error_log 
                       (error_code, error_category, error_message, context) 
                       VALUES (?, ?, ?, ?)""",
                    (
                        error_code,
                        error_category,
                        error_message,
                        json.dumps(context)
                    )
                )
        except sqlite3.Error as e:
            # If we can't log to the database, log to the logger
            logger.error(f"Error logging to error_log table: {e}")
            logger.error(f"Original error: [{error_code}] {error_category}: {error_message}") 