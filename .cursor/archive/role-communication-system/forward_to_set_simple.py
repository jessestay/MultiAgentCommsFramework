#!/usr/bin/env python
"""
Script to forward the user's message to SET
"""

from role_automation.security_manager import SecurityManager
from role_automation.storage_manager import StorageManager
from role_automation.message_router import MessageRouter

def main():
    """Forward the user's message to SET."""
    print("Initializing system components...")
    
    # Initialize components
    security_manager = SecurityManager()
    storage_manager = StorageManager(security_manager)
    message_router = MessageRouter(security_manager, storage_manager)
    
    # Message to forward
    message = """[ES]: @SET: I'm forwarding a message from the user regarding the implementation plan for enhancing our system based on the devin.cursorrules project. The user has provided a comprehensive implementation plan with four phases:

1. Planner-Executor Architecture - Adapting the Executive Secretary as a Planner role and specialized roles as Executors
2. Self-Evolution Mechanism - Creating knowledge repositories for roles and the project
3. Extended Toolset Integration - Adding web scraping, search capabilities, and tool selection
4. Continuous Communication Loop - Implementing feedback protocols and review processes

The user recommends implementing these in phases, starting with the Planner-Executor Architecture as it provides the foundation for all other enhancements.

Please review the full implementation plan in our next meeting and let me know if you'd like to proceed with Phase 1 or if you have any questions or suggestions."""
    
    # Send the message
    print(f"Forwarding message to SET...")
    result = message_router.route_message(message)
    print(f"Result: {result}")

if __name__ == "__main__":
    main() 