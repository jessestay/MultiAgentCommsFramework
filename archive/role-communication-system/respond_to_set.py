#!/usr/bin/env python
"""
Script to respond to SET's message
"""

from role_automation.security_manager import SecurityManager
from role_automation.storage_manager import StorageManager
from role_automation.message_router import MessageRouter

def main():
    """Respond to SET's message."""
    print("Initializing system components...")
    
    # Initialize components
    security_manager = SecurityManager()
    storage_manager = StorageManager(security_manager)
    message_router = MessageRouter(security_manager, storage_manager)
    
    # Conversation ID
    conversation_id = "conv-1f64afd5-991a-46d8-bc7d-a327264326e8"
    
    # Get the conversation
    conversation = storage_manager.get_conversation(conversation_id)
    
    if not conversation:
        print(f"Error: Could not retrieve conversation {conversation_id}")
        return
    
    print(f"Retrieved conversation: {conversation_id}")
    print(f"  Title: {conversation.get('metadata', {}).get('title', 'No title')}")
    print(f"  Messages: {len(conversation.get('messages', []))}")
    
    # Format and send response
    response = "[ES]: @SET: Thank you for confirming. Could you please explain the security integration improvements in more detail? I'm particularly interested in how the role-based access control works."
    
    print(f"Sending response: {response}")
    result = message_router.route_message(response, conversation_id=conversation_id)
    print(f"Result: {result}")

if __name__ == "__main__":
    main() 