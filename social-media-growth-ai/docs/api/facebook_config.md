# Facebook API Configuration

This document describes how to configure and use the Facebook API integration in the Facebook Growth AI system.

## Overview

The `facebook-growth-ai/src/analytics/config.py` module provides comprehensive utilities for managing Facebook API credentials, including:

- Loading credentials from environment variables or configuration files
- Validating credentials for correctness
- Refreshing access tokens to maintain API access
- Testing credentials against the Facebook API
- Saving credentials to configuration files

## Required Credentials

To use the Facebook API integration, you need the following credentials:

- **App ID**: Your Facebook App ID (numeric)
- **App Secret**: Your Facebook App Secret
- **Access Token**: A valid Facebook Access Token
- **Page ID** (optional): Facebook Page ID if your application works with a specific page

## Configuration Methods

### Environment Variables

You can configure the Facebook API credentials using environment variables:

```bash
# Required credentials
export FB_APP_ID='123456789'
export FB_APP_SECRET='your_app_secret'
export FB_ACCESS_TOKEN='your_access_token'

# Optional
export FB_PAGE_ID='your_page_id'
```

### Configuration File

Alternatively, you can use a JSON configuration file with the following structure:

```json
{
  "app_id": "123456789",
  "app_secret": "your_app_secret",
  "access_token": "your_access_token",
  "page_id": "your_page_id"
}
```

## Usage Examples

### Basic Usage

```python
from src.analytics.config import load_facebook_api_config, FacebookAPIConfigError

try:
    # Load from environment variables
    credentials = load_facebook_api_config()
    
    # Or load from a configuration file
    # credentials = load_facebook_api_config(config_path='path/to/config.json')
    
    print(f"Loaded credentials for app ID: {credentials['app_id']}")
except FacebookAPIConfigError as e:
    print(f"Configuration error: {str(e)}")
```

### Loading with Token Refresh

To automatically refresh the access token when loading credentials:

```python
from src.analytics.config import load_facebook_api_config

# Load credentials and refresh the token
credentials = load_facebook_api_config(
    config_path='path/to/config.json',
    refresh_token=True
)

print(f"Loaded credentials with refreshed token: {credentials['access_token'][:10]}...")
```

### Testing Credentials

To verify that your credentials are valid:

```python
from src.analytics.config import test_credentials, load_facebook_api_config

# Load credentials
credentials = load_facebook_api_config()

# Test if the credentials are valid
success, error = test_credentials(credentials)

if success:
    print("Credentials are valid and working with the Facebook API")
else:
    print(f"Credentials are invalid: {error}")
```

### Manual Token Refresh

To manually refresh an access token:

```python
from src.analytics.config import refresh_access_token

# Load existing credentials (from any source)
credentials = {...}  # Your existing credentials

try:
    # Refresh the access token
    updated_credentials = refresh_access_token(credentials)
    
    print("Token refreshed successfully")
    print(f"Old token: {credentials['access_token'][:10]}...")
    print(f"New token: {updated_credentials['access_token'][:10]}...")
except Exception as e:
    print(f"Failed to refresh token: {str(e)}")
```

### Saving Credentials

To save credentials to a configuration file:

```python
from src.analytics.config import save_credentials_to_file

credentials = {
    'app_id': '123456789',
    'app_secret': 'your_app_secret',
    'access_token': 'your_access_token',
    'page_id': 'your_page_id'
}

success = save_credentials_to_file(credentials, 'path/to/config.json')

if success:
    print("Credentials saved successfully")
else:
    print("Failed to save credentials")
```

## Token Management

### Token Types

Facebook API uses different types of access tokens:

- **User Access Token**: Short-lived token (typically valid for a few hours)
- **App Access Token**: Used for server-to-server API calls
- **Page Access Token**: Token for accessing a specific Facebook Page
- **Long-lived Access Token**: Extended validity token (typically valid for 60 days)

The `refresh_access_token()` function exchanges a short-lived token for a long-lived token, extending its validity to approximately 60 days.

### Token Refresh Best Practices

- Refresh tokens before they expire to maintain uninterrupted API access
- Store the refreshed token securely using `save_credentials_to_file()`
- Set up regular token refresh as part of your application's maintenance routines
- Monitor token expiration and implement automated refresh mechanisms

## Error Handling

The module uses the `FacebookAPIConfigError` exception class for all configuration-related errors. Always handle this exception when working with the configuration module:

```python
from src.analytics.config import load_facebook_api_config, FacebookAPIConfigError

try:
    credentials = load_facebook_api_config()
    # Use credentials...
except FacebookAPIConfigError as e:
    print(f"Configuration error: {str(e)}")
    # Implement appropriate error handling (notification, fallback, etc.)
```

## Security Best Practices

- Never commit credentials to version control
- Use environment variables in production environments
- Restrict file permissions on configuration files
- Implement secure credential storage with appropriate encryption
- Regularly rotate app secrets and tokens
- Use the test_credentials() function to verify credentials before use 