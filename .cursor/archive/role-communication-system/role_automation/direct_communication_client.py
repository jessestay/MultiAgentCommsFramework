#!/usr/bin/env python
"""
Direct Communication Client

This script provides an interactive interface for sending and receiving messages
through the direct communication channel.
"""

import os
import sys
import time
import json
import logging
import threading
from typing import Dict, List, Any

# Add parent directory to path to import role_automation modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from role_automation.direct_communication import DirectCommunicationChannel

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('direct_communication_client.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

class DirectCommunicationClient:
    """
    Interactive client for the direct communication channel.
    
    This class provides:
    - Interactive command-line interface
    - Background polling for new messages
    - Commands for sending and viewing messages
    """
    
    def __init__(self, role: str, base_dir: str = "direct_communication"):
        """
        Initialize the client.
        
        Args:
            role (str): The role this client represents
            base_dir (str): Base directory for message storage
        """
        self.role = role
        self.channel = DirectCommunicationChannel(base_dir)
        self.running = False
        self.poll_thread = None
        
        logger.info(f"Initialized direct communication client for role {role}")
    
    def start_polling(self, interval: int = 2):
        """
        Start polling for new messages in a background thread.
        
        Args:
            interval (int): Polling interval in seconds
        """
        if self.poll_thread and self.poll_thread.is_alive():
            print("Polling already active")
            return
        
        self.running = True
        self.poll_thread = threading.Thread(target=self._poll_messages, args=(interval,))
        self.poll_thread.daemon = True
        self.poll_thread.start()
        
        print(f"Started polling for messages every {interval} seconds")
    
    def stop_polling(self):
        """Stop polling for new messages."""
        if not self.poll_thread or not self.poll_thread.is_alive():
            print("Polling not active")
            return
        
        self.running = False
        self.poll_thread.join(timeout=5)
        
        print("Stopped polling for messages")
    
    def _poll_messages(self, interval: int):
        """
        Poll for new messages in a loop.
        
        Args:
            interval (int): Polling interval in seconds
        """
        while self.running:
            try:
                messages = self.channel.get_unread_messages(self.role)
                
                if messages:
                    print("\n" + "="*50)
                    print(f"You have {len(messages)} new message(s):")
                    
                    for i, message in enumerate(messages):
                        print(f"\nMessage {i+1}:")
                        print(f"From: {message['source_role']}")
                        print(f"Time: {message['timestamp']}")
                        print(f"Content: {message['content']}")
                    
                    print("="*50)
            except Exception as e:
                logger.error(f"Error polling for messages: {e}", exc_info=True)
            
            time.sleep(interval)
    
    def send_message(self, target_role: str, content: str):
        """
        Send a message to another role.
        
        Args:
            target_role (str): The role to send the message to
            content (str): The message content
        """
        try:
            message_id = self.channel.send_message(self.role, target_role, content)
            print(f"Message sent to {target_role} (ID: {message_id})")
            return message_id
        except Exception as e:
            logger.error(f"Error sending message: {e}", exc_info=True)
            print(f"Error sending message: {str(e)}")
            return None
    
    def view_history(self, other_role: str, limit: int = 10):
        """
        View conversation history with another role.
        
        Args:
            other_role (str): The other role in the conversation
            limit (int): Maximum number of messages to display
        """
        try:
            history = self.channel.get_conversation_history(self.role, other_role, limit)
            
            if not history:
                print(f"No conversation history with {other_role}")
                return
            
            print("\n" + "="*50)
            print(f"Conversation history with {other_role} ({len(history)} messages):")
            
            for i, message in enumerate(history):
                print(f"\nMessage {i+1}:")
                print(f"From: {message['source_role']} to {message['target_role']}")
                print(f"Time: {message['timestamp']}")
                print(f"Content: {message['content']}")
            
            print("="*50)
        except Exception as e:
            logger.error(f"Error viewing history: {e}", exc_info=True)
            print(f"Error viewing history: {str(e)}")
    
    def run_interactive(self):
        """Run the interactive client."""
        print(f"Direct Communication Client - Role: {self.role}")
        print("Type 'help' for a list of commands")
        
        # Start polling for messages
        self.start_polling()
        
        try:
            while True:
                command = input("\n> ").strip()
                
                if command.lower() == "exit" or command.lower() == "quit":
                    break
                
                elif command.lower() == "help":
                    self._print_help()
                
                elif command.lower().startswith("send "):
                    # Format: send <role> <message>
                    parts = command[5:].strip().split(" ", 1)
                    if len(parts) < 2:
                        print("Usage: send <role> <message>")
                        continue
                    
                    target_role, message = parts
                    self.send_message(target_role, message)
                
                elif command.lower().startswith("history "):
                    # Format: history <role> [limit]
                    parts = command[8:].strip().split()
                    if not parts:
                        print("Usage: history <role> [limit]")
                        continue
                    
                    other_role = parts[0]
                    limit = int(parts[1]) if len(parts) > 1 else 10
                    self.view_history(other_role, limit)
                
                elif command.lower() == "poll start":
                    self.start_polling()
                
                elif command.lower() == "poll stop":
                    self.stop_polling()
                
                elif command.lower() == "clear":
                    os.system('cls' if os.name == 'nt' else 'clear')
                
                else:
                    print("Unknown command. Type 'help' for a list of commands")
        
        except KeyboardInterrupt:
            print("\nExiting...")
        
        finally:
            # Stop polling before exit
            self.stop_polling()
    
    def _print_help(self):
        """Print help information."""
        print("\nAvailable commands:")
        print("  help                - Show this help message")
        print("  send <role> <msg>   - Send a message to another role")
        print("  history <role> [n]  - View conversation history with another role")
        print("  poll start          - Start polling for new messages")
        print("  poll stop           - Stop polling for new messages")
        print("  clear               - Clear the screen")
        print("  exit                - Exit the client")

def main():
    """Run the direct communication client."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Direct Communication Client")
    parser.add_argument("role", help="Role to use for this client")
    parser.add_argument("--dir", default="direct_communication", help="Base directory for message storage")
    
    args = parser.parse_args()
    
    client = DirectCommunicationClient(args.role, args.dir)
    client.run_interactive()

if __name__ == "__main__":
    main() 