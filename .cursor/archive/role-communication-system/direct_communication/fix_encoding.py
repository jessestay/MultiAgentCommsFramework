#!/usr/bin/env python
"""
Script to fix encoding issues in message queues.
This script reads all message queues and history files, fixes any encoding issues,
and saves them back with proper UTF-8 encoding.
"""

import os
import json
import codecs
import logging
from utils import ensure_directory_exists

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("logs/fix_encoding.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("FixEncoding")

def fix_utf16_content(content):
    """
    Fix UTF-16 encoded content.
    
    Args:
        content (str): The content to fix
        
    Returns:
        str: The fixed content
    """
    # Check if content contains UTF-16 BOM and escape sequences
    if "\u00ff\u00fe" in content:
        # This is a UTF-16 encoded string that was improperly decoded
        # Extract the actual UTF-16 bytes and decode them properly
        try:
            # Extract the raw bytes from the string
            raw_bytes = b""
            i = 0
            while i < len(content):
                if content[i:i+2] == "\u00ff\u00fe":
                    i += 2  # Skip BOM
                    continue
                
                if i + 6 <= len(content) and content[i:i+2] == "\u0000":
                    # This is a UTF-16 escape sequence like \u0000
                    char_code = int(content[i+2:i+6], 16)
                    raw_bytes += bytes([char_code])
                    i += 6
                else:
                    # Regular character
                    raw_bytes += content[i].encode('utf-8')
                    i += 1
            
            # Decode the raw bytes as UTF-8
            return raw_bytes.decode('utf-8')
        except Exception as e:
            logger.error(f"Error fixing UTF-16 content: {e}")
            return content
    
    return content

def fix_message_content(message):
    """
    Fix the content of a message.
    
    Args:
        message (dict): The message to fix
        
    Returns:
        dict: The fixed message
    """
    if "content" in message and isinstance(message["content"], str):
        message["content"] = fix_utf16_content(message["content"])
    return message

def fix_file(file_path):
    """
    Fix encoding issues in a file.
    
    Args:
        file_path (str): Path to the file to fix
        
    Returns:
        bool: True if the file was fixed, False otherwise
    """
    if not os.path.exists(file_path):
        logger.warning(f"File not found: {file_path}")
        return False
    
    try:
        # Try to read the file with different encodings
        content = None
        
        # Try UTF-8 first
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            # Try UTF-16
            try:
                with open(file_path, 'r', encoding='utf-16') as f:
                    content = f.read()
            except UnicodeDecodeError:
                # Fall back to binary read
                with open(file_path, 'rb') as f:
                    raw_content = f.read()
                    # Try to detect BOM
                    if raw_content.startswith(codecs.BOM_UTF8):
                        content = raw_content.decode('utf-8-sig')
                    elif raw_content.startswith(codecs.BOM_UTF16_LE):
                        content = raw_content.decode('utf-16-le')
                    elif raw_content.startswith(codecs.BOM_UTF16_BE):
                        content = raw_content.decode('utf-16-be')
                    else:
                        # Last resort - try latin-1 which should not fail
                        content = raw_content.decode('latin-1')
        
        if content is None:
            logger.error(f"Could not read file: {file_path}")
            return False
        
        # Parse JSON
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing JSON in {file_path}: {e}")
            return False
        
        # Fix message content
        if isinstance(data, list):
            for i, item in enumerate(data):
                if isinstance(item, dict):
                    data[i] = fix_message_content(item)
        elif isinstance(data, dict):
            data = fix_message_content(data)
        
        # Save back with proper UTF-8 encoding
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Fixed encoding in file: {file_path}")
        return True
    
    except Exception as e:
        logger.error(f"Error fixing file {file_path}: {e}")
        return False

def main():
    """Main entry point for the script."""
    base_dir = "."
    queues_dir = os.path.join(base_dir, "queues")
    history_dir = os.path.join(base_dir, "history")
    logs_dir = os.path.join(base_dir, "logs")
    
    # Ensure directories exist
    ensure_directory_exists(queues_dir)
    ensure_directory_exists(history_dir)
    ensure_directory_exists(logs_dir)
    
    # Fix queue files
    queue_files = [os.path.join(queues_dir, f) for f in os.listdir(queues_dir) if f.endswith('.json')]
    for file_path in queue_files:
        fix_file(file_path)
    
    # Fix history files
    if os.path.exists(history_dir):
        history_files = [os.path.join(history_dir, f) for f in os.listdir(history_dir) if f.endswith('.json')]
        for file_path in history_files:
            fix_file(file_path)
    
    logger.info("Encoding fix completed")

if __name__ == "__main__":
    main() 