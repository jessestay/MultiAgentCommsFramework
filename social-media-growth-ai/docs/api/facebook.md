# Facebook API Integration

## Overview

The Facebook API integration allows the Social Media Growth AI system to interact with Facebook Pages, retrieve data, and manage content. This document explains how to configure and use the integration.

## Prerequisites

Before using the Facebook API integration, you need:

1. **Facebook Developer Account**: Register at [developers.facebook.com](https://developers.facebook.com/)
2. **Facebook App**: Create an app in the Facebook Developer Dashboard
3. **App Permissions**: Configure your app with the following permissions:
   - `pages_show_list`: To access pages the user manages
   - `pages_read_engagement`: To read page insights
   - `pages_manage_posts`: To create and schedule posts
   - `pages_manage_metadata`: To manage page settings

## Configuration

### Environment Variables

Configure your Facebook API credentials in the `.env` file:

```
FACEBOOK_APP_ID=your_app_id_here
FACEBOOK_APP_SECRET=your_app_secret_here
FACEBOOK_ACCESS_TOKEN=your_access_token_here
FACEBOOK_PAGE_ID=your_page_id_here
```

### Token Types

The Facebook API uses different token types:

- **User Access Token**: Short-lived token (typically valid for a few hours)
- **Page Access Token**: Token for accessing a specific Facebook Page
- **Long-lived Access Token**: Extended validity token (typically valid for 60 days)

Our system automatically exchanges short-lived tokens for long-lived tokens.

## API Client Usage

### Initialization

```python
from src.facebook.api_client import FacebookApiClient

# Initialize with environment variables
client = FacebookApiClient()

# Or initialize with explicit credentials
client = FacebookApiClient(
    app_id="your_app_id",
    app_secret="your_app_secret",
    access_token="your_access_token"
)
```

### Authentication

```python
# Exchange a short-lived token for a long-lived token
long_lived_token = client.exchange_token()
print(f"Long-lived token: {long_lived_token}")
```

### Page Management

```python
# Get page details
page_details = client.get_page_details("your_page_id")
print(f"Page name: {page_details['name']}")
print(f"Fan count: {page_details['fan_count']}")

# Get page posts
posts = client.get_page_posts("your_page_id", limit=10)
for post in posts["data"]:
    print(f"Post: {post['message'][:50]}...")
    print(f"Created: {post['created_time']}")
    print("-" * 30)
```

### Post Management

```python
# Create a post
post_id = client.create_post(
    page_id="your_page_id",
    message="Hello from the Social Media Growth AI!"
)
print(f"Created post with ID: {post_id}")

# Create a post with a link
post_id = client.create_post(
    page_id="your_page_id",
    message="Check out this link!",
    link="https://example.com"
)

# Schedule a post
from datetime import datetime, timedelta
import pytz

# Schedule for tomorrow at 10 AM UTC
tomorrow = datetime.now(pytz.UTC) + timedelta(days=1)
tomorrow = tomorrow.replace(hour=10, minute=0, second=0, microsecond=0)
scheduled_time = tomorrow.strftime("%Y-%m-%dT%H:%M:%S%z")

post_id = client.create_post(
    page_id="your_page_id",
    message="This is a scheduled post!",
    scheduled_publish_time=scheduled_time
)
print(f"Scheduled post with ID: {post_id}")
```

### Analytics

```python
# Get post analytics
analytics = client.get_post_analytics(
    post_id="post_id_here",
    metrics=["post_impressions", "post_engagements"]
)

for metric in analytics["data"]:
    name = metric["name"]
    value = metric["values"][0]["value"]
    print(f"{name}: {value}")
```

## Error Handling

The API client includes robust error handling for common Facebook API errors:

```python
from src.facebook.api_client import FacebookApiClient, FacebookApiError, FacebookApiRateLimitError

try:
    client = FacebookApiClient()
    page_details = client.get_page_details("your_page_id")
except FacebookApiRateLimitError as e:
    print(f"Rate limit exceeded. Retry after {e.retry_after} seconds.")
    print(f"Error code: {e.code}")
    print(f"Error type: {e.error_type}")
except FacebookApiError as e:
    print(f"API error: {e.message}")
    print(f"Error code: {e.code}")
    print(f"Error type: {e.error_type}")
except Exception as e:
    print(f"Unexpected error: {str(e)}")
```

## Rate Limiting

The Facebook API enforces rate limits on requests. Our client implements:

1. **Automatic delay**: Configurable delay between requests (default: 1 second)
2. **Rate limit detection**: Detects and reports rate limit errors
3. **Retry information**: Provides retry_after information for implementing retry logic

Configure rate limiting when initializing the client:

```python
client = FacebookApiClient(
    # Credentials...
    rate_limit_delay=2  # 2 seconds between requests
)
```

## Best Practices

1. **Store tokens securely**: Never commit tokens to version control
2. **Use long-lived tokens**: Exchange for long-lived tokens to reduce authentication frequency
3. **Implement retry logic**: Handle rate limiting with exponential backoff
4. **Cache responses**: Cache responses to reduce API calls
5. **Monitor usage**: Keep track of API usage to avoid hitting limits
6. **Handle pagination**: Use the pagination cursors for large datasets

## Troubleshooting

Common issues and solutions:

1. **Invalid token errors**: Ensure your token has the required permissions and hasn't expired
2. **Rate limit errors**: Implement backoff and retry logic
3. **Permission errors**: Check your app's permissions in the Facebook Developer Dashboard
4. **API version issues**: Ensure you're using a supported API version

## Sandbox Testing

For testing without affecting real pages:

1. Create a test app in the Facebook Developer Dashboard
2. Use test users and test pages
3. Implement integration tests using the sandbox environment 