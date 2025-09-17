"""
Event model module.

This module provides a data model for calendar events.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
import json


class Event:
    """
    Data model for a calendar event.
    """

    def __init__(self, event_data: Optional[Dict[str, Any]] = None):
        """
        Initialize an Event instance.
        
        Args:
            event_data: Optional dictionary containing event data.
        """
        self.id = None
        self.summary = None
        self.description = None
        self.location = None
        self.start = None
        self.end = None
        self.attendees = []
        self.reminders = {"useDefault": True}
        self.visibility = "default"
        self.status = "confirmed"
        
        if event_data:
            self.from_dict(event_data)

    def from_dict(self, event_data: Dict[str, Any]) -> 'Event':
        """
        Update the event from a dictionary.
        
        Args:
            event_data: Dictionary containing event data.
            
        Returns:
            The updated Event instance.
        """
        self.id = event_data.get('id')
        self.summary = event_data.get('summary')
        self.description = event_data.get('description')
        self.location = event_data.get('location')
        self.start = event_data.get('start')
        self.end = event_data.get('end')
        self.attendees = event_data.get('attendees', [])
        self.reminders = event_data.get('reminders', {"useDefault": True})
        self.visibility = event_data.get('visibility', 'default')
        self.status = event_data.get('status', 'confirmed')
        
        return self

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert the event to a dictionary.
        
        Returns:
            Dictionary representation of the event.
        """
        event_dict = {
            'summary': self.summary,
            'description': self.description,
            'start': self.start,
            'end': self.end,
            'reminders': self.reminders,
            'visibility': self.visibility,
            'status': self.status
        }
        
        # Add optional fields if they exist
        if self.id:
            event_dict['id'] = self.id
        if self.location:
            event_dict['location'] = self.location
        if self.attendees:
            event_dict['attendees'] = self.attendees
            
        # Remove None values
        return {k: v for k, v in event_dict.items() if v is not None}

    def to_json(self) -> str:
        """
        Convert the event to a JSON string.
        
        Returns:
            JSON string representation of the event.
        """
        return json.dumps(self.to_dict())

    @classmethod
    def from_json(cls, json_str: str) -> 'Event':
        """
        Create an Event instance from a JSON string.
        
        Args:
            json_str: JSON string containing event data.
            
        Returns:
            A new Event instance.
        """
        event_data = json.loads(json_str)
        return cls(event_data)

    def set_time(self, start_time: datetime, end_time: datetime, timezone: str = 'UTC') -> 'Event':
        """
        Set the start and end times of the event.
        
        Args:
            start_time: The start time of the event.
            end_time: The end time of the event.
            timezone: The timezone of the event. Default is 'UTC'.
            
        Returns:
            The updated Event instance.
        """
        self.start = {
            'dateTime': start_time.isoformat(),
            'timeZone': timezone
        }
        
        self.end = {
            'dateTime': end_time.isoformat(),
            'timeZone': timezone
        }
        
        return self

    def set_all_day(self, start_date: datetime, end_date: datetime) -> 'Event':
        """
        Set the event as an all-day event.
        
        Args:
            start_date: The start date of the event.
            end_date: The end date of the event.
            
        Returns:
            The updated Event instance.
        """
        self.start = {
            'date': start_date.strftime('%Y-%m-%d')
        }
        
        self.end = {
            'date': end_date.strftime('%Y-%m-%d')
        }
        
        return self

    def add_attendee(self, email: str, display_name: Optional[str] = None, 
                    optional: bool = False) -> 'Event':
        """
        Add an attendee to the event.
        
        Args:
            email: The email address of the attendee.
            display_name: Optional display name of the attendee.
            optional: Whether the attendee's attendance is optional. Default is False.
            
        Returns:
            The updated Event instance.
        """
        attendee = {'email': email, 'optional': optional}
        
        if display_name:
            attendee['displayName'] = display_name
            
        self.attendees.append(attendee)
        
        return self

    def set_reminders(self, use_default: bool = True, 
                     overrides: Optional[List[Dict[str, Any]]] = None) -> 'Event':
        """
        Set the reminders for the event.
        
        Args:
            use_default: Whether to use the default reminders. Default is True.
            overrides: Optional list of reminder overrides.
            
        Returns:
            The updated Event instance.
        """
        self.reminders = {
            'useDefault': use_default
        }
        
        if overrides:
            self.reminders['overrides'] = overrides
            
        return self

    def set_visibility(self, visibility: str) -> 'Event':
        """
        Set the visibility of the event.
        
        Args:
            visibility: The visibility of the event. 
                        Can be 'default', 'public', 'private', or 'confidential'.
            
        Returns:
            The updated Event instance.
        """
        valid_visibilities = ['default', 'public', 'private', 'confidential']
        
        if visibility not in valid_visibilities:
            raise ValueError(f"Invalid visibility: {visibility}. "
                            f"Must be one of {valid_visibilities}")
                            
        self.visibility = visibility
        
        return self 