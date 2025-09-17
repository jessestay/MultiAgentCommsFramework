#!/usr/bin/env python
"""
Role Communication Example Script

This script enables direct communication between AI roles without requiring user intervention.
It supports sending messages, creating and viewing conversations, and setting up scheduled communications.
"""

import os
import sys
import json
import argparse
import datetime
import schedule
import time
import threading
from pathlib import Path

from role_automation.security_manager import SecurityManager
from role_automation.storage_manager import StorageManager
from role_automation.message_router import MessageRouter
from role_automation.trigger_system import TriggerSystem
from src.role_manager import role_manager

def initialize_system():
    """Initialize the system components."""
    print("Initializing system components...")
    
    # Initialize security manager
    security_manager = SecurityManager()
    
    # Initialize storage manager
    storage_manager = StorageManager(security_manager)
    
    # Initialize message router
    message_router = MessageRouter(security_manager, storage_manager)
    
    # Initialize trigger system
    trigger_system = TriggerSystem(message_router)
    
    return {
        "security_manager": security_manager,
        "storage_manager": storage_manager,
        "message_router": message_router,
        "trigger_system": trigger_system
    }

def send_formatted_message(components, source_role, target_role, content):
    """Send a properly formatted message between roles."""
    # Format the message according to the protocol
    if target_role:
        message_text = f"[{source_role}]: @{target_role}: {content}"
    else:
        message_text = f"[{source_role}]: {content}"
    
    # Route the message
    message_router = components["message_router"]
    result = message_router.route_message(message_text)
    
    return result

def display_conversation(components, conversation_id):
    """Display a conversation in a formatted way."""
    message_router = components["message_router"]
    
    # Get all roles from the system
    security_manager = components["security_manager"]
    roles = security_manager._load_role_definitions().get("roles", {}).keys()
    
    # Try to access the conversation with each role
    for role in roles:
        conversation = message_router.get_conversation_messages(conversation_id, role)
        if conversation:
            formatted_conversation = message_router.format_conversation_for_display(conversation)
            print(f"\nConversation (viewed as {role}):")
            print(formatted_conversation)
            return conversation
    
    print(f"No role has access to conversation: {conversation_id}")
    return None

def list_conversations(components, role=None):
    """List all conversations, optionally filtered by role."""
    storage_manager = components["storage_manager"]
    message_router = components["message_router"]
    
    # Get filter criteria
    filter_criteria = {}
    if role:
        filter_criteria = {
            "metadata": {
                "roles": role
            }
        }
    
    # Get conversations
    conversations = storage_manager.list_conversations(filter_criteria)
    
    if not conversations:
        print("No conversations found.")
        return
    
    print(f"\nFound {len(conversations)} conversations:")
    for i, conv in enumerate(conversations):
        conv_id = conv.get("id", "UNKNOWN")
        created_at = conv.get("created_at", "UNKNOWN")
        roles = conv.get("metadata", {}).get("roles", [])
        message_count = len(conv.get("messages", []))
        
        print(f"{i+1}. ID: {conv_id}")
        print(f"   Created: {created_at}")
        print(f"   Roles: {', '.join(roles)}")
        print(f"   Messages: {message_count}")
        print()
    
    return conversations

def archive_conversation(components, conversation_id, archive_dir="conversation_archives"):
    """Archive a conversation to a file."""
    # Create archive directory if it doesn't exist
    os.makedirs(archive_dir, exist_ok=True)
    
    # Get the conversation
    conversation = display_conversation(components, conversation_id)
    if not conversation:
        return False
    
    # Create archive filename
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_file = os.path.join(archive_dir, f"conversation_{conversation_id}_{timestamp}.json")
    
    # Save the conversation to the archive file
    try:
        with open(archive_file, 'w') as f:
            json.dump(conversation, f, indent=2)
        print(f"Conversation archived to: {archive_file}")
        return True
    except Exception as e:
        print(f"Error archiving conversation: {e}")
        return False

def create_example_conversation(components):
    """Create an example conversation between roles."""
    print("\nCreating example conversation...")
    
    # Send messages between roles
    result1 = send_formatted_message(
        components, 
        "ES",  # Executive Secretary
        "MD",  # Marketing Director
        "Please prepare the sales copy for our Premium Signed Book Offer."
    )
    
    if result1["success"]:
        conversation_id = result1["conversation_id"]
        print(f"Created conversation: {conversation_id}")
        
        # Add a response
        result2 = send_formatted_message(
            components,
            "MD",  # Marketing Director
            "ES",  # Executive Secretary
            "I'll have the sales copy ready by tomorrow. What specific points should I emphasize?"
        )
        
        if result2["success"]:
            # Add another message
            result3 = send_formatted_message(
                components,
                "ES",  # Executive Secretary
                "MD",  # Marketing Director
                "Please emphasize the limited availability and personalized nature of the signed copies."
            )
            
            if result3["success"]:
                # Display the conversation
                display_conversation(components, conversation_id)
                return conversation_id
    
    print("Failed to create example conversation.")
    return None

