"""
Command-line interface for the AI Role Communication Automation System.
"""

import os
import sys
import argparse
import json
import datetime
from typing import Dict, List, Any, Optional

from role_automation.security_manager import SecurityManager
from role_automation.storage_manager import StorageManager
from role_automation.message_router import MessageRouter
from role_automation.trigger_system import TriggerSystem
from role_automation.wordpress_integration import WordPressIntegration

def init_components():
    """Initialize system components."""
    security_manager = SecurityManager()
    storage_manager = StorageManager(security_manager)
    message_router = MessageRouter(security_manager, storage_manager)
    trigger_system = TriggerSystem(message_router)
    
    return {
        "security_manager": security_manager,
        "storage_manager": storage_manager,
        "message_router": message_router,
        "trigger_system": trigger_system
    }

def send_message(args):
    """Send a message between roles."""
    components = init_components()
    message_router = components["message_router"]
    
    # Format message
    if args.target_role:
        message_text = f"[{args.source_role}]: @{args.target_role}: {args.content}"
    else:
        message_text = f"[{args.source_role}]: {args.content}"
    
    # Add metadata if provided
    metadata = {}
    if args.metadata:
        try:
            metadata = json.loads(args.metadata)
        except json.JSONDecodeError:
            print("Error: Metadata must be valid JSON")
            return 1
    
    # Route message
    result = message_router.route_message(
        message_text,
        conversation_id=args.conversation_id,
        metadata=metadata
    )
    
    # Print result
    print(json.dumps(result, indent=2))
    
    return 0 if result.get("success") else 1

def list_conversations(args):
    """List conversations."""
    components = init_components()
    storage_manager = components["storage_manager"]
    
    # Parse filter criteria
    filter_criteria = {}
    if args.filter:
        try:
            filter_criteria = json.loads(args.filter)
        except json.JSONDecodeError:
            print("Error: Filter must be valid JSON")
            return 1
    
    # List conversations
    conversations = storage_manager.list_conversations(filter_criteria)
    
    # Print conversations
    print(json.dumps(conversations, indent=2))
    
    return 0

def get_conversation(args):
    """Get a conversation by ID."""
    components = init_components()
    message_router = components["message_router"]
    storage_manager = components["storage_manager"]
    
    # Get conversation
    conversation = storage_manager.get_conversation(args.conversation_id)
    
    if not conversation:
        print(f"Error: Conversation not found: {args.conversation_id}")
        return 1
    
    # Format conversation if requested
    if args.format:
        formatted = message_router.format_conversation_for_display(conversation)
        print(formatted)
    else:
        print(json.dumps(conversation, indent=2))
    
    return 0

def add_trigger(args):
    """Add a trigger."""
    components = init_components()
    trigger_system = components["trigger_system"]
    
    # Generate trigger ID if not provided
    trigger_id = args.trigger_id or f"trigger_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    # Parse metadata if provided
    metadata = {}
    if args.metadata:
        try:
            metadata = json.loads(args.metadata)
        except json.JSONDecodeError:
            print("Error: Metadata must be valid JSON")
            return 1
    
    # Add trigger based on type
    if args.trigger_type == "scheduled":
        if not args.schedule_type or not args.schedule_value:
            print("Error: Schedule type and value are required for scheduled triggers")
            return 1
        
        result = trigger_system.add_scheduled_trigger(
            trigger_id,
            args.source_role,
            args.target_role,
            args.message_template,
            args.schedule_type,
            args.schedule_value,
            metadata
        )
    elif args.trigger_type == "event":
        if not args.event_type:
            print("Error: Event type is required for event triggers")
            return 1
        
        # Parse conditions if provided
        conditions = {}
        if args.conditions:
            try:
                conditions = json.loads(args.conditions)
            except json.JSONDecodeError:
                print("Error: Conditions must be valid JSON")
                return 1
        
        result = trigger_system.add_event_trigger(
            trigger_id,
            args.event_type,
            args.source_role,
            args.target_role,
            args.message_template,
            conditions,
            metadata
        )
    elif args.trigger_type == "condition":
        if not args.condition_check:
            print("Error: Condition check is required for condition triggers")
            return 1
        
        result = trigger_system.add_condition_trigger(
            trigger_id,
            args.source_role,
            args.target_role,
            args.message_template,
            args.condition_check,
            args.check_interval or 60,
            metadata
        )
    else:
        print(f"Error: Unknown trigger type: {args.trigger_type}")
        return 1
    
    if result:
        print(f"Trigger added successfully: {trigger_id}")
        return 0
    else:
        print("Error adding trigger")
        return 1

def remove_trigger(args):
    """Remove a trigger."""
    components = init_components()
    trigger_system = components["trigger_system"]
    
    result = trigger_system.remove_trigger(args.trigger_id)
    
    if result:
        print(f"Trigger removed successfully: {args.trigger_id}")
        return 0
    else:
        print(f"Error removing trigger: {args.trigger_id}")
        return 1

