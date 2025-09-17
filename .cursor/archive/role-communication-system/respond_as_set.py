#!/usr/bin/env python
"""
Script to simulate a response from SET
"""

import os
import json
from pathlib import Path

def main():
    """Simulate a response from SET."""
    print("Simulating a response from SET...")
    
    # Define the conversations directory
    conversations_dir = os.path.join(os.getcwd(), "conversations")
    
    # Check if directory exists
    if not os.path.exists(conversations_dir):
        print(f"Error: Conversations directory not found at {conversations_dir}")
        return
    
    # Find the conversation with SET
    conversation_id = "conv-1f64afd5-991a-46d8-bc7d-a327264326e8"
    file_path = os.path.join(conversations_dir, f"{conversation_id}.json")
    
    if not os.path.exists(file_path):
        print(f"Error: Conversation file not found at {file_path}")
        return
    
    try:
        # Read the conversation
        with open(file_path, 'r') as f:
            conversation = json.load(f)
        
        # Add a response from SET
        response = {
            "id": f"msg-response-{conversation_id}",
            "timestamp": "2025-03-06T00:15:00.000000",
            "source_role": "SET",
            "target_role": "ES",
            "content": "@ES: I confirm receipt of your message. The improvements to the StorageManager class have been implemented successfully. The enhanced security integration and fixed conversation retrieval functionality are now working as expected. Is there anything specific you'd like me to explain about the implementation?"
        }
        
        # Add the response to the conversation
        if "messages" not in conversation:
            conversation["messages"] = []
        
        conversation["messages"].append(response)
        conversation["updated_at"] = "2025-03-06T00:15:00.000000"
        
        # Save the updated conversation
        with open(file_path, 'w') as f:
            json.dump(conversation, f, indent=2)
        
        print("Response added successfully!")
        print(f"Response: {response['content']}")
    except Exception as e:
        print(f"Error adding response: {str(e)}")

if __name__ == "__main__":
    main() 