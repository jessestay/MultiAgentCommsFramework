"""
Role Automation System

This package provides the core functionality for the AI role management system,
including role switching, message routing, and automated communications.
"""

__version__ = '0.1.0'
__author__ = 'Jesse Stay'

# Import core components
from role_automation.security_manager import SecurityManager
from role_automation.storage_manager import StorageManager
from role_automation.message_router import MessageRouter
from role_automation.trigger_system import TriggerSystem
from role_automation.wordpress_integration import WordPressIntegration

# Define package exports
__all__ = [
    'SecurityManager',
    'StorageManager',
    'MessageRouter',
    'TriggerSystem',
    'WordPressIntegration'
] 