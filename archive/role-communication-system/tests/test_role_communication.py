#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Unit tests for role communication protocol compliance.

This module tests that all role communications follow the established syntax and conventions.
"""

import os
import re
import json
import unittest
import logging
from pathlib import Path
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/test_communication.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger('test_role_communication')

class TestRoleCommunicationProtocol(unittest.TestCase):
    """Test that role communications follow the established protocol."""
    
    def setUp(self):
        """Set up test environment."""
        # Create logs directory if it doesn't exist
        os.makedirs('logs', exist_ok=True)
        
        # Define the conversations directory
        self.conversations_dir = os.path.join(os.getcwd(), "conversations")
        
        # Create regex patterns for validation
        self.role_header_pattern = re.compile(r'^\[([A-Z]{2,5})\]:\s*(.*)', re.DOTALL)
        self.target_role_pattern = re.compile(r'^@([A-Z]{2,5}):\s*(.*)', re.DOTALL)
        
        # Define valid role abbreviations
        self.valid_roles = {
            "ES", "BIC", "MD", "SMM", "CTW", "UFL", "DLC", "SE", "DRC", "SET"
        }
        
        logger.info("Test setup complete")
    
    def test_conversations_directory_exists(self):
        """Test that the conversations directory exists."""
        logger.info("Testing conversations directory exists")
        self.assertTrue(os.path.exists(self.conversations_dir), 
                        "Conversations directory does not exist")
    
    def test_conversation_files_exist(self):
        """Test that conversation files exist in the conversations directory."""
        logger.info("Testing conversation files exist")
        conversation_files = list(Path(self.conversations_dir).glob("*.json"))
        self.assertGreater(len(conversation_files), 0, 
                          "No conversation files found in the conversations directory")
        logger.info(f"Found {len(conversation_files)} conversation files")
    
    def test_conversation_format(self):
        """Test that conversations follow the correct format."""
        logger.info("Testing conversation format")
        conversation_files = list(Path(self.conversations_dir).glob("*.json"))
        
        for file_path in conversation_files:
            logger.info(f"Testing file: {file_path}")
            with open(file_path, 'r') as f:
                try:
                    conversation = json.load(f)
                    
                    # Check that the conversation has required fields
                    self.assertIn("id", conversation, 
                                 f"Conversation {file_path} has no ID")
                    self.assertIn("created_at", conversation, 
                                 f"Conversation {file_path} has no creation timestamp")
                    self.assertIn("metadata", conversation, 
                                 f"Conversation {file_path} has no metadata")
                    self.assertIn("messages", conversation, 
                                 f"Conversation {file_path} has no messages")
                    
                    # Check metadata
                    self.assertIn("roles", conversation["metadata"], 
                                 f"Conversation {file_path} metadata has no roles")
                    
                    # Check each message
                    for message in conversation["messages"]:
                        self._validate_message(message, file_path)
                        
                except json.JSONDecodeError:
                    self.fail(f"Conversation file {file_path} is not valid JSON")
    
    def _validate_message(self, message, file_path):
        """Validate a single message in a conversation."""
        # Check that the message has required fields
        self.assertIn("id", message, 
                     f"Message in {file_path} has no ID")
        self.assertIn("timestamp", message, 
                     f"Message in {file_path} has no timestamp")
        self.assertIn("source_role", message, 
                     f"Message in {file_path} has no source_role")
        self.assertIn("content", message, 
                     f"Message in {file_path} has no content")
        
        # Check that the source role is valid
        source_role = message["source_role"]
        self.assertIn(source_role, self.valid_roles, 
                     f"Invalid source role {source_role} in {file_path}")
        
        # Check target role if present
        if "target_role" in message and message["target_role"]:
            target_role = message["target_role"]
            self.assertIn(target_role, self.valid_roles, 
                         f"Invalid target role {target_role} in {file_path}")
        
        # Check message content format
        content = message["content"]
        
        # If this is a message with a target role, check that it follows the format
        if "target_role" in message and message["target_role"]:
            target_match = self.target_role_pattern.match(content)
            self.assertIsNotNone(target_match, 
                               f"Message to {message['target_role']} does not follow format '@TARGET_ROLE: content' in {file_path}")
            
            # Check that the target role in the content matches the target_role field
            if target_match:
                content_target_role = target_match.group(1)
                self.assertEqual(content_target_role, message["target_role"], 
                               f"Target role mismatch in {file_path}: {content_target_role} vs {message['target_role']}")
    
    def test_timestamp_format(self):
        """Test that timestamps are in the correct format."""
        logger.info("Testing timestamp format")
        conversation_files = list(Path(self.conversations_dir).glob("*.json"))
        
        for file_path in conversation_files:
            with open(file_path, 'r') as f:
                try:
                    conversation = json.load(f)
                    
                    # Check conversation creation timestamp
                    self._validate_timestamp(conversation["created_at"], f"Conversation {file_path} creation timestamp")
                    
                    # Check each message timestamp
                    for message in conversation["messages"]:
                        self._validate_timestamp(message["timestamp"], f"Message {message['id']} in {file_path}")
                        
                except json.JSONDecodeError:
                    self.fail(f"Conversation file {file_path} is not valid JSON")
    
    def _validate_timestamp(self, timestamp, context):
        """Validate that a timestamp is in ISO 8601 format."""
        try:
            # Try to parse the timestamp
            datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        except ValueError:
            self.fail(f"{context} has invalid timestamp format: {timestamp}")
    
    def test_role_abbreviations(self):
        """Test that all role abbreviations are valid."""
        logger.info("Testing role abbreviations")
        conversation_files = list(Path(self.conversations_dir).glob("*.json"))
        
        for file_path in conversation_files:
            with open(file_path, 'r') as f:
                try:
                    conversation = json.load(f)
                    
                    # Check roles in metadata
                    for role in conversation["metadata"]["roles"]:
                        self.assertIn(role, self.valid_roles, 
                                     f"Invalid role {role} in metadata of {file_path}")
                    
                    # Check roles in messages
                    for message in conversation["messages"]:
                        self.assertIn(message["source_role"], self.valid_roles, 
                                     f"Invalid source role {message['source_role']} in {file_path}")
                        
                        if "target_role" in message and message["target_role"]:
                            self.assertIn(message["target_role"], self.valid_roles, 
                                         f"Invalid target role {message['target_role']} in {file_path}")
                        
                except json.JSONDecodeError:
                    self.fail(f"Conversation file {file_path} is not valid JSON")

def run_tests():
    """Run the tests."""
    logger.info("Starting role communication protocol tests")
    unittest.main()

if __name__ == "__main__":
    run_tests() 