"""
Privacy filter module for PII detection and redaction.

This module handles the detection and redaction of personally identifiable
information (PII) in calendar events and tasks.
"""

import os
import re
from typing import Dict, Any, List, Set, Optional, Union


class PrivacyFilter:
    """
    Handles detection and redaction of PII in calendar events and tasks.
    """

    # PII detection patterns
    PII_PATTERNS = {
        'EMAIL': r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
        'PHONE': r'\b(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b',
        'SSN': r'\b\d{3}-\d{2}-\d{4}\b',
        'CREDIT_CARD': r'\b(?:\d{4}[- ]?){3}\d{4}\b',
        'ADDRESS': r'\b\d+\s+[A-Za-z0-9\s,]+\b(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|court|ct|lane|ln|way|parkway|pkwy)\b',
        'NAME': r'\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b|\b[A-Z][a-z]+\s+[A-Z][a-z]+\b'
    }

    # Detection level configurations
    DETECTION_LEVELS = {
        'low': ['EMAIL', 'PHONE', 'SSN', 'CREDIT_CARD'],
        'medium': ['EMAIL', 'PHONE', 'SSN', 'CREDIT_CARD', 'ADDRESS'],
        'high': ['EMAIL', 'PHONE', 'SSN', 'CREDIT_CARD', 'ADDRESS', 'NAME']
    }

    def __init__(self):
        """
        Initialize the PrivacyFilter instance.
        """
        self.enabled = os.environ.get('PRIVACY_FILTER_ENABLED', 'true').lower() == 'true'
        self.detection_level = os.environ.get('PII_DETECTION_LEVEL', 'medium').lower()
        
        # Compile regex patterns for better performance
        self.compiled_patterns = {}
        active_patterns = self.DETECTION_LEVELS.get(self.detection_level, self.DETECTION_LEVELS['medium'])
        for pii_type in active_patterns:
            if pii_type in self.PII_PATTERNS:
                self.compiled_patterns[pii_type] = re.compile(self.PII_PATTERNS[pii_type])

    def filter_calendar_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """
        Filter PII from a calendar event.

        Args:
            event: The calendar event to filter.

        Returns:
            The filtered calendar event.
        """
        if not self.enabled:
            return event
            
        # Create a copy of the event to avoid modifying the original
        filtered_event = event.copy()
        
        # Check if the event is private
        if self.is_private_event(event):
            # For private events, redact more aggressively
            if 'summary' in filtered_event:
                filtered_event['summary'] = '[PRIVATE EVENT]'
            if 'description' in filtered_event:
                filtered_event['description'] = '[PRIVATE EVENT DETAILS REDACTED]'
            if 'location' in filtered_event:
                filtered_event['location'] = '[PRIVATE LOCATION]'
            
            # Keep only essential information
            essential_fields = ['id', 'start', 'end', 'status', 'visibility']
            for field in list(filtered_event.keys()):
                if field not in essential_fields:
                    filtered_event.pop(field, None)
                    
            return filtered_event
        
        # For non-private events, redact PII
        if 'summary' in filtered_event:
            filtered_event['summary'] = self.redact_pii(filtered_event['summary'])
        if 'description' in filtered_event:
            filtered_event['description'] = self.redact_pii(filtered_event['description'])
        if 'location' in filtered_event:
            filtered_event['location'] = self.redact_pii(filtered_event['location'])
            
        # Filter attendees
        if 'attendees' in filtered_event:
            filtered_attendees = []
            for attendee in filtered_event['attendees']:
                filtered_attendee = attendee.copy()
                if 'email' in filtered_attendee:
                    filtered_attendee['email'] = '[REDACTED-EMAIL]'
                if 'displayName' in filtered_attendee:
                    filtered_attendee['displayName'] = self.redact_pii(filtered_attendee['displayName'])
                filtered_attendees.append(filtered_attendee)
            filtered_event['attendees'] = filtered_attendees
            
        return filtered_event

    def filter_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """
        Filter PII from a task.

        Args:
            task: The task to filter.

        Returns:
            The filtered task.
        """
        if not self.enabled:
            return task
            
        # Create a copy of the task to avoid modifying the original
        filtered_task = task.copy()
        
        # Redact PII from task fields
        if 'title' in filtered_task:
            filtered_task['title'] = self.redact_pii(filtered_task['title'])
        if 'notes' in filtered_task:
            filtered_task['notes'] = self.redact_pii(filtered_task['notes'])
            
        return filtered_task

    def is_private_event(self, event: Dict[str, Any]) -> bool:
        """
        Check if an event is marked as private.

        Args:
            event: The calendar event to check.

        Returns:
            True if the event is private, False otherwise.
        """
        # Check visibility field
        visibility = event.get('visibility', '').lower()
        if visibility in ['private', 'confidential']:
            return True
            
        # Check for private keywords in summary or description
        private_keywords = ['private', 'confidential', 'personal', 'sensitive']
        summary = event.get('summary', '').lower()
        description = event.get('description', '').lower()
        
        for keyword in private_keywords:
            if keyword in summary or keyword in description:
                return True
                
        return False

    def detect_pii(self, text: str) -> Set[str]:
        """
        Detect PII in text.

        Args:
            text: The text to analyze.

        Returns:
            A set of PII types found in the text.
        """
        if not text or not self.enabled:
            return set()
            
        detected_pii = set()
        
        for pii_type, pattern in self.compiled_patterns.items():
            if pattern.search(text):
                detected_pii.add(pii_type)
                
        return detected_pii

    def redact_pii(self, text: str) -> str:
        """
        Redact PII from text.

        Args:
            text: The text to redact.

        Returns:
            The redacted text.
        """
        if not text or not self.enabled:
            return text
            
        redacted_text = text
        
        for pii_type, pattern in self.compiled_patterns.items():
            redacted_text = pattern.sub(f'[REDACTED-{pii_type}]', redacted_text)
            
        return redacted_text 