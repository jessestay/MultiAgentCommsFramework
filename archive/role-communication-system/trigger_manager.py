#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import json
import argparse
from pathlib import Path
from datetime import datetime

class TriggerManager:
    """Manage scheduled triggers for role communication."""
    
    def __init__(self):
        """Initialize the trigger manager."""
        self.triggers_dir = Path("triggers")
        print(f"Triggers directory: {self.triggers_dir} (exists: {self.triggers_dir.exists()})")
        if not self.triggers_dir.exists():
            print("Creating triggers directory...")
            self.triggers_dir.mkdir(exist_ok=True)
    
    def list_triggers(self):
        """List all triggers in the system."""
        print("Listing all triggers in the system...")
        print(f"Looking in directory: {self.triggers_dir.absolute()}")
        
        if not self.triggers_dir.exists():
            print("Triggers directory does not exist!")
            return
        
        trigger_files = list(self.triggers_dir.glob("*.json"))
        print(f"Found {len(trigger_files)} trigger files: {[str(f) for f in trigger_files]}")
        
        if not trigger_files:
            print("No triggers found.")
            return
        
        print(f"Found {len(trigger_files)} trigger(s):")
        for file in trigger_files:
            try:
                print(f"Reading file: {file}")
                with open(file, 'r') as f:
                    data = json.load(f)
                    
                    print(f"Trigger ID: {data.get('id', file.stem)}")
                    print(f"  Type: {data.get('type', 'N/A')}")
                    print(f"  Source Role: {data.get('source_role', 'N/A')}")
                    print(f"  Target Role: {data.get('target_role', 'N/A')}")
                    print(f"  Message: {data.get('message_template', 'N/A')}")
                    
                    # Handle schedule which might be nested
                    schedule = data.get('schedule', {})
                    if isinstance(schedule, dict):
                        schedule_type = schedule.get('type', 'N/A')
                        schedule_value = schedule.get('value', 'N/A')
                        print(f"  Schedule: {schedule_type} {schedule_value}")
                    else:
                        print(f"  Schedule: {schedule}")
                    
                    print(f"  Active: {data.get('active', 'N/A')}")
                    print(f"  Created At: {data.get('created_at', 'N/A')}")
                    print(f"  Last Executed: {data.get('last_executed', 'Never')}")
                    print()
            except Exception as e:
                print(f"Error reading {file}: {e}")
    
    def create_trigger(self, trigger_id, source_role, target_role, message, schedule_type, schedule_value):
        """Create a new trigger."""
        trigger_file = self.triggers_dir / f"{trigger_id}.json"
        
        if trigger_file.exists():
            print(f"Trigger with ID '{trigger_id}' already exists.")
            return False
        
        trigger_data = {
            "id": trigger_id,
            "type": "scheduled",
            "source_role": source_role,
            "target_role": target_role,
            "message_template": message,
            "schedule": {
                "type": schedule_type,
                "value": schedule_value
            },
            "active": True,
            "created_at": datetime.now().isoformat(),
            "last_executed": None
        }
        
        try:
            with open(trigger_file, 'w') as f:
                json.dump(trigger_data, f, indent=2)
            print(f"Created scheduled trigger: {trigger_id}")
            print(f"This trigger will send a message from {source_role} to {target_role} according to schedule: {schedule_type} {schedule_value}")
            return True
        except Exception as e:
            print(f"Error creating trigger: {e}")
            return False
    
    def delete_trigger(self, trigger_id):
        """Delete a trigger."""
        trigger_file = self.triggers_dir / f"{trigger_id}.json"
        
        if not trigger_file.exists():
            print(f"Trigger with ID '{trigger_id}' not found.")
            return False
        
        try:
            trigger_file.unlink()
            print(f"Deleted trigger: {trigger_id}")
            return True
        except Exception as e:
            print(f"Error deleting trigger: {e}")
            return False
    
    def toggle_trigger(self, trigger_id, active=None):
        """Toggle a trigger's active status."""
        trigger_file = self.triggers_dir / f"{trigger_id}.json"
        
        if not trigger_file.exists():
            print(f"Trigger with ID '{trigger_id}' not found.")
            return False
        
        try:
            with open(trigger_file, 'r') as f:
                data = json.load(f)
            
            # Toggle or set to specified value
            if active is None:
                data['active'] = not data['active']
            else:
                data['active'] = active
            
            with open(trigger_file, 'w') as f:
                json.dump(data, f, indent=2)
            
            status = "activated" if data['active'] else "deactivated"
            print(f"Trigger {trigger_id} {status}.")
            return True
        except Exception as e:
            print(f"Error toggling trigger: {e}")
            return False

def main():
    """Main entry point for the trigger manager."""
    parser = argparse.ArgumentParser(description="Manage scheduled triggers for role communication")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # List command
    list_parser = subparsers.add_parser("list", help="List all triggers")
    
    # Create command
    create_parser = subparsers.add_parser("create", help="Create a new trigger")
    create_parser.add_argument("--id", required=True, help="Trigger ID")
    create_parser.add_argument("--source", "-s", required=True, help="Source role abbreviation")
    create_parser.add_argument("--target", "-t", required=True, help="Target role abbreviation")
    create_parser.add_argument("--message", "-m", required=True, help="Message template")
    create_parser.add_argument("--schedule", required=True, choices=["daily", "weekly", "monthly", "interval"], help="Schedule type")
    create_parser.add_argument("--value", required=True, help="Schedule value (time for daily, day+time for weekly/monthly, minutes for interval)")
    
    # Delete command
    delete_parser = subparsers.add_parser("delete", help="Delete a trigger")
    delete_parser.add_argument("--id", required=True, help="Trigger ID to delete")
    
    # Toggle command
    toggle_parser = subparsers.add_parser("toggle", help="Toggle a trigger's active status")
    toggle_parser.add_argument("--id", required=True, help="Trigger ID to toggle")
    toggle_parser.add_argument("--active", type=bool, help="Set active status (True/False)")
    
    args = parser.parse_args()
    
    manager = TriggerManager()
    
    if args.command == "list":
        manager.list_triggers()
    elif args.command == "create":
        manager.create_trigger(args.id, args.source, args.target, args.message, args.schedule, args.value)
    elif args.command == "delete":
        manager.delete_trigger(args.id)
    elif args.command == "toggle":
        manager.toggle_trigger(args.id, args.active)
    else:
        parser.print_help()

if __name__ == "__main__":
    main() 