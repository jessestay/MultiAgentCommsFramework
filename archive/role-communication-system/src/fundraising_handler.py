#!/usr/bin/env python3
"""
Specialized handler for fundraising messages.
Ensures proper routing and responses for messages about raising funds.
"""

import sys
import time
import logging
import re
from typing import Dict, Any, List
import json

from role_communication import RoleCommunicationManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("fundraising_handler.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("FundraisingHandler")

class FundraisingHandler:
    """
    Specialized handler for fundraising messages.
    """
    
    def __init__(self, base_dir: str = "conversations"):
        """
        Initialize the fundraising handler.
        
        Args:
            base_dir: Base directory for message queues
        """
        self.manager = RoleCommunicationManager(base_dir)
        self.fundraising_roles = ["ES", "SET", "BIC", "MD"]
        
        # Register all roles
        for role in self.fundraising_roles:
            self.manager.register_role(role)
            
            # Register response handlers
            for source_role in self.fundraising_roles:
                if source_role != role:
                    self.manager.register_response_handler(
                        role, source_role, self.generate_fundraising_response
                    )
        
        logger.info("FundraisingHandler initialized")
    
    def generate_fundraising_response(self, message: Dict[str, Any]) -> str:
        """
        Generate a response to a fundraising message.
        
        Args:
            message: Message object
            
        Returns:
            Response content
        """
        content = message.get("content", "")
        source_role = message.get("source_role", "Unknown")
        target_role = message.get("target_role", "Unknown")
        
        # Extract amount if present
        amount_match = re.search(r'\$(\d+(?:,\d+)*(?:\.\d+)?)', content)
        amount = amount_match.group(1) if amount_match else "unknown amount"
        
        # Generate appropriate response based on role
        if target_role == "ES":
            return f"Executive Secretary acknowledges fundraising request for ${amount}. I will coordinate with all teams."
        
        elif target_role == "SET":
            return f"Software Engineering Team can implement a donation tracking system to help raise ${amount}. We'll prioritize this immediately."
        
        elif target_role == "BIC":
            return f"Business Income Coach can create a fundraising strategy to reach the ${amount} goal. I'll prepare a plan with multiple revenue streams."
        
        elif target_role == "MD":
            return f"Marketing Director will create promotional materials for the ${amount} fundraising campaign. I'll focus on digital and social media channels."
        
        else:
            return f"Acknowledged your message about raising ${amount}. I'll contribute to this effort."
    
    def send_fundraising_broadcast(self, source_role: str, amount: float, deadline: str) -> List[str]:
        """
        Send fundraising messages to all relevant roles.
        
        Args:
            source_role: Source role identifier
            amount: Fundraising amount
            deadline: Deadline for fundraising
            
        Returns:
            List of message IDs
        """
        message_ids = []
        
        # Format message
        message = f"URGENT: We need to raise ${amount:,.2f} by {deadline}. Please respond with your plan to contribute to this goal."
        
        # Send to all roles except source
        for role in self.fundraising_roles:
            if role != source_role:
                message_id = self.manager.send_urgent_message(source_role, role, message)
                if message_id:
                    message_ids.append(message_id)
                    logger.info(f"Sent fundraising message to {role}: {message_id}")
                else:
                    logger.error(f"Failed to send fundraising message to {role}")
        
        return message_ids
    
    def check_fundraising_responses(self, source_role: str) -> List[Dict[str, Any]]:
        """
        Check responses to fundraising messages.
        
        Args:
            source_role: Source role identifier
            
        Returns:
            List of response messages
        """
        # Get all messages for source role
        inbox_dir = self.manager.processors[source_role].inbox_dir
        if not inbox_dir.exists():
            logger.warning(f"No inbox directory for {source_role}")
            return []
        
        responses = []
        for msg_file in inbox_dir.glob("*.json"):
            try:
                with open(msg_file, 'r') as f:
                    message = json.load(f)
                
                # Check if this is a response to a fundraising message
                content = message.get("content", "").lower()
                if (any(term in content for term in ["fundrais", "donation", "money", "fund", "$"]) and
                    message.get("source_role") in self.fundraising_roles):
                    responses.append(message)
            except Exception as e:
                logger.error(f"Error reading message file {msg_file}: {e}")
        
        return responses
    
    def start_monitoring(self, interval: float = 5.0):
        """
        Start monitoring message queues.
        
        Args:
            interval: Check interval in seconds
        """
        self.manager.start_monitoring(interval)
        logger.info(f"Started monitoring with interval: {interval}s")
    
    def stop_monitoring(self):
        """Stop monitoring message queues."""
        self.manager.stop_monitoring()
        logger.info("Stopped monitoring")


def main():
    """Main entry point for the fundraising handler."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Fundraising Message Handler")
    parser.add_argument("--base-dir", default="conversations", 
                        help="Base directory for message queues")
    
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Broadcast command
    broadcast_parser = subparsers.add_parser("broadcast", 
                                           help="Broadcast fundraising message")
    broadcast_parser.add_argument("source", help="Source role identifier")
    broadcast_parser.add_argument("amount", type=float, help="Fundraising amount")
    broadcast_parser.add_argument("deadline", help="Deadline for fundraising")
    
    # Check responses command
    check_parser = subparsers.add_parser("check-responses", 
                                       help="Check fundraising responses")
    check_parser.add_argument("source", help="Source role identifier")
    
    # Monitor command
    monitor_parser = subparsers.add_parser("monitor", help="Monitor messages")
    monitor_parser.add_argument("--interval", type=float, default=5.0, 
                              help="Check interval in seconds")
    
    args = parser.parse_args()
    
    handler = FundraisingHandler(args.base_dir)
    
    if args.command == "broadcast":
        message_ids = handler.send_fundraising_broadcast(
            args.source, args.amount, args.deadline
        )
        
        if message_ids:
            print(f"Sent {len(message_ids)} fundraising messages")
            print("Message IDs:", ", ".join(message_ids))
        else:
            print("Failed to send fundraising messages")
            sys.exit(1)
    
    elif args.command == "check-responses":
        responses = handler.check_fundraising_responses(args.source)
        
        if not responses:
            print(f"No fundraising responses for {args.source}")
            return
        
        print(f"Fundraising responses for {args.source}:")
        for i, response in enumerate(responses, 1):
            source = response.get("source_role", "Unknown")
            timestamp = response.get("timestamp", 0)
            time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(timestamp))
            content = response.get("content", "")
            
            print(f"\n{i}. From: {source} | {time_str}")
            print(f"   {content}")
    
    elif args.command == "monitor":
        print(f"Starting fundraising monitor with interval: {args.interval}s")
        print("Press Ctrl+C to stop")
        
        handler.start_monitoring(args.interval)
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nStopping monitor...")
            handler.stop_monitoring()
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main() 