def create_scheduled_trigger(components, trigger_id, source_role, target_role, message_template, schedule_type, schedule_value):
    """Create a scheduled trigger for automated communication."""
    print(f"\nCreating scheduled trigger: {trigger_id}...")
    
    trigger_system = components["trigger_system"]
    
    # Create the trigger
    result = trigger_system.add_scheduled_trigger(
        trigger_id,
        source_role,
        target_role,
        message_template,
        schedule_type,
        schedule_value
    )
    
    if result:
        print(f"Created scheduled trigger: {trigger_id}")
        print(f"This trigger will send a message from {source_role} to {target_role} according to schedule: {schedule_type} {schedule_value}")
        return True
    else:
        print(f"Failed to create scheduled trigger: {trigger_id}")
        return False

def run_trigger_system(components, daemon=False):
    """Run the trigger system to process scheduled communications."""
    trigger_system = components["trigger_system"]
    
    # Start the trigger system
    result = trigger_system.start()
    
    if result:
        print("Trigger system started successfully.")
        
        if daemon:
            print("Running in daemon mode. Press Ctrl+C to stop.")
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                print("Stopping trigger system...")
                trigger_system.stop()
                print("Trigger system stopped.")
        else:
            # Run pending triggers once
            print("Running pending triggers...")
            import schedule
            schedule.run_pending()
            print("Completed running pending triggers.")
            
            # Stop the trigger system
            trigger_system.stop()
    else:
        print("Failed to start trigger system.")

def es_message_handler(message):
    print(f"ES received: {message['content']}")
    # Handle executive secretary tasks
    pass

def set_message_handler(message):
    print(f"SET received: {message['content']}")
    # Handle software engineering tasks
    pass

# Register message handlers
role_manager.register_role("ES", es_message_handler)
role_manager.register_role("SET", set_message_handler)

# Example: ES delegating task to SET
role_manager.send_message(
    source_role="ES",
    target_role="SET",
    content="Please implement the storage manager component"
)

# Example: SET responding to ES
role_manager.send_message(
    source_role="SET",
    target_role="ES",
    content="Storage manager implementation complete, ready for review"
)

# Process messages for each role
role_manager.process_messages("ES")
role_manager.process_messages("SET")

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="AI Role Communication System")
    
    # Command groups
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Send message command
    send_parser = subparsers.add_parser("send", help="Send a message between roles")
    send_parser.add_argument("--source", "-s", required=True, help="Source role abbreviation")
    send_parser.add_argument("--target", "-t", help="Target role abbreviation")
    send_parser.add_argument("--message", "-m", required=True, help="Message content")
    
    # List conversations command
    list_parser = subparsers.add_parser("list", help="List conversations")
    list_parser.add_argument("--role", "-r", help="Filter by role abbreviation")
    
    # View conversation command
    view_parser = subparsers.add_parser("view", help="View a conversation")
    view_parser.add_argument("conversation_id", help="Conversation ID to view")
    
    # Archive conversation command
    archive_parser = subparsers.add_parser("archive", help="Archive a conversation")
    archive_parser.add_argument("conversation_id", help="Conversation ID to archive")
    archive_parser.add_argument("--dir", "-d", default="conversation_archives", help="Archive directory")
    
    # Create trigger command
    trigger_parser = subparsers.add_parser("create-trigger", help="Create a scheduled trigger")
    trigger_parser.add_argument("--id", required=True, help="Trigger ID")
    trigger_parser.add_argument("--source", "-s", required=True, help="Source role abbreviation")
    trigger_parser.add_argument("--target", "-t", required=True, help="Target role abbreviation")
    trigger_parser.add_argument("--message", "-m", required=True, help="Message template")
    trigger_parser.add_argument("--schedule", required=True, choices=["daily", "weekly", "monthly", "interval"], help="Schedule type")
    trigger_parser.add_argument("--value", required=True, help="Schedule value (time for daily, day+time for weekly/monthly, minutes for interval)")
    
    # Run triggers command
    run_parser = subparsers.add_parser("run-triggers", help="Run the trigger system")
    run_parser.add_argument("--daemon", "-d", action="store_true", help="Run in daemon mode")
    
    # Example command
    example_parser = subparsers.add_parser("example", help="Create an example conversation")
    
    # Parse arguments
    args = parser.parse_args()
    
    # Initialize system
    components = initialize_system()
    
    # Execute command
    if args.command == "send":
        result = send_formatted_message(components, args.source, args.target, args.message)
        if result["success"]:
            print(f"Message sent successfully. Conversation ID: {result['conversation_id']}")
            display_conversation(components, result["conversation_id"])
        else:
            print(f"Failed to send message: {result.get('error', 'Unknown error')}")
    
    elif args.command == "list":
        list_conversations(components, args.role)
    
    elif args.command == "view":
        display_conversation(components, args.conversation_id)
    
    elif args.command == "archive":
        archive_conversation(components, args.conversation_id, args.dir)
    
    elif args.command == "create-trigger":
        create_scheduled_trigger(components, args.id, args.source, args.target, args.message, args.schedule, args.value)
    
    elif args.command == "run-triggers":
        run_trigger_system(components, args.daemon)
    
    elif args.command == "example":
        create_example_conversation(components)
    
    else:
        parser.print_help()

if __name__ == "__main__":
    main() 