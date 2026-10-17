#!/usr/bin/env python
"""
Script to clear a role's message queue and archive existing messages.
This is useful for starting fresh after fixing encoding issues.
"""

import os
import sys
import argparse
import json
from datetime import datetime

# Add the parent directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from direct_communication.channel import DirectCommunicationChannel
from direct_communication.utils import write_file_content, ensure_directory_exists

def main():
    """Clear a role's message queue and archive existing messages."""
    parser = argparse.ArgumentParser(description="Clear a role's message queue")
    parser.add_argument("role", help="The role whose queue to clear (e.g., ES, SET)")
    parser.add_argument("--no-archive", action="store_true", help="Don't archive messages before clearing")
    parser.add_argument("--force", action="store_true", help="Force clear the queue by directly writing an empty array")
    args = parser.parse_args()
    
    # Create a channel instance
    channel = DirectCommunicationChannel()
    
    # Get the queue path
    queue_path = channel._get_queue_path(args.role)
    
    # Get messages for the specified role
    messages = channel.get_queue(args.role)
    
    if not messages:
        print(f"No messages found in the {args.role} queue. Nothing to clear.")
        return
    
    print(f"Found {len(messages)} messages in the {args.role} queue.")
    
    # Archive messages if requested
    if not args.no_archive:
        # Create archive filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        archive_dir = os.path.join(channel.base_dir, "archives")
        ensure_directory_exists(archive_dir)
        archive_file = os.path.join(archive_dir, f"{args.role}_queue_{timestamp}.json")
        
        # Write messages to archive
        write_file_content(archive_file, json.dumps(messages, indent=2))
        print(f"Archived {len(messages)} messages to {archive_file}")
    
    # Clear the queue
    if args.force:
        # Directly write an empty array to the file
        write_file_content(queue_path, "[]")
        print(f"Force cleared the {args.role} queue.")
    else:
        # Use the channel's save_queue method
        channel.save_queue(args.role, [])
        print(f"Cleared the {args.role} queue.")

if __name__ == "__main__":
    main() 