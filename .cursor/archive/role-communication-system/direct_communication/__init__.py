"""
Direct Communication System for AI Roles

This package provides a simple file-based communication system for direct
role-to-role communication without requiring messages to pass through the user.
"""

from .channel import DirectCommunicationChannel
from .client import DirectCommunicationClient
from .utils import (
    read_file_content,
    write_file_content,
    format_message,
    get_role_abbreviation,
    get_full_role_name
)

__version__ = "0.1.0"
__all__ = [
    "DirectCommunicationChannel",
    "DirectCommunicationClient",
    "read_file_content",
    "write_file_content",
    "format_message",
    "get_role_abbreviation",
    "get_full_role_name"
] 