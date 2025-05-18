"""
Manages OAuth 2.0 PKCE authentication flow for the Canva API.
"""
import os
import hashlib
import base64
import secrets # For cryptographically strong random numbers
import requests
import json
from urllib.parse import urlencode

# Construct TOKEN_FILE path relative to this script\'s location
_MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(_MODULE_DIR, ".canva_token_cache.json")
# SECRETS_FILE = ".secrets/canva.provider" # This will be handled by config.json now

# Configuration will be loaded from config.json by CanvaClient or main script
# CLIENT_ID = None 
# CLIENT_SECRET = None
# REDIRECT_URI = None

CANVA_AUTH_URL = "https://www.canva.com/api/oauth/authorize"
CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token"

DEFAULT_SCOPES = "design:content:read design:content:write folder:read asset:read" # Add other necessary scopes

# Secrets (client_id, client_secret, redirect_uri) will be passed in from CanvaClient
# which loads them from config.json

def generate_pkce_codes(length=64):
    """Generates a PKCE code_verifier and code_challenge."""
    if not (43 <= length <= 96): 
        raise ValueError("Effective verifier length for secrets.token_urlsafe must be managed carefully. Input `length` is for raw bytes.")
    
    code_verifier = secrets.token_urlsafe(length) 
    
    code_challenge = hashlib.sha256(code_verifier.encode(\'utf-8\')).digest()
    code_challenge = base64.urlsafe_b64encode(code_challenge).decode(\'utf-8\').rstrip("=")
    return code_verifier, code_challenge

def get_authorization_url(client_id, redirect_uri, scope, code_challenge, state):
    """Constructs the Canva authorization URL."""
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scope,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state
    }
    return f"{CANVA_AUTH_URL}?{urlencode(params)}"

def get_access_token(client_id, client_secret, code, code_verifier, redirect_uri):
    """Exchanges an authorization code for an access token."""
    payload = {
        \'grant_type\': \'authorization_code\',
        \'code\': code,
        \'code_verifier\': code_verifier,
        \'redirect_uri\': redirect_uri,
    }
    auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode(\'utf-8\')).decode(\'utf-8\')
    headers = {
        \'Authorization\': f\'Basic {auth_header}\',
        \'Content-Type\': \'application/x-www-form-urlencoded\'
    }
    try:
        response = requests.post(CANVA_TOKEN_URL, data=payload, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error requesting access token: {e}")
        if hasattr(e, \'response\') and e.response is not None:
            try:
                print(f"API Error Response: {e.response.json()}")
            except json.JSONDecodeError:
                print(f"API Error Response (not JSON): {e.response.text}")
        return None

def refresh_access_token(client_id, client_secret, refresh_token_value):
    """Refreshes an access token using a refresh token."""
    payload = {
        \'grant_type\': \'refresh_token\',
        \'refresh_token\': refresh_token_value,
    }
    auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode(\'utf-8\')).decode(\'utf-8\')
    headers = {
        \'Authorization\': f\'Basic {auth_header}\',
        \'Content-Type\': \'application/x-www-form-urlencoded\'
    }
    try:
        response = requests.post(CANVA_TOKEN_URL, data=payload, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error refreshing access token: {e}")
        if hasattr(e, \'response\') and e.response is not None:
            try:
                print(f"API Error Response: {e.response.json()}")
            except json.JSONDecodeError:
                print(f"API Error Response (not JSON): {e.response.text}")
        return None

def save_token(token_data, token_cache_path=TOKEN_FILE):
    """Saves token data to a specified file path."""
    dir_name = os.path.dirname(token_cache_path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
    with open(token_cache_path, \'w\') as f:
        json.dump(token_data, f)
    print(f"Token saved to {token_cache_path}")

def load_token(token_cache_path=TOKEN_FILE):
    """Loads token data from a specified cache file path."""
    if os.path.exists(token_cache_path):
        try:
            with open(token_cache_path, \'r\') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError): # More specific error handling
            print(f"Warning: Could not load or parse token file at {token_cache_path}.")
            return None
    return None

def get_authenticated_token(client_id, client_secret, redirect_uri, token_cache_path, refresh_token_from_config=None, test_auth_code_full_url: str = None):
    """
    Manages obtaining a valid access token, using cache or full auth flow.
    Secrets (client_id, client_secret, redirect_uri) are passed in.
    Token cache path is also passed in.
    Optional refresh_token_from_config allows using a pre-configured refresh token.
    """
    token_data = load_token(token_cache_path)

    if token_data and \'refresh_token\' in token_data:
        print("Attempting to refresh token from cache...")
        refreshed_token_data = refresh_access_token(client_id, client_secret, token_data[\'refresh_token\'])
        if refreshed_token_data and \'access_token\' in refreshed_token_data:
            save_token(refreshed_token_data, token_cache_path)
            print("Token refreshed successfully from cache.")
            return refreshed_token_data[\'access_token\']
        else:
            print("Failed to refresh token from cache.")
            # Fall through to try config refresh token or full auth
    
    if refresh_token_from_config:
        print(f"Attempting to refresh token using refresh_token from configuration...")
        refreshed_data_from_config = refresh_access_token(client_id, client_secret, refresh_token_from_config)
        if refreshed_data_from_config and \'access_token\' in refreshed_data_from_config:
            save_token(refreshed_data_from_config, token_cache_path) 
            print(f"Token refreshed successfully using configuration.")
            return refreshed_data_from_config[\'access_token\']
        else:
            print(f"Failed to refresh token using configuration refresh token.")
            # Fall through to full auth if this fails

    print("Starting new authentication flow...")
    code_verifier, code_challenge = generate_pkce_codes(length=64)
    state = secrets.token_urlsafe(16)

    auth_url = get_authorization_url(client_id, redirect_uri, DEFAULT_SCOPES, code_challenge, state)
    print("\\n---------------------------------------------------------------------")
    print("ACTION REQUIRED: Please open the following URL in your browser to authorize:")
    print(auth_url)
    print("---------------------------------------------------------------------\\n")
    
    auth_code_input = ""
    if test_auth_code_full_url:
        auth_code_input = test_auth_code_full_url
        print(f"(Using provided test auth code URL: {auth_code_input})")
    else:
        auth_code_input = input("Paste the full redirect URL here after authorization (or just the authorization code): ")
    
    from urllib.parse import urlparse, parse_qs
    parsed_url = urlparse(auth_code_input)
    query_params = parse_qs(parsed_url.query)
    
    auth_code = query_params.get(\'code\', [None])[0]
    if not auth_code: # If \'code\' param not found, assume entire input was the code
        auth_code = auth_code_input.strip()

    returned_state = query_params.get(\'state\', [None])[0]
    if \'code\' in query_params and state != returned_state : # Only check state if it was part of a URL redirect
        print("Error: State mismatch. Potential CSRF attack. Aborting.")
        return None

    new_token_data = get_access_token(client_id, client_secret, auth_code, code_verifier, redirect_uri)
    if new_token_data and \'access_token\' in new_token_data:
        save_token(new_token_data, token_cache_path)
        print("Authentication successful. Token obtained.")
        return new_token_data[\'access_token\']
    else:
        print("Authentication failed.")
        return None

# Example usage (for direct testing, typically commented out or removed in production module)
# if __name__ == \'__main__\':
#     print("Testing Canva Authentication Flow (requires config.json)...")
#     
#     # This part would need a mechanism to load client_id, client_secret, redirect_uri, and token_cache_path
#     # For example, from a temporary config.json or environment variables for testing the module directly.
#     # This is simplified and assumes you\'d set these up if running this block.
#     
#     # Placeholder - In a real test, load these from a test config or mock
#     try:
#         with open(os.path.join(_MODULE_DIR, \'config.json\'), \'r\') as f:
#             config = json.load(f)
#         test_client_id = config.get(\'canva_client_id\')
#         test_client_secret = config.get(\'canva_client_secret\')
#         test_redirect_uri = config.get(\'redirect_uri\')
#         test_token_cache = os.path.join(_MODULE_DIR, config.get(\'canva_token_cache_path\', \'.canva_token_cache.json\'))
#         test_refresh_token = config.get(\'canva_refresh_token\') # Optional refresh token from config
#         
#         if not all([test_client_id, test_client_secret, test_redirect_uri]):
#             print("Error: Missing client_id, client_secret, or redirect_uri in config.json for __main__ test.")
#         else:
#             access_token = get_authenticated_token(
#                 client_id=test_client_id,
#                 client_secret=test_client_secret,
#                 redirect_uri=test_redirect_uri,
#                 token_cache_path=test_token_cache,
#                 refresh_token_from_config=test_refresh_token
#             )
#             if access_token:
#                 print(f"Access Token obtained: {access_token[:30]}...") # Print part of the token
#             else:
#                 print("Failed to obtain access token in __main__ test.")
#                 
#     except FileNotFoundError:
#         print(f"Ensure config.json exists in {_MODULE_DIR} for __main__ test block with necessary Canva credentials.")
#     except Exception as e:
#         print(f"Error during __main__ test block: {e}") 