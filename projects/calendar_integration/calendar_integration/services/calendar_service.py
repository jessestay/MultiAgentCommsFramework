"""
Calendar service module for interacting with Google Calendar API.

This module provides a service for interacting with the Google Calendar API,
including retrieving, creating, updating, and deleting calendar events.
"""

import os
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from calendar_integration.auth.oauth import GoogleOAuth
from calendar_integration.privacy.filters import PrivacyFilter


class CalendarService:
    """
    Service for interacting with the Google Calendar API.
    """

    def __init__(self, credentials: Optional[Credentials] = None):
        """
        Initialize the CalendarService instance.

        Args:
            credentials: Optional Google OAuth credentials. If not provided,
                         the instance will be initialized without credentials.
        """
        self._credentials = credentials
        self._service = None
        self._privacy_filter = PrivacyFilter()
        
        if credentials:
            self._service = build('calendar', 'v3', credentials=credentials)

    def set_credentials(self, credentials: Credentials) -> None:
        """
        Set the credentials for the service.

        Args:
            credentials: Google OAuth credentials.
        """
        self._credentials = credentials
        self._service = build('calendar', 'v3', credentials=credentials)

    def _ensure_service(self) -> None:
        """
        Ensure that the service is initialized.

        Raises:
            ValueError: If no credentials are available.
        """
        if not self._service:
            if not self._credentials:
                raise ValueError("No credentials available. Authenticate first.")
            self._service = build('calendar', 'v3', credentials=self._credentials)

    def get_calendar_list(self) -> List[Dict[str, Any]]:
        """
        Get a list of calendars for the authenticated user.

        Returns:
            A list of calendar objects.

        Raises:
            ValueError: If no credentials are available.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        try:
            calendars = []
            page_token = None
            
            while True:
                calendar_list = self._service.calendarList().list(pageToken=page_token).execute()
                calendars.extend(calendar_list.get('items', []))
                
                page_token = calendar_list.get('nextPageToken')
                if not page_token:
                    break
                    
            return calendars
        except HttpError as error:
            print(f"Error retrieving calendar list: {error}")
            raise

    def get_events(self, calendar_id: str = 'primary', time_min: Optional[str] = None, 
                  time_max: Optional[str] = None, max_results: int = 100) -> List[Dict[str, Any]]:
        """
        Get events from a calendar.

        Args:
            calendar_id: The ID of the calendar to retrieve events from. Default is 'primary'.
            time_min: The minimum time (inclusive) to filter events by. RFC3339 timestamp.
            time_max: The maximum time (exclusive) to filter events by. RFC3339 timestamp.
            max_results: The maximum number of events to return. Default is 100.

        Returns:
            A list of event objects.

        Raises:
            ValueError: If no credentials are available.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        # Set default time range if not provided
        if not time_min:
            time_min = datetime.utcnow().isoformat() + 'Z'  # 'Z' indicates UTC time
        if not time_max:
            # Default to 30 days from now
            time_max = (datetime.utcnow() + timedelta(days=30)).isoformat() + 'Z'
            
        try:
            events = []
            page_token = None
            
            while True:
                events_result = self._service.events().list(
                    calendarId=calendar_id,
                    timeMin=time_min,
                    timeMax=time_max,
                    maxResults=max_results,
                    singleEvents=True,
                    orderBy='startTime',
                    pageToken=page_token
                ).execute()
                
                # Apply privacy filter to each event
                filtered_events = [self._privacy_filter.filter_calendar_event(event) 
                                  for event in events_result.get('items', [])]
                events.extend(filtered_events)
                
                page_token = events_result.get('nextPageToken')
                if not page_token:
                    break
                    
            return events
        except HttpError as error:
            print(f"Error retrieving events: {error}")
            raise

    def create_event(self, calendar_id: str = 'primary', event_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Create a new event in a calendar.

        Args:
            calendar_id: The ID of the calendar to create the event in. Default is 'primary'.
            event_data: The event data to create.

        Returns:
            The created event object.

        Raises:
            ValueError: If no credentials are available or event_data is None.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        if not event_data:
            raise ValueError("Event data is required.")
            
        try:
            event = self._service.events().insert(
                calendarId=calendar_id,
                body=event_data
            ).execute()
            
            return event
        except HttpError as error:
            print(f"Error creating event: {error}")
            raise

    def update_event(self, calendar_id: str = 'primary', event_id: str = None, 
                    event_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Update an existing event in a calendar.

        Args:
            calendar_id: The ID of the calendar containing the event. Default is 'primary'.
            event_id: The ID of the event to update.
            event_data: The updated event data.

        Returns:
            The updated event object.

        Raises:
            ValueError: If no credentials are available, event_id is None, or event_data is None.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        if not event_id:
            raise ValueError("Event ID is required.")
        if not event_data:
            raise ValueError("Event data is required.")
            
        try:
            event = self._service.events().update(
                calendarId=calendar_id,
                eventId=event_id,
                body=event_data
            ).execute()
            
            return event
        except HttpError as error:
            print(f"Error updating event: {error}")
            raise

    def delete_event(self, calendar_id: str = 'primary', event_id: str = None) -> bool:
        """
        Delete an event from a calendar.

        Args:
            calendar_id: The ID of the calendar containing the event. Default is 'primary'.
            event_id: The ID of the event to delete.

        Returns:
            True if the event was deleted successfully, False otherwise.

        Raises:
            ValueError: If no credentials are available or event_id is None.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        if not event_id:
            raise ValueError("Event ID is required.")
            
        try:
            self._service.events().delete(
                calendarId=calendar_id,
                eventId=event_id
            ).execute()
            
            return True
        except HttpError as error:
            print(f"Error deleting event: {error}")
            raise

    def get_free_busy(self, time_min: str, time_max: str, calendar_ids: List[str] = None) -> Dict[str, Any]:
        """
        Get free/busy information for a list of calendars.

        Args:
            time_min: The minimum time (inclusive) to query. RFC3339 timestamp.
            time_max: The maximum time (exclusive) to query. RFC3339 timestamp.
            calendar_ids: A list of calendar IDs to query. Default is ['primary'].

        Returns:
            A dictionary containing free/busy information for each calendar.

        Raises:
            ValueError: If no credentials are available.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        if not calendar_ids:
            calendar_ids = ['primary']
            
        try:
            body = {
                'timeMin': time_min,
                'timeMax': time_max,
                'items': [{'id': calendar_id} for calendar_id in calendar_ids]
            }
            
            free_busy_response = self._service.freebusy().query(body=body).execute()
            
            return free_busy_response.get('calendars', {})
        except HttpError as error:
            print(f"Error retrieving free/busy information: {error}")
            raise 