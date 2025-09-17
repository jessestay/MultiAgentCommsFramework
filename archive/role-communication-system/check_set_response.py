#!/usr/bin/env python
"""
Script to check specifically for SET responses
"""

import os
import json
from pathlib import Path

def main():
    """Check for SET responses in conversation files."""
    print("Checking for SET responses...")
    
    # Define the conversations directory
    conversations_dir = os.path.join(os.getcwd(), "conversations")
    
    # Check if directory exists
    if not os.path.exists(conversations_dir):
        print(f"Error: Conversations directory not found at {conversations_dir}")
        return
    
    # Get all conversation files
    conversation_files = list(Path(conversations_dir).glob("*.json"))
    print(f"Found {len(conversation_files)} conversation files")
    
    # Check each file for SET messages
    set_conversations = []
    
    for file_path in conversation_files:
        try:
            with open(file_path, 'r') as f:
                conversation = json.load(f)
            
            # Check if this is a conversation with SET
            if "metadata" in conversation and "roles" in conversation["metadata"]:
                if "SET" in conversation["metadata"]["roles"]:
                    set_conversations.append(conversation)
                    
                    print(f"\nFound conversation with SET: {conversation['id']}")
                    print(f"  Title: {conversation.get('metadata', {}).get('title', 'No title')}")
                    print(f"  Created: {conversation.get('created_at', 'Unknown')}")
                    print(f"  Updated: {conversation.get('updated_at', 'Unknown')}")
                    
                    # Print messages
                    if "messages" in conversation:
                        print(f"  Messages ({len(conversation['messages'])}):")
                        for msg in conversation["messages"]:
                            source = msg.get("source_role", "Unknown")
                            target = msg.get("target_role", "Unknown")
                            content = msg.get("content", "No content")
                            timestamp = msg.get("timestamp", "Unknown time")
                            
                            print(f"    [{timestamp}] [{source}] -> [{target}]: {content}")
                    else:
                        print("  No messages found")
        except Exception as e:
            print(f"Error processing file {file_path}: {str(e)}")
    
    if not set_conversations:
        print("\nNo conversations with SET found")

if __name__ == "__main__":
    main() 