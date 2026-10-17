#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import json
from pathlib import Path

def list_triggers():
    """List all triggers in the system."""
    print("Listing all triggers in the system...")
    
    # Assuming triggers are stored in a triggers directory
    triggers_dir = Path("triggers")
    if not triggers_dir.exists():
        print("Triggers directory not found.")
        return
    
    # List all trigger files
    trigger_files = list(triggers_dir.glob("*.json"))
    if not trigger_files:
        print("No trigger files found.")
    else:
        print(f"Found {len(trigger_files)} trigger(s):")
        for file in trigger_files:
            try:
                with open(file, 'r') as f:
                    data = json.load(f)
                    # Print the entire JSON for debugging
                    print(f"File: {file}")
                    print(json.dumps(data, indent=2))
                    print()
                    
                    # Now extract and display specific fields
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

if __name__ == "__main__":
    list_triggers() 