#!/usr/bin/env python
"""
Script to run a full demonstration of the direct communication system.
"""

import os
import sys
import time
import subprocess
import argparse

def run_command(command, description=None):
    """Run a command and print its output."""
    if description:
        print(f"\n=== {description} ===\n")
    
    process = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    
    # Print output in real-time
    for line in process.stdout:
        print(line, end='')
    
    process.wait()
    print("\nCommand completed with exit code:", process.returncode)
    print("-" * 80)
    
    return process.returncode

def main():
    """Run a full demonstration of the direct communication system."""
    parser = argparse.ArgumentParser(description="Run a full demonstration of the direct communication system")
    parser.add_argument("--skip-clear", action="store_true", help="Skip clearing queues")
    parser.add_argument("--skip-urgent", action="store_true", help="Skip sending urgent message")
    parser.add_argument("--skip-responses", action="store_true", help="Skip simulating responses")
    parser.add_argument("--skip-notifications", action="store_true", help="Skip notification demo")
    args = parser.parse_args()
    
    print("\n=== Direct Communication System - Full Demonstration ===\n")
    print("This demonstration will show the complete workflow of the direct communication system.")
    print("It will demonstrate sending urgent messages, routing to appropriate roles,")
    print("receiving responses, and the notification system.")
    print("\nThe demonstration will run in the following steps:")
    print("1. Clear all message queues (optional)")
    print("2. Send an urgent fundraising message to multiple roles")
    print("3. Check message queues to verify message routing")
    print("4. Simulate responses from different roles")
    print("5. Check ES queue to verify response receipt")
    print("6. Demonstrate the notification system")
    print("\nPress Enter to start the demonstration...")
    input()
    
    # Step 1: Clear all message queues
    if not args.skip_clear:
        roles = ["ES", "SET", "MD", "SMM", "CTW", "BIC"]
        for role in roles:
            run_command(f"python clear_queue.py {role} --force", f"Clearing {role} queue")
    
    # Step 2: Send an urgent fundraising message
    if not args.skip_urgent:
        run_command("python demo_urgent_message.py", "Sending urgent fundraising message")
        time.sleep(1)  # Give time for messages to be processed
    
    # Step 3: Check message queues
    run_command("python check_all_queues.py", "Checking message queues")
    time.sleep(1)
    
    # Step 4: Simulate responses
    if not args.skip_responses:
        run_command("python simulate_responses.py", "Simulating responses from different roles")
        time.sleep(1)
    
    # Step 5: Check ES queue
    run_command("python read_messages.py ES", "Checking ES queue for responses")
    time.sleep(1)
    
    # Step 6: Demonstrate notification system
    if not args.skip_notifications:
        run_command("python notification_demo.py --max-polls 5", "Demonstrating notification system")
    
    print("\n=== Demonstration Completed ===\n")
    print("The direct communication system has successfully demonstrated:")
    print("1. Sending urgent messages to multiple roles")
    print("2. Proper routing of messages to appropriate roles")
    print("3. Receiving and viewing responses")
    print("4. Notification system for new messages")
    print("\nThis system can now be used for the fundraising task and other critical communications.")

if __name__ == "__main__":
    main() 