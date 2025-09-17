#!/usr/bin/env python3
"""
Script to check for responses from roles using the role communication system.
"""

import os
import sys
import logging
import json
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from src.role_communication import RoleCommunicationManager

# Configure logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)

logger = logging.getLogger("CheckResponses")

def format_timestamp(timestamp):
    """Format a timestamp into a readable date/time."""
    dt = datetime.fromtimestamp(timestamp)
    return dt.strftime("%Y-%m-%d %H:%M:%S")

def main():
    """Check for responses from roles."""
    # Create role communication manager
    manager = RoleCommunicationManager(base_dir="conversations")
    
    # Register roles
    manager.register_role("ES")
    manager.register_role("SET")
    manager.register_role("BIC")
    manager.register_role("MD")
    
    # Get unread messages for ES
    messages = manager.get_unread_messages("ES")
    
    if not messages:
        print("\n===== NO NEW RESPONSES =====")
        print("There are no new responses from any roles.")
        return
    
    print("\n===== NEW RESPONSES =====")
    
    # Group messages by source role
    messages_by_role = {}
    for message in messages:
        source_role = message.get("source_role", "Unknown")
        if source_role not in messages_by_role:
            messages_by_role[source_role] = []
        messages_by_role[source_role].append(message)
    
    # Sort messages by timestamp within each role
    for role, role_messages in messages_by_role.items():
        role_messages.sort(key=lambda m: m.get("timestamp", 0))
    
    # Display messages by role
    for role, role_messages in messages_by_role.items():
        print(f"\n----- Messages from {role} -----")
        for i, message in enumerate(role_messages, 1):
            timestamp = format_timestamp(message.get("timestamp", 0))
            content = message.get("content", "")
            print(f"\n{i}. [{timestamp}]")
            print(f"{content}")
    
    print("\n===== END OF RESPONSES =====")

if __name__ == "__main__":
    main() 