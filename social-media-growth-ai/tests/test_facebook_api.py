"""
Tests for Facebook API integration.
"""
import os
import json
import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path


@pytest.fixture
def mock_response():
    """Create a mock response for Facebook API calls."""
    mock = MagicMock()
    mock.status_code = 200
    mock.json.return_value = {"success": True, "data": {}}
    return mock


@pytest.fixture
def mock_page_response():
    """Create a mock response for Facebook Page API calls."""
    mock = MagicMock()
    mock.status_code = 200
    mock.json.return_value = {
        "name": "Test Page",
        "id": "123456789",
        "category": "Test Category",
        "fan_count": 100
    }
    return mock


@pytest.fixture
def mock_posts_response():
    """Create a mock response for Facebook Page posts."""
    mock = MagicMock()
    mock.status_code = 200
    mock.json.return_value = {
        "data": [
            {
                "id": "123456789_123456789",
                "message": "Test post 1",
                "created_time": "2023-01-01T12:00:00+0000"
            },
            {
                "id": "123456789_987654321",
                "message": "Test post 2",
                "created_time": "2023-01-02T12:00:00+0000"
            }
        ],
        "paging": {
            "cursors": {
                "before": "ABC123",
                "after": "XYZ789"
            },
            "next": "https://graph.facebook.com/v18.0/123456789/posts?after=XYZ789"
        }
    }
    return mock


@pytest.fixture
def mock_error_response():
    """Create a mock error response for Facebook API calls."""
    mock = MagicMock()
    mock.status_code = 400
    mock.json.return_value = {
        "error": {
            "message": "Invalid OAuth access token.",
            "type": "OAuthException",
            "code": 190,
            "fbtrace_id": "Ab1Cd2Ef3Gh4"
        }
    }
    return mock


def test_api_client_initialization():
    """Test that the Facebook API client initializes correctly."""
    from src.facebook.api_client import FacebookApiClient
    
    # Test initialization with env variables
    with patch.dict(os.environ, {
        "FACEBOOK_APP_ID": "test_app_id",
        "FACEBOOK_APP_SECRET": "test_app_secret",
        "FACEBOOK_ACCESS_TOKEN": "test_access_token"
    }):
        client = FacebookApiClient()
        assert client.app_id == "test_app_id"
        assert client.app_secret == "test_app_secret"
        assert client.access_token == "test_access_token"
    
    # Test initialization with explicit parameters
    client = FacebookApiClient(
        app_id="custom_app_id",
        app_secret="custom_app_secret",
        access_token="custom_access_token"
    )
    assert client.app_id == "custom_app_id"
    assert client.app_secret == "custom_app_secret"
    assert client.access_token == "custom_access_token"
    
    # Test initialization with missing parameters
    with pytest.raises(ValueError):
        client = FacebookApiClient(app_id=None, app_secret=None, access_token=None)


def test_auth_flow():
    """Test the Facebook authentication flow."""
    from src.facebook.api_client import FacebookApiClient
    
    # Mock the OAuth exchange
    with patch("requests.get") as mock_get:
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            "access_token": "long_lived_token",
            "expires_in": 5184000  # 60 days in seconds
        }
        
        client = FacebookApiClient(
            app_id="test_app_id",
            app_secret="test_app_secret",
            access_token="short_lived_token"
        )
        
        long_lived_token = client.exchange_token()
        assert long_lived_token == "long_lived_token"
        
        # Verify the correct URL was called
        mock_get.assert_called_once()
        call_args = mock_get.call_args[0][0]
        assert "graph.facebook.com" in call_args
        assert "test_app_id" in call_args
        assert "test_app_secret" in call_args
        assert "short_lived_token" in call_args


def test_error_handling(mock_error_response):
    """Test API error handling."""
    from src.facebook.api_client import FacebookApiClient, FacebookApiError
    
    client = FacebookApiClient(
        app_id="test_app_id",
        app_secret="test_app_secret",
        access_token="test_access_token"
    )
    
    # Test error handling for API calls
    with patch("requests.get", return_value=mock_error_response):
        with pytest.raises(FacebookApiError) as exc_info:
            client.get_page_details("123456789")
        
        assert "Invalid OAuth access token" in str(exc_info.value)
        assert exc_info.value.code == 190
        assert exc_info.value.error_type == "OAuthException"


