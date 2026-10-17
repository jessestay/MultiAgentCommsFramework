import requests
import json

class CanvaClient:
    def __init__(self, access_token):
        self.access_token = access_token

    def _ensure_authenticated(self):
        if not self.access_token:
            raise Exception("Authentication failed: Access token is not set")

    def download_file(self, url: str, local_path: str) -> bool:
        """
        Downloads a file from the given URL and saves it to the specified local path.

        Args:
            url: The URL of the file to download.
            local_path: The local path where the file should be saved.

        Returns:
            True if the file was successfully downloaded, False otherwise.
        """
        self._ensure_authenticated()
        if not self.access_token:
            return False

        try:
            response = requests.get(url, headers={"Authorization": f"Bearer {self.access_token}"})
            response.raise_for_status()  # Raises an HTTPError for bad responses (4XX or 5XX)
            with open(local_path, 'wb') as f:
                f.write(response.content)
            return True
        except requests.exceptions.RequestException as e:
            print(f"Error in download_file: {e}")
            return False

    def create_autofill_job(self, brand_template_id: str, data: dict) -> dict:
        """
        Creates a new design by populating a Brand Template with data.

        Args:
            brand_template_id: The ID of the Brand Template to use.
            data: A dictionary where keys are merge field names (data tags)
                  in the template and values are the content to fill in.

        Returns:
            A dictionary containing the job_id and status, or error details.
        """
        self._ensure_authenticated()
        if not self.access_token:
            return {"error": "Authentication failed", "details": "Could not obtain access token."}

        url = f"{CANVA_API_BASE_URL}/brand-templates/{brand_template_id}/autofills"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "data": data,
            # "export_options": {} # Optional: specify export options if needed immediately
        }

        # print(f"Attempting to create autofill job for template ID: {brand_template_id} with data: {json.dumps(data, indent=2)}") # For debugging

        try:
            response = requests.post(url, headers=headers, json=payload)
            response.raise_for_status()  # Raises an HTTPError for bad responses (4XX or 5XX)
            return response.json()
        except requests.exceptions.RequestException as e:
            error_details = f"API request failed: {e}"
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_details += f" - Response: {e.response.text}"
                except Exception:
                    pass # Ignore if response text isn't available
            print(f"Error in create_autofill_job: {error_details}")
            return {"error": "API request failed", "details": error_details} 