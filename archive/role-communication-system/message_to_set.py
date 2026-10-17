#!/usr/bin/env python
"""
Script to send a formal message to SET about debugging the communication system
"""

from role_automation.security_manager import SecurityManager
from role_automation.storage_manager import StorageManager
from role_automation.message_router import MessageRouter

def main():
    """Send a formal message to SET."""
    print("Initializing system components...")
    
    # Initialize components
    security_manager = SecurityManager()
    storage_manager = StorageManager(security_manager)
    message_router = MessageRouter(security_manager, storage_manager)
    
    # Message to send
    message = """[ES]: @SET: I need your assistance with debugging the communication system. 

I've encountered several issues while trying to test the system:

1. There are discrepancies between the expected and actual method signatures:
   - StorageManager.get_conversation() doesn't accept 'decrypt' or 'source_role' parameters
   - MessageRouter.route_message() doesn't accept a 'conversation_id' parameter

2. The check_responses.py script is showing "Conversation not found" errors for all conversations

Please test the communication system thoroughly and ensure:
1. All method signatures are consistent between implementation and usage
2. The response mechanism works correctly
3. Conversations can be properly retrieved and displayed
4. Clear documentation is provided on how to use the updated system

This is a critical component of our AI Role Communication Automation System, and I'll leave these technical debugging tasks to your expertise while I focus on my coordination responsibilities.

Thank you for your assistance."""
    
    # Send the message
    print(f"Sending message to SET...")
    result = message_router.route_message(message)
    print(f"Result: {result}")

if __name__ == "__main__":
    main() 