"""
OAuth module for Google API authentication.

This module handles OAuth 2.0 authentication with Google APIs, including
token generation, refresh, and management.
"""

import os
import json
from typing import Dict, List, Optional, Any

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build


class GoogleOAuth:
    """
    Handles OAuth 2.0 authentication with Google APIs.
    """

    def __init__(self, credentials: Optional[Credentials] = None):
        """
        Initialize the GoogleOAuth instance.

        Args:
            credentials: Optional Google OAuth credentials. If not provided,
                         the instance will be initialized without credentials.
        """
        self.client_id = os.environ.get('GOOGLE_CLIENT_ID')
        self.client_secret = os.environ.get('GOOGLE_CLIENT_SECRET')
        self.redirect_uri = os.environ.get('GOOGLE_REDIRECT_URI')
        
        # Combine calendar and tasks scopes
        calendar_scopes = os.environ.get('CALENDAR_API_SCOPES', '').split(',')
        tasks_scopes = os.environ.get('TASKS_API_SCOPES', '').split(',')
        self.scopes = [scope for scope in calendar_scopes + tasks_scopes if scope]
        
        self.credentials = credentials
        self.client_config = self._create_client_config()

    def _create_client_config(self) -> Dict[str, Any]:
        """
        Create a client configuration dictionary for OAuth flow.

        Returns:
            Dict containing the client configuration.
        """
        return {
            'installed': {
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'redirect_uris': [self.redirect_uri],
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            }
        }

    def get_authorization_url(self) -> str:
        """
        Generate the authorization URL for OAuth flow.

        Returns:
            The authorization URL to redirect the user to.
        """
        flow = Flow.from_client_config(
            self.client_config,
            scopes=self.scopes,
            redirect_uri=self.redirect_uri
        )
        
        # Enable offline access to get a refresh token
        authorization_url, _ = flow.authorization_url(
            access_type='offline',
            prompt='consent',
            include_granted_scopes='true'
        )
        
        return authorization_url

    def exchange_code_for_token(self, code: str) -> Credentials:
        """
        Exchange an authorization code for access and refresh tokens.

        Args:
            code: The authorization code from the OAuth callback.

        Returns:
            Google OAuth credentials containing access and refresh tokens.
        """
        flow = Flow.from_client_config(
            self.client_config,
            scopes=self.scopes,
            redirect_uri=self.redirect_uri
        )
        
        flow.fetch_token(code=code)
        self.credentials = flow.credentials
        
        return self.credentials

    def refresh_token_if_needed(self) -> bool:
        """
        Refresh the access token if it's expired.

        Returns:
            True if the token was refreshed, False otherwise.
        """
        if not self.credentials:
            return False
            
        if not self.credentials.valid:
            if self.credentials.refresh_token:
                self.credentials.refresh()
                return True
                
        return False

    def build_service(self, api_name: str, api_version: str) -> Any:
        """
        Build a Google API service using the current credentials.

        Args:
            api_name: The name of the API (e.g., 'calendar', 'tasks').
            api_version: The version of the API (e.g., 'v3', 'v1').

        Returns:
            A Google API service object.

        Raises:
            ValueError: If no credentials are available.
        """
        if not self.credentials:
            raise ValueError("No credentials available. Authenticate first.")
            
        return build(api_name, api_version, credentials=self.credentials)

    def credentials_to_dict(self) -> Dict[str, Any]:
        """
        Convert credentials to a dictionary for storage.

        Returns:
            Dictionary representation of the credentials.

        Raises:
            ValueError: If no credentials are available.
        """
        if not self.credentials:
            raise ValueError("No credentials available.")
            
        return {
            'token': self.credentials.token,
            'refresh_token': self.credentials.refresh_token,
            'token_uri': self.credentials.token_uri,
            'client_id': self.credentials.client_id,
            'client_secret': self.credentials.client_secret,
            'scopes': self.credentials.scopes,
            'expiry': self.credentials.expiry.isoformat() if self.credentials.expiry else None
        }

    @classmethod
    def from_dict(cls, credentials_dict: Dict[str, Any]) -> 'GoogleOAuth':
        """
        Create a GoogleOAuth instance from a credentials dictionary.

        Args:
            credentials_dict: Dictionary containing credential information.

        Returns:
            A new GoogleOAuth instance with the provided credentials.
        """
        credentials = Credentials(
            token=credentials_dict['token'],
            refresh_token=credentials_dict['refresh_token'],
            token_uri=credentials_dict['token_uri'],
            client_id=credentials_dict['client_id'],
            client_secret=credentials_dict['client_secret'],
            scopes=credentials_dict['scopes']
        )
        
        return cls(credentials=credentials) 