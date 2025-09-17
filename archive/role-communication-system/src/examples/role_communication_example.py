#!/usr/bin/env python
"""
Role Communication Example

This script demonstrates how to use the role communication system.
"""

import sys
import os
import time
import logging
from typing import Dict, Any

# Add parent directory to path to import role_manager
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from role_manager import role_manager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def es_message_handler(message: Dict[str, Any]):
    """Example message handler for Executive Secretary."""
    logger.info(f"ES received message: {message['content']}")
    
    # Example of ES responding to a message
    if message.get('source_role') == 'SET':
        role_manager.send_message(
            source_role="ES",
            target_role="SET",
            content="Thank you for the update. I'll coordinate with other roles."
        )

def set_message_handler(message: Dict[str, Any]):
    """Example message handler for Software Engineering Team."""
    logger.info(f"SET received message: {message['content']}")
    
    # Example of SET responding to a message
    if message.get('source_role') == 'ES':
        role_manager.send_message(
            source_role="SET",
            target_role="ES",
            content="Acknowledged. Working on the implementation."
        )

def main():
    """Run the example communication scenario."""
    # Register message handlers
    role_manager.register_role("ES", es_message_handler)
    role_manager.register_role("SET", set_message_handler)
    
    # Example: ES initiates communication with SET
    logger.info("Starting example communication...")
    
    role_manager.send_message(
        source_role="ES",
        target_role="SET",
        content="Please implement the new role communication features."
    )
    
    # Wait a bit for processing
    time.sleep(1)
    
    # Process messages for both roles
    role_manager.process_messages("SET")
    role_manager.process_messages("ES")
    
    logger.info("Example communication completed.")

if __name__ == "__main__":
    main() 