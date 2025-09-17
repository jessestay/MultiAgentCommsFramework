#!/usr/bin/env python3
"""
Command-line interface for role-based communication.

This module provides a command-line interface for interacting with the role-based
communication system. It allows users to send messages, read messages, and monitor
message queues for different roles.
"""

import argparse
import json
import time
from pathlib import Path
import os
import sys
import configparser
from typing import Dict, Any, Optional

from role_communication import RoleCommunicationManager

def load_config(config_path: str = "config.ini") -> Dict[str, Any]:
    """
    Load configuration from a config file.
    
    Args:
        config_path: Path to the configuration file
        
    Returns:
        Dictionary containing configuration values
    """
    config = configparser.ConfigParser()
    
    # Default configuration
    default_config = {
        "base_dir": "conversations",
        "check_interval": "5.0",
        "log_level": "INFO",
        "encryption_enabled": "false",
        "encryption_key": "",
    }
    
    # Create default config if it doesn't exist
    if not os.path.exists(config_path):
        config["DEFAULT"] = default_config
        with open(config_path, 'w') as f:
            config.write(f)
        return default_config
    
    # Load existing config
    config.read(config_path)
    
    # Convert to dictionary
    if "DEFAULT" in config:
        return dict(config["DEFAULT"])
    else:
        return default_config

def send_message(manager: RoleCommunicationManager, args: argparse.Namespace) -> None:
    """
    Send a message from one role to another.
    
    Args:
        manager: Role communication manager
        args: Command line arguments
    """
    manager.register_role(args.source)
    message_id = manager.send_message(args.source, args.target, args.message, args.urgent)
    if message_id:
        print(f"Message sent successfully. ID: {message_id}{' (urgent)' if args.urgent else ''}")
    else:
        print("Failed to send message")
        sys.exit(1)

def read_messages(manager: RoleCommunicationManager, args: argparse.Namespace, 
                  base_dir: str) -> None:
    """
    Read messages for a specific role.
    
    Args:
        manager: Role communication manager
        args: Command line arguments
        base_dir: Base directory for message queues
    """
    manager.register_role(args.role)
    
    if args.urgent:
        # Read urgent messages
        messages = manager.get_urgent_messages(args.role, include_read=args.all)
        message_type = "urgent"
    else:
        # Read regular messages
        if args.all:
            # Read all messages
            inbox_dir = Path(base_dir) / args.role
            if not inbox_dir.exists():
                print(f"No messages for {args.role}")
                return
            
            messages = []
            for msg_file in inbox_dir.glob("*.json"):
                try:
                    with open(msg_file, 'r') as f:
                        message = json.load(f)
                        messages.append(message)
                except Exception as e:
                    print(f"Error reading message file {msg_file}: {e}")
            
            # Sort by timestamp
            messages.sort(key=lambda m: m.get("timestamp", 0))
        else:
            # Read only unread messages
            messages = manager.get_unread_messages(args.role)
        
        message_type = ""
    
    if not messages:
        print(f"No {message_type + ' ' if message_type else ''}{'unread ' if not args.all else ''}messages for {args.role}")
        return
    
    print(f"{message_type.capitalize() + ' ' if message_type else ''}{'Unread ' if not args.all else ''}Messages for {args.role}:")
    for i, message in enumerate(messages, 1):
        source = message.get("source_role", "Unknown")
        timestamp = message.get("timestamp", 0)
        time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(timestamp))
        content = message.get("content", "")
        read = "Read" if message.get("read", False) else "Unread"
        urgent = "URGENT" if message.get("urgent", False) else ""
        
        print(f"\n{i}. From: {source} | {time_str} | {read} {urgent}")
        print(f"   {content}")
        
        # Mark as read if unread
        if not message.get("read", False):
            message_id = message.get("id")
            if message_id:
                message_path = Path(base_dir) / args.role / f"{message_id}.json"
                if message_path.exists():
                    try:
                        with open(message_path, 'r') as f:
                            msg_data = json.load(f)
                        
                        msg_data["read"] = True
                        msg_data["read_timestamp"] = time.time()
                        
                        with open(message_path, 'w') as f:
                            json.dump(msg_data, f, indent=2)
                    except Exception as e:
                        print(f"Error marking message {message_id} as read: {e}")

def monitor_messages(manager: RoleCommunicationManager, args: argparse.Namespace) -> None:
    """
    Monitor message queues for all roles.
    
    Args:
        manager: Role communication manager
        args: Command line arguments
    """
    print(f"Starting message monitor with interval: {args.interval}s")
    print("Press Ctrl+C to stop")
    
    # Register common roles
    for role in ["ES", "SET", "MD", "SMM", "CTW", "UFL", "DLC", "DRC", "BIC"]:
        manager.register_role(role)
    
    # Start monitoring
    manager.start_monitoring(args.interval)
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping monitor...")
        manager.stop_monitoring()

