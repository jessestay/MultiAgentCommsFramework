#!/usr/bin/env python
"""
Script to check for responses from all roles
"""

from role_automation.security_manager import SecurityManager
from role_automation.storage_manager import StorageManager
from role_automation.message_router import MessageRouter

def main():
    """Check for responses from all roles."""
    print("Initializing system components...")
    
    # Initialize components
    security_manager = SecurityManager()
    storage_manager = StorageManager(security_manager)
    message_router = MessageRouter(security_manager, storage_manager)
    
    # Get all conversations
    conversations = storage_manager.list_conversations()
    
    print(f"Found {len(conversations)} conversations:")
    
    # Check each conversation
    for conv_id in conversations:
        print(f"\nChecking conversation: {conv_id}")
        
        # Get conversation messages
        messages = message_router.get_conversation_messages(conv_id, "ES")
        
        # Format for display
        formatted_conversation = message_router.format_conversation_for_display(messages)
        print(formatted_conversation)
        print("-" * 50)

if __name__ == "__main__":
    main() 