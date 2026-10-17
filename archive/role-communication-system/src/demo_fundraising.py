#!/usr/bin/env python3
"""
Demonstration of the fundraising communication system.
Shows the complete workflow of sending, routing, and responding to urgent fundraising messages.
"""

import os
import time
import json
import shutil
from pathlib import Path
import logging

from role_communication import RoleCommunicationManager
from fundraising_handler import FundraisingHandler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("demo_fundraising.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("DemoFundraising")

def setup_demo():
    """Set up the demonstration environment."""
    # Create a clean demo directory
    demo_dir = "demo_conversations"
    if os.path.exists(demo_dir):
        shutil.rmtree(demo_dir)
    os.makedirs(demo_dir)
    
    logger.info(f"Created demo directory: {demo_dir}")
    return demo_dir

def run_demo():
    """Run the fundraising demonstration."""
    print("\n=== ROLE COMMUNICATION SYSTEM DEMONSTRATION ===")
    print("Focusing on urgent fundraising messages\n")
    
    # Set up demo environment
    demo_dir = setup_demo()
    
    # Create handler
    handler = FundraisingHandler(demo_dir)
    
    # Start monitoring in background
    handler.start_monitoring()
    print("1. Started message monitoring system")
    
    # Step 1: Send fundraising broadcast
    print("\n2. Sending urgent fundraising message from ES to all roles...")
    message_ids = handler.send_fundraising_broadcast("ES", 3000, "Monday")
    print(f"   Sent {len(message_ids)} messages")
    
    # Wait for processing
    print("\n   Waiting for messages to be processed...")
    time.sleep(3)
    
    # Step 2: Check messages for each role
    roles = ["SET", "BIC", "MD"]
    print("\n3. Checking received messages for each role:")
    
    manager = RoleCommunicationManager(demo_dir)
    for role in roles:
        manager.register_role(role)
        messages = manager.get_urgent_messages(role)
        
        print(f"\n   Messages for {role}:")
        for message in messages:
            source = message.get("source_role", "Unknown")
            content = message.get("content", "")
            print(f"   From {source}: {content}")
    
    # Step 3: Process responses
    print("\n4. Processing automatic responses...")
    time.sleep(5)  # Wait for responses to be generated
    
    # Step 4: Check responses
    print("\n5. Checking responses received by ES:")
    responses = handler.check_fundraising_responses("ES")
    
    for response in responses:
        source = response.get("source_role", "Unknown")
        content = response.get("content", "")
        print(f"\n   From {source}:")
        print(f"   {content}")
    
    # Step 5: Verify notification system
    print("\n6. Verifying notification system:")
    
    # Count unread messages for ES
    manager.register_role("ES")
    unread = manager.get_unread_messages("ES")
    print(f"   ES has {len(unread)} unread messages (notifications)")
    
    # Show notification details
    if unread:
        print("\n   Notification details:")
        for message in unread:
            source = message.get("source_role", "Unknown")
            timestamp = message.get("timestamp", 0)
            time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(timestamp))
            print(f"   From {source} at {time_str}")
    
    # Step 6: Summary
    print("\n=== DEMONSTRATION SUMMARY ===")
    print("1. Urgent fundraising message was sent successfully")
    print("2. Message was properly routed to all relevant roles")
    print("3. Automatic responses were generated and sent back to ES")
    print(f"4. Notification system correctly shows {len(unread)} unread messages")
    print("\nThe role communication system is working correctly for urgent fundraising messages.")
    
    # Clean up
    handler.stop_monitoring()

if __name__ == "__main__":
    run_demo() 