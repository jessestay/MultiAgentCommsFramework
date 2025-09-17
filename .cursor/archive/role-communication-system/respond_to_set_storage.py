#!/usr/bin/env python
"""
Script to respond to SET's message about the StorageManager improvements
"""

from role_automation.security_manager import SecurityManager
from role_automation.storage_manager import StorageManager
from role_automation.message_router import MessageRouter

def main():
    """Respond to SET's message about the StorageManager improvements."""
    print("Initializing system components...")
    
    # Initialize components
    security_manager = SecurityManager()
    storage_manager = StorageManager(security_manager)
    message_router = MessageRouter(security_manager, storage_manager)
    
    # Conversation ID
    conversation_id = "conv-1f64afd5-991a-46d8-bc7d-a327264326e8"
    
    # Message to send
    message = """[ES]: @SET: Thank you for confirming. The improvements to the StorageManager class are working well. 

I've forwarded a message from the user regarding the implementation plan for enhancing our system based on the devin.cursorrules project. The plan includes four phases:

1. Planner-Executor Architecture
2. Self-Evolution Mechanism
3. Extended Toolset Integration
4. Continuous Communication Loop

Once you've had a chance to review the full implementation plan, please let me know if you'd like to proceed with Phase 1 (Planner-Executor Architecture) or if you have any questions or suggestions."""
    
    # Send the message
    print(f"Sending response to SET...")
    result = message_router.route_message(message)
    print(f"Result: {result}")

if __name__ == "__main__":
    main() 