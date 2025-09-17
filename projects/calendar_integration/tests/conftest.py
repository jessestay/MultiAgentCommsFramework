import os
import pytest
from unittest.mock import patch


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """Set up the test environment with required environment variables."""
    # Create a dictionary of environment variables for testing
    test_env = {
        'GOOGLE_CLIENT_ID': 'test_client_id',
        'GOOGLE_CLIENT_SECRET': 'test_client_secret',
        'GOOGLE_REDIRECT_URI': 'http://localhost:8080/oauth2callback',
        'CALENDAR_API_SCOPES': 'https://www.googleapis.com/auth/calendar',
        'TASKS_API_SCOPES': 'https://www.googleapis.com/auth/tasks',
        'TOKEN_ENCRYPTION_KEY': 'test_encryption_key',
        'TOKEN_STORAGE_PATH': './test_tokens',
        'PRIVACY_FILTER_ENABLED': 'true',
        'PII_DETECTION_LEVEL': 'medium',
        'LOG_LEVEL': 'DEBUG',
        'LOG_FILE': './test_logs/calendar_integration.log'
    }
    
    # Apply the environment variables
    with patch.dict(os.environ, test_env):
        yield


@pytest.fixture
def mock_google_credentials():
    """Create mock Google credentials for testing."""
    class MockCredentials:
        def __init__(self):
            self.token = 'access_token'
            self.refresh_token = 'refresh_token'
            self.expiry = '2023-01-01T00:00:00Z'
            
        def to_json(self):
            return '{"token": "access_token", "refresh_token": "refresh_token"}'
    
    return MockCredentials()


@pytest.fixture
def mock_calendar_event():
    """Create a mock calendar event for testing."""
    return {
        'id': 'event123',
        'summary': 'Test Event',
        'description': 'This is a test event',
        'start': {
            'dateTime': '2023-01-01T10:00:00Z',
            'timeZone': 'UTC'
        },
        'end': {
            'dateTime': '2023-01-01T11:00:00Z',
            'timeZone': 'UTC'
        },
        'attendees': [
            {'email': 'test@example.com'}
        ],
        'reminders': {
            'useDefault': False,
            'overrides': [
                {'method': 'email', 'minutes': 30}
            ]
        }
    }


@pytest.fixture
def mock_task():
    """Create a mock task for testing."""
    return {
        'id': 'task123',
        'title': 'Test Task',
        'notes': 'This is a test task',
        'due': '2023-01-02T00:00:00Z',
        'status': 'needsAction'
    } 