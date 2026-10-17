#!/usr/bin/env python3
"""
Setup script for OAuth credentials.

This script guides the user through the OAuth authentication process
to obtain credentials for accessing Google Calendar and Tasks APIs.
"""

import os
import sys
import json
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading
import time
from pathlib import Path

# Add the parent directory to the path so we can import our modules
sys.path.append(str(Path(__file__).resolve().parent.parent))

from calendar_integration.auth.oauth import GoogleOAuth
from calendar_integration.auth.token_storage import TokenStorage


class OAuthCallbackHandler(BaseHTTPRequestHandler):
    """HTTP request handler for OAuth callback."""
    
    def do_GET(self):
        """Handle GET requests to the callback URL."""
        # Parse the URL and extract the authorization code
        query_components = parse_qs(urlparse(self.path).query)
        
        if 'code' in query_components:
            # Store the authorization code in the server instance
            self.server.authorization_code = query_components['code'][0]
            
            # Send a success response to the user
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            
            response_content = """
            <html>
            <head><title>Authentication Successful</title></head>
            <body>
                <h1>Authentication Successful</h1>
                <p>You have successfully authenticated with Google. You can close this window now.</p>
            </body>
            </html>
            """
            self.wfile.write(response_content.encode())
        else:
            # Send an error response if no code was received
            self.send_response(400)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            
            response_content = """
            <html>
            <head><title>Authentication Failed</title></head>
            <body>
                <h1>Authentication Failed</h1>
                <p>No authorization code was received. Please try again.</p>
            </body>
            </html>
            """
            self.wfile.write(response_content.encode())
            
    def log_message(self, format, *args):
        """Suppress log messages."""
        return


def start_callback_server(port=8080):
    """
    Start a local HTTP server to handle the OAuth callback.
    
    Args:
        port: The port to listen on. Default is 8080.
        
    Returns:
        A tuple containing the server instance and a threading.Event to signal when to stop the server.
    """
    # Create a server instance
    server = HTTPServer(('localhost', port), OAuthCallbackHandler)
    server.authorization_code = None
    
    # Create an event to signal when to stop the server
    stop_event = threading.Event()
    
    # Start the server in a separate thread
    def run_server():
        while not stop_event.is_set():
            server.handle_request()
    
    server_thread = threading.Thread(target=run_server)
    server_thread.daemon = True
    server_thread.start()
    
    return server, stop_event


def load_env_variables():
    """
    Load environment variables from .env file.
    
    Returns:
        True if the environment variables were loaded successfully, False otherwise.
    """
    env_path = Path(__file__).resolve().parent.parent / '.env'
    
    if not env_path.exists():
        print(f"Error: .env file not found at {env_path}")
        return False
        
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
                
            key, value = line.split('=', 1)
            os.environ[key] = value
            
    return True


def main():
    """Main function to set up OAuth credentials."""
    print("=== Google Calendar & Tasks API Credentials Setup ===")
    
    # Load environment variables
    if not load_env_variables():
        print("Please create a .env file with the required environment variables.")
        print("See .env.example for the required variables.")
        return
        
    # Check if required environment variables are set
    required_vars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']
    missing_vars = [var for var in required_vars if not os.environ.get(var)]
    
    if missing_vars:
        print(f"Error: The following environment variables are missing: {', '.join(missing_vars)}")
        print("Please set these variables in the .env file.")
        return
        
    # Create OAuth instance
    oauth = GoogleOAuth()
    
    # Get the authorization URL
    auth_url = oauth.get_authorization_url()
    
    # Start the callback server
    redirect_uri = os.environ.get('GOOGLE_REDIRECT_URI')
    port = int(urlparse(redirect_uri).port or 8080)
    server, stop_event = start_callback_server(port)
    
    # Open the authorization URL in the default browser
    print(f"Opening browser to authorize access to Google Calendar and Tasks APIs...")
    webbrowser.open(auth_url)
    
    # Wait for the authorization code
    print("Waiting for authorization...")
    max_wait_time = 300  # 5 minutes
    start_time = time.time()
    
    while server.authorization_code is None:
        if time.time() - start_time > max_wait_time:
            print("Timeout waiting for authorization.")
            stop_event.set()
            return
            
        time.sleep(1)
        
    # Stop the server
    stop_event.set()
    
    # Exchange the authorization code for tokens
    print("Exchanging authorization code for tokens...")
    credentials = oauth.exchange_code_for_token(server.authorization_code)
    
    # Store the tokens
    token_storage = TokenStorage()
    user_id = 'default'  # You can use a specific user ID if needed
    
    token_data = oauth.credentials_to_dict()
    if token_storage.save_token(user_id, token_data):
        print(f"Credentials saved successfully for user '{user_id}'.")
    else:
        print("Error saving credentials.")
        return
        
    # Test the credentials
    print("Testing credentials...")
    
    try:
        # Import here to avoid circular imports
        from calendar_integration.services.calendar_service import CalendarService
        from calendar_integration.services.task_service import TaskService
        
        # Test Calendar API
        calendar_service = CalendarService(credentials=credentials)
        calendars = calendar_service.get_calendar_list()
        print(f"Successfully retrieved {len(calendars)} calendars.")
        
        # Test Tasks API
        task_service = TaskService(credentials=credentials)
        task_lists = task_service.get_task_lists()
        print(f"Successfully retrieved {len(task_lists)} task lists.")
        
        print("Credentials are working correctly!")
        
    except Exception as e:
        print(f"Error testing credentials: {e}")
        return
        
    print("Setup completed successfully!")


if __name__ == "__main__":
    main() 