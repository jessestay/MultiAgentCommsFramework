import time
import json
from google.oauth2 import service_account
import requests

# Path to your service account key file
SERVICE_ACCOUNT_FILE = 'path/to/your-service-account-key.json'
USER_EMAIL = 'your-email@your-domain.com'  # The email you want to access

# Load the service account key
with open(SERVICE_ACCOUNT_FILE, 'r') as f:
    service_account_info = json.load(f)

# Create credentials
credentials = service_account.Credentials.from_service_account_info(
    service_account_info, 
    scopes=['https://www.googleapis.com/auth/gmail.readonly'],
    subject=USER_EMAIL  # Delegate to this user
)

# Get the access token
token = credentials.token
expiry = credentials.expiry

print(f"Access Token: {token}")
print(f"Expires at: {expiry}")

# Save token to file for use in curl or other tools
with open('gmail_token.txt', 'w') as f:
    f.write(token)

print(f"Token saved to gmail_token.txt")