def start_trigger_system(args):
    """Start the trigger system."""
    components = init_components()
    trigger_system = components["trigger_system"]
    
    result = trigger_system.start()
    
    if result:
        print("Trigger system started successfully")
        
        # Keep running if requested
        if args.daemon:
            print("Running in daemon mode. Press Ctrl+C to stop.")
            try:
                # Keep the main thread alive
                import time
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                print("Stopping trigger system...")
                trigger_system.stop()
                print("Trigger system stopped")
        
        return 0
    else:
        print("Error starting trigger system")
        return 1

def stop_trigger_system(args):
    """Stop the trigger system."""
    components = init_components()
    trigger_system = components["trigger_system"]
    
    result = trigger_system.stop()
    
    if result:
        print("Trigger system stopped successfully")
        return 0
    else:
        print("Error stopping trigger system")
        return 1

def fire_event(args):
    """Fire an event."""
    components = init_components()
    trigger_system = components["trigger_system"]
    
    # Parse event data if provided
    event_data = {}
    if args.event_data:
        try:
            event_data = json.loads(args.event_data)
        except json.JSONDecodeError:
            print("Error: Event data must be valid JSON")
            return 1
    
    # Start trigger system if not running
    if not trigger_system.running:
        trigger_system.start()
    
    # Fire event
    fired_count = trigger_system.fire_event(args.event_type, event_data)
    
    print(f"Fired {fired_count} triggers for event: {args.event_type}")
    
    # Stop trigger system if it was started by this command
    if not trigger_system.running:
        trigger_system.stop()
    
    return 0

def main():
    """Main entry point for the CLI."""
    parser = argparse.ArgumentParser(description="AI Role Communication Automation System")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Send message command
    send_parser = subparsers.add_parser("send", help="Send a message between roles")
    send_parser.add_argument("--source-role", "-s", required=True, help="Source role identifier")
    send_parser.add_argument("--target-role", "-t", help="Target role identifier")
    send_parser.add_argument("--content", "-c", required=True, help="Message content")
    send_parser.add_argument("--conversation-id", help="Existing conversation ID")
    send_parser.add_argument("--metadata", help="Additional metadata as JSON")
    send_parser.set_defaults(func=send_message)
    
    # List conversations command
    list_parser = subparsers.add_parser("list", help="List conversations")
    list_parser.add_argument("--filter", "-f", help="Filter criteria as JSON")
    list_parser.set_defaults(func=list_conversations)
    
    # Get conversation command
    get_parser = subparsers.add_parser("get", help="Get a conversation by ID")
    get_parser.add_argument("conversation_id", help="Conversation ID")
    get_parser.add_argument("--format", "-f", action="store_true", help="Format conversation for display")
    get_parser.set_defaults(func=get_conversation)
    
    # Add trigger command
    add_trigger_parser = subparsers.add_parser("add-trigger", help="Add a trigger")
    add_trigger_parser.add_argument("--trigger-id", help="Trigger ID (generated if not provided)")
    add_trigger_parser.add_argument("--trigger-type", "-t", required=True, choices=["scheduled", "event", "condition"], help="Trigger type")
    add_trigger_parser.add_argument("--source-role", "-s", required=True, help="Source role identifier")
    add_trigger_parser.add_argument("--target-role", "-r", required=True, help="Target role identifier")
    add_trigger_parser.add_argument("--message-template", "-m", required=True, help="Message template")
    add_trigger_parser.add_argument("--schedule-type", choices=["daily", "weekly", "monthly", "interval"], help="Schedule type for scheduled triggers")
    add_trigger_parser.add_argument("--schedule-value", help="Schedule value for scheduled triggers")
    add_trigger_parser.add_argument("--event-type", help="Event type for event triggers")
    add_trigger_parser.add_argument("--conditions", help="Conditions for event triggers as JSON")
    add_trigger_parser.add_argument("--condition-check", help="Condition check code for condition triggers")
    add_trigger_parser.add_argument("--check-interval", type=int, help="Check interval in seconds for condition triggers")
    add_trigger_parser.add_argument("--metadata", help="Additional metadata as JSON")
    add_trigger_parser.set_defaults(func=add_trigger)
    
    # Remove trigger command
    remove_trigger_parser = subparsers.add_parser("remove-trigger", help="Remove a trigger")
    remove_trigger_parser.add_argument("trigger_id", help="Trigger ID")
    remove_trigger_parser.set_defaults(func=remove_trigger)
    
    # Start trigger system command
    start_parser = subparsers.add_parser("start", help="Start the trigger system")
    start_parser.add_argument("--daemon", "-d", action="store_true", help="Run in daemon mode")
    start_parser.set_defaults(func=start_trigger_system)
    
    # Stop trigger system command
    stop_parser = subparsers.add_parser("stop", help="Stop the trigger system")
    stop_parser.set_defaults(func=stop_trigger_system)
    
    # Fire event command
    fire_parser = subparsers.add_parser("fire", help="Fire an event")
    fire_parser.add_argument("event_type", help="Event type")
    fire_parser.add_argument("--event-data", "-d", help="Event data as JSON")
    fire_parser.set_defaults(func=fire_event)
    
    # Parse arguments
    args = parser.parse_args()
    
    # Run command
    if hasattr(args, "func"):
        return args.func(args)
    else:
        parser.print_help()
        return 0

if __name__ == "__main__":
    sys.exit(main()) 