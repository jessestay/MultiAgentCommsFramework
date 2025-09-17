#!/usr/bin/env python
"""
Installation and setup script for the AI Role Communication Automation System.

This script:
1. Checks for required dependencies
2. Creates necessary directories
3. Initializes the system
4. Starts the trigger system
"""

import os
import sys
import subprocess
import argparse

def check_dependencies():
    """Check if required dependencies are installed."""
    try:
        import yaml
        import cryptography
        import schedule
    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("Installing dependencies...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("Dependencies installed successfully.")

def create_directories():
    """Create necessary directories."""
    directories = ["config", "conversations", "backups"]
    for directory in directories:
        os.makedirs(directory, exist_ok=True)
    print("Directories created successfully.")

def initialize_system():
    """Initialize the system components."""
    from role_automation.security_manager import SecurityManager
    from role_automation.storage_manager import StorageManager
    from role_automation.message_router import MessageRouter
    from role_automation.trigger_system import TriggerSystem
    
    print("Initializing security manager...")
    security_manager = SecurityManager()
    
    print("Initializing storage manager...")
    storage_manager = StorageManager(security_manager)
    
    print("Initializing message router...")
    message_router = MessageRouter(security_manager, storage_manager)
    
    print("Initializing trigger system...")
    trigger_system = TriggerSystem(message_router)
    
    return {
        "security_manager": security_manager,
        "storage_manager": storage_manager,
        "message_router": message_router,
        "trigger_system": trigger_system
    }

def start_trigger_system(components, daemon=False):
    """Start the trigger system."""
    trigger_system = components["trigger_system"]
    
    print("Starting trigger system...")
    result = trigger_system.start()
    
    if result:
        print("Trigger system started successfully.")
        
        if daemon:
            print("Running in daemon mode. Press Ctrl+C to stop.")
            try:
                import time
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                print("Stopping trigger system...")
                trigger_system.stop()
                print("Trigger system stopped.")
    else:
        print("Failed to start trigger system.")

def create_example_trigger(components):
    """Create an example trigger."""
    trigger_system = components["trigger_system"]
    
    print("Creating example daily report trigger...")
    result = trigger_system.add_scheduled_trigger(
        "daily_report",
        "ES",
        "BIC",
        "Daily report for {date}",
        "daily",
        "09:00"
    )
    
    if result:
        print("Example trigger created successfully.")
    else:
        print("Failed to create example trigger.")

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Install and run the AI Role Communication Automation System")
    parser.add_argument("--daemon", "-d", action="store_true", help="Run in daemon mode")
    parser.add_argument("--example", "-e", action="store_true", help="Create example trigger")
    args = parser.parse_args()
    
    print("Setting up AI Role Communication Automation System...")
    
    # Check dependencies
    check_dependencies()
    
    # Create directories
    create_directories()
    
    # Initialize system
    components = initialize_system()
    
    # Create example trigger if requested
    if args.example:
        create_example_trigger(components)
    
    # Start trigger system
    start_trigger_system(components, daemon=args.daemon)
    
    print("Setup complete.")

if __name__ == "__main__":
    main() 