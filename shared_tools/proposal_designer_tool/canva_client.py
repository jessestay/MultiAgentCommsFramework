"""
Client for interacting with the Canva API.

Handles API calls for design import, export, and status polling.
Relies on canva_auth.py for authentication.
"""
import requests
import time
import os
import json

# Adjusted import path for the new shared location
from .canva_auth import get_authenticated_token 

CANVA_API_BASE_URL = "https://api.canva.com/rest/v1"

class CanvaClient:
    def __init__(self, client_id=None, client_secret=None, redirect_uri=None, token_cache_path=None, config_refresh_token=None):
        """
        Initializes the CanvaClient.
        Credentials and paths are passed in, typically loaded from a config file by the calling script.
        """
        self.access_token = None
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.token_cache_path = token_cache_path or os.path.join(os.path.dirname(os.path.abspath(__file__)), ".canva_token_cache.json")
        self.config_refresh_token = config_refresh_token # For refresh token from config

    def _ensure_authenticated(self):
        """Ensures a valid access token is available, fetching if necessary."""
        if not self.access_token:
            if not all([self.client_id, self.client_secret, self.redirect_uri]):
                raise ValueError("Client ID, Client Secret, and Redirect URI must be configured before authentication.")
            
            self.access_token = get_authenticated_token(
                client_id=self.client_id,
                client_secret=self.client_secret,
                redirect_uri=self.redirect_uri,
                token_cache_path=self.token_cache_path,
                refresh_token_from_config=self.config_refresh_token
            )
            if not self.access_token:
                raise Exception("Failed to obtain Canva access token.")

    def _get_auth_headers(self):
        """Returns standard authorization headers for Canva API calls."""
        self._ensure_authenticated() # Ensures token is fetched if not present
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json"
        }

    def create_design_import_job(self, file_path, mime_type, title):
        """Starts a job to import a design (PDF, DOCX) into Canva."""
        self._ensure_authenticated()
        url = f"{CANVA_API_BASE_URL}/imports"
        headers = self._get_auth_headers()
        
        try:
            with open(file_path, \'rb\') as f:
                files = {
                    \'file\': (os.path.basename(file_path), f, mime_type)
                }
                data = {
                    \'title\': title
                }
                response = requests.post(url, headers=headers, files=files, data=data)
                response.raise_for_status()
                return response.json()
        except FileNotFoundError:
            print(f"Error: Input file not found at {file_path}")
            return None
        except requests.exceptions.RequestException as e:
            print(f"Error creating import job: {e}")
            error_details = {"error": "API request failed", "details": str(e)}
            if hasattr(e, \'response\') and e.response is not None:
                try:
                    error_details["api_response"] = e.response.json()
                except requests.exceptions.JSONDecodeError:
                    error_details["api_response_text"] = e.response.text
                error_details["status_code"] = e.response.status_code
            return error_details

    def create_design_export_job(self, design_id, export_format="pdf"):
        """Starts a job to export an existing Canva design."""
        self._ensure_authenticated()
        url = f"{CANVA_API_BASE_URL}/exports"
        headers = self._get_auth_headers()
        headers[\'Content-Type\'] = \'application/json\'
        
        payload = {
            "design_id": design_id,
            "format": {
                "type": export_format
            }
        }
        try:
            response = requests.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error creating export job: {e}")
            error_details = {"error": "API request failed", "details": str(e)}
            if hasattr(e, \'response\') and e.response is not None:
                try:
                    error_details["api_response"] = e.response.json()
                except requests.exceptions.JSONDecodeError:
                    error_details["api_response_text"] = e.response.text
                error_details["status_code"] = e.response.status_code
            return error_details

    def get_job_status(self, job_id, job_type):
        """Gets the status of an import, export, or autofill job."""
        self._ensure_authenticated()
        valid_job_types = ["imports", "exports", "autofills"]
        if job_type not in valid_job_types:
            raise ValueError(f"job_type must be one of {valid_job_types}")
        
        url = f"{CANVA_API_BASE_URL}/{job_type}/{job_id}"
        headers = self._get_auth_headers()
        try:
            response = requests.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error getting {job_type} job status for {job_id}: {e}")
            error_details = {"error": "API request failed", "details": str(e)}
            if hasattr(e, \'response\') and e.response is not None:
                try:
                    error_details["api_response"] = e.response.json()
                except requests.exceptions.JSONDecodeError:
                    error_details["api_response_text"] = e.response.text
                error_details["status_code"] = e.response.status_code
            return error_details

    def poll_job_status(self, job_id, job_type, poll_interval=5, max_attempts=24):
        """Polls the job status until it completes or fails."""
        print(f"Polling {job_type} job {job_id} for completion...")
        attempts = 0
        last_response = None
        while attempts < max_attempts:
            api_response = self.get_job_status(job_id, job_type)
            last_response = api_response # Keep track of the last response
            
            if api_response is None or api_response.get("error"): # Indicates API call failure or error structure from get_job_status
                print(f"API call to get status for job {job_id} failed or returned error. Response: {api_response}. Stopping poll.")
                return api_response 

            job_details = api_response.get("job")
            if not job_details or not isinstance(job_details, dict):
                print(f"Unexpected response structure for job {job_id}: \'job\' key missing or not a dict. Response: {api_response}")
                return api_response

            status = job_details.get("status")
            print(f"Job {job_id} status: {status} (Attempt {attempts + 1}/{max_attempts})")

            if status == "success":
                print(f"Job {job_id} completed successfully.")
                return api_response
            elif status == "failed":
                print(f"Job {job_id} failed.")
                if "error" in job_details:
                    print(f"Error details: {json.dumps(job_details[\'error\'], indent=2)}")
                return api_response
            
            pending_statuses = ["in_progress", "processing", "pending"]
            if status not in pending_statuses:
                 print(f"Job {job_id} has an unexpected or terminal status: {status}. Stopping poll.")
                 return api_response

            time.sleep(poll_interval)
            attempts += 1
        
        print(f"Max polling attempts reached for job {job_id}. Last known response: {last_response}")
        return last_response

    def download_file(self, download_url, output_path):
        """Downloads a file from a URL to the specified output path."""
        print(f"Downloading file from {download_url} to {output_path}...")
        try:
            response = requests.get(download_url, stream=True)
            response.raise_for_status()
            # Ensure directory exists before writing
            output_dir = os.path.dirname(output_path)
            if output_dir: # Only create if dirname is not empty (e.g. not saving to root)
                os.makedirs(output_dir, exist_ok=True)
            
            with open(output_path, \'wb\') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            print(f"File downloaded successfully to {output_path}.")
            return True
        except requests.exceptions.RequestException as e:
            print(f"Error downloading file: {e}")
            if hasattr(e, \'response\') and e.response is not None:
                 print(f"API Error Response (status {e.response.status_code}): {e.response.text}")
            return False
        except IOError as e:
            print(f"Error saving downloaded file to {output_path}: {e}")
            return False

    def create_autofill_job(self, brand_template_id: str, data: dict, title: str = None) -> dict:
        """Creates an asynchronous job to autofill a design from a brand template."""
        self._ensure_authenticated()
        endpoint = f"{CANVA_API_BASE_URL}/autofills"
        
        payload = {
            "brand_template_id": brand_template_id,
            "data": data
        }
        if title:
            payload["title"] = title

        print(f"Attempting to create autofill job for template ID: {brand_template_id} at endpoint {endpoint}")
        headers = self._get_auth_headers()
        headers[\'Content-Type\'] = \'application/json\' # Autofill API expects JSON payload
        try:
            response = requests.post(endpoint, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            error_details = {"error": "API request failed", "details": str(e)}
            if hasattr(e, \'response\') and e.response is not None:
                try:
                    error_details["api_response"] = e.response.json()
                except requests.exceptions.JSONDecodeError:
                    error_details["api_response_text"] = e.response.text
                error_details["status_code"] = e.response.status_code
            print(f"Error in create_autofill_job: {json.dumps(error_details, indent=2)}")
            return error_details

# Example main block for testing (typically removed or heavily conditionalized in a library)
# if __name__ == \'__main__\':
#     print("Testing Canva Client (requires config.json setup)...")
# 
#     # This requires a config.json in the same directory as this client for direct execution test
#     # with canva_client_id, canva_client_secret, redirect_uri, canva_token_cache_path
#     # and optionally canva_refresh_token.
#     try:
#         script_dir = os.path.dirname(os.path.abspath(__file__))
#         config_path = os.path.join(script_dir, \'config.json\') # Expect config.json here for test
#         with open(config_path, \'r\') as f:
#             config = json.load(f)
#         
#         client = CanvaClient(
#             client_id=config.get(\'canva_client_id\'),
#             client_secret=config.get(\'canva_client_secret\'),
#             redirect_uri=config.get(\'redirect_uri\'),
#             token_cache_path=os.path.join(script_dir, config.get(\'canva_token_cache_path\', \'.canva_token_cache.json\')),
#             config_refresh_token=config.get(\'canva_refresh_token\')
#         )
#         client._ensure_authenticated()
#         print(f"Client authenticated. Access token: {client.access_token[:30]}...")
# 
#         # Further test calls like create_autofill_job etc. would require a valid brand_template_id
#         # and data from the config or hardcoded for a test.
#         # Example (requires brand_template_id in config):
#         # test_brand_template_id = config.get(\'canva_brand_template_id\')
#         # if test_brand_template_id:
#         #     test_data = { \"text_field_name\": {\"type\": \"text\", \"text\": \"Hello from Client Test\"} }
#         #     autofill_response = client.create_autofill_job(test_brand_template_id, test_data, \"Test Autofill\")
#         #     print(f"Autofill Job Creation Response: {json.dumps(autofill_response, indent=2)}")
#         # else:
#         #     print("Skipping autofill test as canva_brand_template_id not in config.json")
# 
#     except FileNotFoundError:
#         print(f"Ensure config.json exists at {config_path} with necessary Canva credentials for __main__ test block.")
#     except ValueError as ve:
#         print(f"ValueError during __main__ test (e.g. missing config): {ve}")
#     except Exception as e:
#         print(f"An unexpected error occurred during __main__ test block: {e}") 