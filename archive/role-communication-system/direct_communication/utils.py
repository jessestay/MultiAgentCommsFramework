import json
import os
import uuid
from datetime import datetime
import codecs

def ensure_directory_exists(directory_path):
    """Ensure that the specified directory exists."""
    if not os.path.exists(directory_path):
        os.makedirs(directory_path)

def read_file_content(file_path):
    """Read file content with encoding detection."""
    # Try UTF-8 first
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except UnicodeDecodeError:
        # Try UTF-16
        try:
            with open(file_path, 'r', encoding='utf-16') as f:
                return f.read()
        except UnicodeDecodeError:
            # Fall back to binary read and decode
            with open(file_path, 'rb') as f:
                content = f.read()
                # Try to detect BOM
                if content.startswith(codecs.BOM_UTF8):
                    return content.decode('utf-8-sig')
                elif content.startswith(codecs.BOM_UTF16_LE):
                    return content.decode('utf-16-le')
                elif content.startswith(codecs.BOM_UTF16_BE):
                    return content.decode('utf-16-be')
                else:
                    # Last resort - try latin-1 which should not fail
                    return content.decode('latin-1')

def write_file_content(file_path, content, encoding='utf-8'):
    """Write content to a file with specified encoding."""
    with open(file_path, 'w', encoding=encoding) as f:
        f.write(content)

def format_message(source_role, target_role, content, metadata=None):
    """Format a message for the direct communication system."""
    if metadata is None:
        metadata = {}
    
    return {
        "id": str(uuid.uuid4()),
        "source_role": source_role,
        "target_role": target_role,
        "content": content,
        "metadata": metadata,
        "timestamp": datetime.now().isoformat(),
        "read": False
    }

def load_queue(queue_path):
    """Load a message queue from a file."""
    if not os.path.exists(queue_path):
        return []
    
    try:
        with open(queue_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, UnicodeDecodeError):
        # If there's an error, return an empty queue
        return []

def save_queue(queue_path, queue):
    """Save a message queue to a file."""
    ensure_directory_exists(os.path.dirname(queue_path))
    with open(queue_path, 'w', encoding='utf-8') as f:
        json.dump(queue, f, indent=2)

def get_role_abbreviation(role_name):
    """Convert a full role name to its abbreviation."""
    # Map of full role names to abbreviations
    role_map = {
        "Executive Secretary": "ES",
        "Software Engineering Team": "SET",
        "Marketing Director": "MD",
        "Business Income Coach": "BIC",
        "Copy Technical Writer": "CTW",
        "Dating Relationship Coach": "DRC",
        "Debt Consumer Law Coach": "DCLC",
        "Social Media Manager": "SMM",
        "Utah Family Lawyer": "UFL"
    }
    
    # Check if the input is already an abbreviation
    if role_name in role_map.values():
        return role_name
    
    # Return the abbreviation if found, otherwise return the original name
    return role_map.get(role_name, role_name)

def get_full_role_name(abbreviation):
    """Convert a role abbreviation to its full name."""
    # Map of abbreviations to full role names
    role_map = {
        "ES": "Executive Secretary",
        "SET": "Software Engineering Team",
        "MD": "Marketing Director",
        "BIC": "Business Income Coach",
        "CTW": "Copy Technical Writer",
        "DRC": "Dating Relationship Coach",
        "DCLC": "Debt Consumer Law Coach",
        "SMM": "Social Media Manager",
        "UFL": "Utah Family Lawyer"
    }
    
    # Return the full name if found, otherwise return the original abbreviation
    return role_map.get(abbreviation, abbreviation) 