#!/usr/bin/env python3
"""
Demonstration of the role communication system.
"""

import time
import threading
import os
import sys
import logging
from pathlib import Path
import json
import shutil

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from src.role_communication import RoleCommunicationManager

# Configure logging
logging.basicConfig(
    level=logging.WARNING,  # Only show warnings and errors
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("Demo")

def es_handler(message):
    """Executive Secretary message handler."""
    content = message.get("content", "")
    source = message.get("source_role", "Unknown")
    
    print(f"\n[ES] Received message from {source}: {content}")
    
    if source == "SET":
        return f"Thank you for your response, SET. I'll update the project status."
    else:
        return f"Executive Secretary acknowledges: {content}"

def set_handler(message):
    """Software Engineering Team message handler."""
    content = message.get("content", "")
    source = message.get("source_role", "Unknown")
    
    print(f"\n[SET] Received message from {source}: {content}")
    
    if source == "ES":
        return f"We'll implement the requested feature: {content}"
    else:
        return f"Software Engineering Team acknowledges: {content}"

def run_demo():
    """Run a demonstration of the role communication system."""
    try:
        # Clean up previous conversations
        if os.path.exists("conversations"):
            try:
                shutil.rmtree("conversations")
            except PermissionError:
                logger.warning("Permission error when removing conversations directory. Using a timestamped directory instead.")
                # Use a timestamped directory instead
                base_dir = f"conversations_{int(time.time())}"
            except Exception as e:
                logger.warning(f"Error removing conversations directory: {e}. Using a timestamped directory instead.")
                base_dir = f"conversations_{int(time.time())}"
        else:
            base_dir = "conversations"
            
        # Create directories
        os.makedirs(os.path.join(base_dir, "ES"), exist_ok=True)
        os.makedirs(os.path.join(base_dir, "SET"), exist_ok=True)
        
        # Create role communication manager
        manager = RoleCommunicationManager(base_dir=base_dir)
        
        # Register roles and message handlers
        manager.register_role("ES", es_handler)
        manager.register_role("SET", set_handler)
        
        # Start monitoring for messages
        manager.start_monitoring(interval=1.0)
        
        print("\n===== STARTING ROLE COMMUNICATION DEMONSTRATION =====")
        print(f"Using directory: {base_dir}")
        
        # Simulate a conversation
        print("\n1. ES sends a message to SET")
        message_id = manager.send_message("ES", "SET", "Hello SET, can you help me with a technical task?")
        if message_id:
            print(f"   Message sent successfully with ID: {message_id}")
        else:
            print("   Failed to send message")
        
        # Wait for processing
        time.sleep(2)
        
        print("\n2. SET responds to ES")
        message_id = manager.send_message("SET", "ES", "Hello ES, I'd be happy to help with your technical task. What do you need?")
        if message_id:
            print(f"   Message sent successfully with ID: {message_id}")
        else:
            print("   Failed to send message")
        
        # Wait for processing
        time.sleep(2)
        
        print("\n3. ES sends another message to SET")
        message_id = manager.send_message("ES", "SET", "I need help implementing a new feature for message routing.")
        if message_id:
            print(f"   Message sent successfully with ID: {message_id}")
        else:
            print("   Failed to send message")
        
        # Wait for processing
        time.sleep(2)
        
        print("\n4. SET responds to ES again")
        message_id = manager.send_message("SET", "ES", "I'll start working on the message routing feature right away.")
        if message_id:
            print(f"   Message sent successfully with ID: {message_id}")
        else:
            print("   Failed to send message")
        
        # Wait for processing
        time.sleep(2)
        
        # Display all messages in the ES directory
        print("\n===== MESSAGES IN ES DIRECTORY =====")
        es_messages = []
        es_dir = os.path.join(base_dir, "ES")
        for filename in os.listdir(es_dir):
            if filename.endswith(".json"):
                with open(os.path.join(es_dir, filename), "r") as f:
                    message = json.load(f)
                    es_messages.append(message)
        
        # Sort by timestamp
        es_messages.sort(key=lambda m: m.get("timestamp", 0))
        
        for i, message in enumerate(es_messages, 1):
            source = message.get("source_role", "Unknown")
            content = message.get("content", "")
            print(f"{i}. From {source}: {content}")
        
        # Display all messages in the SET directory
        print("\n===== MESSAGES IN SET DIRECTORY =====")
        set_messages = []
        set_dir = os.path.join(base_dir, "SET")
        for filename in os.listdir(set_dir):
            if filename.endswith(".json"):
                with open(os.path.join(set_dir, filename), "r") as f:
                    message = json.load(f)
                    set_messages.append(message)
        
        # Sort by timestamp
        set_messages.sort(key=lambda m: m.get("timestamp", 0))
        
        for i, message in enumerate(set_messages, 1):
            source = message.get("source_role", "Unknown")
            content = message.get("content", "")
            print(f"{i}. From {source}: {content}")
        
        print("\n===== DEMONSTRATION COMPLETED SUCCESSFULLY =====")
        
    except Exception as e:
        logger.error(f"Error in demonstration: {e}")
    finally:
        # Stop monitoring
        manager.stop_monitoring()

if __name__ == "__main__":
    run_demo() 