def test_rate_limiting():
    """Test rate limiting handling."""
    from src.facebook.api_client import FacebookApiClient, FacebookApiRateLimitError
    
    client = FacebookApiClient(
        app_id="test_app_id",
        app_secret="test_app_secret",
        access_token="test_access_token"
    )
    
    # Mock a rate limit response
    rate_limit_response = MagicMock()
    rate_limit_response.status_code = 429
    rate_limit_response.json.return_value = {
        "error": {
            "message": "Application request limit reached",
            "type": "OAuthException",
            "code": 4,
            "fbtrace_id": "Ab1Cd2Ef3Gh4"
        }
    }
    
    with patch("requests.get", return_value=rate_limit_response):
        with pytest.raises(FacebookApiRateLimitError) as exc_info:
            client.get_page_details("123456789")
        
        assert "request limit reached" in str(exc_info.value)
        assert exc_info.value.code == 4
        assert hasattr(exc_info.value, "retry_after")


def test_page_management(mock_page_response, mock_posts_response):
    """Test page management functionality."""
    from src.facebook.api_client import FacebookApiClient
    
    client = FacebookApiClient(
        app_id="test_app_id",
        app_secret="test_app_secret",
        access_token="test_access_token"
    )
    
    # Test getting page details
    with patch("requests.get", return_value=mock_page_response):
        page = client.get_page_details("123456789")
        assert page["name"] == "Test Page"
        assert page["id"] == "123456789"
        assert page["fan_count"] == 100
    
    # Test listing posts
    with patch("requests.get", return_value=mock_posts_response):
        posts = client.get_page_posts("123456789")
        assert len(posts["data"]) == 2
        assert posts["data"][0]["message"] == "Test post 1"
        assert posts["data"][1]["message"] == "Test post 2"
        assert "paging" in posts


def test_post_operations(mock_response):
    """Test post creation and scheduling."""
    from src.facebook.api_client import FacebookApiClient
    
    client = FacebookApiClient(
        app_id="test_app_id",
        app_secret="test_app_secret",
        access_token="test_access_token"
    )
    
    # Mock a successful post creation
    create_response = MagicMock()
    create_response.status_code = 200
    create_response.json.return_value = {"id": "123456789_123456789"}
    
    with patch("requests.post", return_value=create_response):
        # Test creating a post
        post_id = client.create_post(
            page_id="123456789",
            message="Test post content"
        )
        assert post_id == "123456789_123456789"
    
    # Test scheduling a post
    schedule_time = "2023-12-31T12:00:00+0000"
    with patch("requests.post", return_value=create_response):
        post_id = client.create_post(
            page_id="123456789",
            message="Scheduled post content",
            scheduled_publish_time=schedule_time
        )
        assert post_id == "123456789_123456789"


def test_post_analytics(mock_response):
    """Test post analytics retrieval."""
    from src.facebook.api_client import FacebookApiClient
    
    client = FacebookApiClient(
        app_id="test_app_id",
        app_secret="test_app_secret",
        access_token="test_access_token"
    )
    
    # Mock analytics response
    analytics_response = MagicMock()
    analytics_response.status_code = 200
    analytics_response.json.return_value = {
        "data": [
            {
                "name": "post_impressions",
                "period": "lifetime",
                "values": [{"value": 1234}]
            },
            {
                "name": "post_engagements",
                "period": "lifetime",
                "values": [{"value": 567}]
            }
        ]
    }
    
    with patch("requests.get", return_value=analytics_response):
        analytics = client.get_post_analytics(
            post_id="123456789_123456789",
            metrics=["post_impressions", "post_engagements"]
        )
        
        assert len(analytics["data"]) == 2
        assert analytics["data"][0]["name"] == "post_impressions"
        assert analytics["data"][0]["values"][0]["value"] == 1234
        assert analytics["data"][1]["name"] == "post_engagements"
        assert analytics["data"][1]["values"][0]["value"] == 567 