def main():
    """
    Main entry point for the CLI application.
    """
    # Load configuration
    config = load_config()
    
    parser = argparse.ArgumentParser(description="Role Communication CLI")
    parser.add_argument("--base-dir", default=config.get("base_dir", "conversations"), 
                        help="Base directory for message queues")
    parser.add_argument("--config", default="config.ini", 
                        help="Path to configuration file")
    
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Send message command
    send_parser = subparsers.add_parser("send", help="Send a message")
    send_parser.add_argument("source", help="Source role identifier")
    send_parser.add_argument("target", help="Target role identifier")
    send_parser.add_argument("message", help="Message content")
    send_parser.add_argument("--urgent", action="store_true", help="Mark as urgent")
    
    # Send urgent message command
    urgent_parser = subparsers.add_parser("send-urgent", help="Send an urgent message")
    urgent_parser.add_argument("source", help="Source role identifier")
    urgent_parser.add_argument("target", help="Target role identifier")
    urgent_parser.add_argument("message", help="Message content")
    
    # Read messages command
    read_parser = subparsers.add_parser("read", help="Read messages")
    read_parser.add_argument("role", help="Role identifier")
    read_parser.add_argument("--all", action="store_true", 
                            help="Read all messages, not just unread")
    read_parser.add_argument("--urgent", action="store_true",
                            help="Read only urgent messages")
    
    # Check urgent responses command
    check_urgent_parser = subparsers.add_parser("check-urgent-responses", 
                                              help="Check responses to urgent messages")
    check_urgent_parser.add_argument("role", help="Role identifier")
    
    # Monitor command
    monitor_parser = subparsers.add_parser("monitor", help="Monitor messages")
    monitor_parser.add_argument("--interval", type=float, 
                               default=float(config.get("check_interval", "5.0")), 
                               help="Check interval in seconds")
    
    args = parser.parse_args()
    
    # Create manager with encryption if enabled
    encryption_enabled = config.get("encryption_enabled", "false").lower() == "true"
    encryption_key = config.get("encryption_key", "") if encryption_enabled else None
    
    manager = RoleCommunicationManager(
        args.base_dir, 
        encryption_enabled=encryption_enabled,
        encryption_key=encryption_key
    )
    
    if args.command == "send":
        send_message(manager, args)
    elif args.command == "read":
        read_messages(manager, args, args.base_dir)
    elif args.command == "check-urgent-responses":
        manager.register_role(args.role)
        
        # Get all messages
        inbox_dir = Path(args.base_dir) / args.role
        if not inbox_dir.exists():
            print(f"No messages for {args.role}")
            return
        
        # Find all sent urgent messages
        sent_urgent_messages = []
        for role_dir in Path(args.base_dir).glob("*"):
            if not role_dir.is_dir() or role_dir.name == args.role:
                continue
            
            for msg_file in role_dir.glob("*.json"):
                try:
                    with open(msg_file, 'r') as f:
                        message = json.load(f)
                    
                    if (message.get("source_role") == args.role and 
                        message.get("urgent", False)):
                        sent_urgent_messages.append(message)
                except Exception as e:
                    print(f"Error reading message file {msg_file}: {e}")
        
        if not sent_urgent_messages:
            print(f"No urgent messages sent by {args.role}")
            return
        
        # Find responses to urgent messages
        responses = []
        for msg_file in inbox_dir.glob("*.json"):
            try:
                with open(msg_file, 'r') as f:
                    message = json.load(f)
                
                in_reply_to = message.get("in_reply_to")
                if in_reply_to:
                    # Check if this is a response to an urgent message
                    for urgent_msg in sent_urgent_messages:
                        if urgent_msg.get("id") == in_reply_to:
                            responses.append((urgent_msg, message))
                            break
            except Exception as e:
                print(f"Error reading message file {msg_file}: {e}")
        
        if not responses:
            print(f"No responses to urgent messages sent by {args.role}")
            return
        
        print(f"Responses to urgent messages sent by {args.role}:")
        for i, (urgent_msg, response) in enumerate(responses, 1):
            target = urgent_msg.get("target_role", "Unknown")
            urgent_content = urgent_msg.get("content", "")
            urgent_time = time.strftime("%Y-%m-%d %H:%M:%S", 
                                      time.localtime(urgent_msg.get("timestamp", 0)))
            
            source = response.get("source_role", "Unknown")
            response_content = response.get("content", "")
            response_time = time.strftime("%Y-%m-%d %H:%M:%S", 
                                        time.localtime(response.get("timestamp", 0)))
            
            print(f"\n{i}. Urgent message to {target} at {urgent_time}:")
            print(f"   {urgent_content}")
            print(f"   Response from {source} at {response_time}:")
            print(f"   {response_content}")
    elif args.command == "monitor":
        monitor_messages(manager, args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main() 