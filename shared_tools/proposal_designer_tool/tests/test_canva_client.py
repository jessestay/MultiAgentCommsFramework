# Test cases for canva_client.py
import pytest
import time
from unittest.mock import patch, MagicMock
import requests
import os
import json # For mock config writing

# Adjusted import path for the new shared location
from ..canva_client import CanvaClient, CANVA_API_BASE_URL
# get_authenticated_token will be patched where it's used by CanvaClient

# --- Mock API Responses ---
@pytest.fixture
def mock_api_job_creation_success():
    return {"job_id": "mock_job_123", "status": "PROCESSING"}

@pytest.fixture
def mock_api_job_status_processing():
    return {"job_id": "mock_job_123", "status": "PROCESSING"}

@pytest.fixture
def mock_api_job_status_success_import():
    return {
        "job_id": "mock_job_123", 
        "status": "SUCCESS", 
        "result": {"design_id": "mock_design_abc"}
    }

@pytest.fixture
def mock_api_job_status_success_export():
    return {
        "job_id": "mock_job_123", 
        "status": "SUCCESS", 
        "result": {"download_url": "https://example.com/mock_download.pdf"}
    }

@pytest.fixture
def mock_api_job_status_failure():
    return {
        "job_id": "mock_job_123", 
        "status": "FAILURE", 
        "result": {"error_code": "SOME_ERROR", "message": "Something went wrong"}
    }

@pytest.fixture
def mock_api_error_response():
    return {"error": "invalid_request", "message": "Your request was bad."}

# --- Fixtures for CanvaClient Instantiation and Mocks ---

@pytest.fixture
def mock_config_data():
    """Provides default mock config data for instantiating CanvaClient."""
    return {
        "client_id": "test_client_id_for_client",
        "client_secret": "test_client_secret_for_client",
        "redirect_uri": "http://localhost:8000/client_callback",
        "token_cache_path": ".canva_token_cache_client_test.json",
        "config_refresh_token": "client_refresh_token_from_config"
    }

@pytest.fixture
def canva_client_instance(mock_config_data):
    """Instantiates CanvaClient with mocked config data and patched get_authenticated_token."""
    with patch('.cursor.shared_tools.proposal_designer_tool.canva_client.get_authenticated_token', return_value="mock_access_token") as _mocked_get_token:
        client = CanvaClient(**mock_config_data)
        # Ensure the token is set if _ensure_token_is_valid was called implicitly or explicitly
        # For many tests, client.access_token will be set by the mocked get_authenticated_token
        # If a method being tested calls _ensure_token_is_valid itself, the patch will cover it.
        client.access_token = "mock_access_token" # Explicitly set for clarity in tests
        yield client # Use yield if cleanup is needed, otherwise return client
    
    # Cleanup token cache if created by tests
    cache_path_to_clean = mock_config_data['token_cache_path']
    # Construct path relative to a known location if necessary, e.g., if it's just a filename
    # For now, assume it might be created in CWD by tests if not absolute.
    # A better way is for tests to use tmp_path for such cache files.
    if os.path.exists(cache_path_to_clean):
        try:
            os.remove(cache_path_to_clean)
        except OSError:
            pass # Ignore if it can't be removed (e.g. by another test using tmp_path)

# --- Import Job Tests --- 
@patch('requests.post')
def test_create_design_import_job_success(mock_post, canva_client_instance, mock_api_job_creation_success, tmp_path):
    mock_post.return_value.status_code = 200
    mock_post.return_value.json.return_value = mock_api_job_creation_success

    dummy_file_path = tmp_path / "dummy_proposal.pdf"
    with open(dummy_file_path, 'wb') as f:
        f.write(b"dummy pdf content")

    job = canva_client_instance.create_design_import_job(str(dummy_file_path), "application/pdf", "My Test Proposal")
    
    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert f"{CANVA_API_BASE_URL}/imports" in args[0]
    assert "files" in kwargs
    assert "title" in kwargs["data"]
    assert kwargs["data"]["title"] == "My Test Proposal"

    assert job["job_id"] == "mock_job_123"
    assert job["status"] == "PROCESSING"
    # dummy_file_path cleanup is handled by tmp_path

@patch('requests.post')
def test_create_design_import_job_api_error(mock_post, canva_client_instance, mock_api_error_response, tmp_path):
    mock_post.return_value.status_code = 400
    mock_post.return_value.json.return_value = mock_api_error_response
    mock_post.return_value.raise_for_status.side_effect = requests.exceptions.HTTPError("API Error")

    dummy_file_path = tmp_path / "dummy_proposal.pdf"
    with open(dummy_file_path, 'wb') as f:
        f.write(b"dummy pdf content")

    result = canva_client_instance.create_design_import_job(str(dummy_file_path), "application/pdf", "My Test Proposal")
    assert result["error"] == "API request failed"
    # dummy_file_path cleanup is handled by tmp_path

@patch('requests.get')
def test_poll_job_status_import_success(mock_get, canva_client_instance, mock_api_job_status_processing, mock_api_job_status_success_import):
    mock_get.side_effect = [
        MagicMock(status_code=200, json=lambda: mock_api_job_status_processing),
        MagicMock(status_code=200, json=lambda: mock_api_job_status_success_import)
    ]

    final_status = canva_client_instance.poll_job_status("mock_job_123", "imports", poll_interval=0.01) 
    
    assert mock_get.call_count == 2
    assert final_status["status"] == "SUCCESS"
    assert final_status["result"]["design_id"] == "mock_design_abc"

# --- Export Job Tests --- 
@patch('requests.post')
def test_create_design_export_job_success(mock_post, canva_client_instance, mock_api_job_creation_success):
    mock_post.return_value.status_code = 200
    mock_post.return_value.json.return_value = mock_api_job_creation_success

    job = canva_client_instance.create_design_export_job("mock_design_abc", "pdf")

    expected_headers = canva_client_instance._get_auth_headers()
    expected_headers['Content-Type'] = 'application/json'

    mock_post.assert_called_once_with(
        f"{CANVA_API_BASE_URL}/exports",
        headers=expected_headers,
        json={"design_id": "mock_design_abc", "export_format": "pdf"}
    )
    assert job["job_id"] == "mock_job_123"
    assert job["status"] == "PROCESSING"

@patch('requests.get')
def test_poll_job_status_export_success(mock_get, canva_client_instance, mock_api_job_status_processing, mock_api_job_status_success_export):
    mock_get.side_effect = [
        MagicMock(status_code=200, json=lambda: mock_api_job_status_processing),
        MagicMock(status_code=200, json=lambda: mock_api_job_status_success_export)
    ]

    final_status = canva_client_instance.poll_job_status("mock_job_123", "exports", poll_interval=0.01)

    assert mock_get.call_count == 2
    assert final_status["status"] == "SUCCESS"
    assert final_status["result"]["download_url"] == "https://example.com/mock_download.pdf"

@patch('requests.get')
def test_download_file_success(mock_get, canva_client_instance, tmp_path):
    mock_get.return_value.status_code = 200
    mock_get.return_value.iter_content.return_value = [b"mock file content"]
    mock_get.return_value.raise_for_status = MagicMock()

    output_path = tmp_path / "test_downloaded_file.pdf"
    success = canva_client_instance.download_file("https://example.com/mock_download.pdf", str(output_path))

    assert success is True
    mock_get.assert_called_once_with("https://example.com/mock_download.pdf", stream=True)
    assert os.path.exists(output_path)
    with open(output_path, 'rb') as f:
        assert f.read() == b"mock file content"
    # tmp_path handles cleanup

@patch('requests.get')
def test_download_file_failure(mock_get, canva_client_instance, tmp_path):
    mock_get.return_value.status_code = 404
    mock_get.return_value.raise_for_status.side_effect = requests.exceptions.HTTPError("Download Error")

    output_path = tmp_path / "test_downloaded_file_fail.pdf"
    success = canva_client_instance.download_file("https://example.com/nonexistent.pdf", str(output_path))

    assert success is False
    assert not os.path.exists(output_path)

# --- Autofill Job Tests ---
@patch('requests.post')
def test_create_autofill_job_success(mock_post, canva_client_instance, mock_api_job_creation_success):
    mock_post.return_value.status_code = 200
    mock_post.return_value.json.return_value = mock_api_job_creation_success # Using same job creation for simplicity

    brand_template_id = "tpl_abc123"
    autofill_data = {"text_field_name": "Hello World"}
    
    result = canva_client_instance.create_autofill_job(brand_template_id, autofill_data)
    
    expected_headers = canva_client_instance._get_auth_headers()
    expected_headers['Content-Type'] = 'application/json'

    mock_post.assert_called_once_with(
        f"{CANVA_API_BASE_URL}/brand-templates/{brand_template_id}/autofills",
        headers=expected_headers,
        json={"data": autofill_data}
    )
    assert result["job_id"] == "mock_job_123"

@patch('requests.post')
def test_create_autofill_job_api_error(mock_post, canva_client_instance, mock_api_error_response):
    mock_post.return_value.status_code = 400
    mock_post.return_value.json.return_value = mock_api_error_response
    mock_post.return_value.raise_for_status.side_effect = requests.exceptions.HTTPError("API Error")

    brand_template_id = "tpl_abc123"
    autofill_data = {"text_field_name": "Hello World"}

    result = canva_client_instance.create_autofill_job(brand_template_id, autofill_data)
    assert result["error"] == "API request failed"

# Test for auth failure within CanvaClient if get_authenticated_token returns None
@patch('.cursor.shared_tools.proposal_designer_tool.canva_client.get_authenticated_token', return_value=None)
def test_client_auth_failure_on_method_call(mock_get_auth_token_none, mock_config_data):
    # Instantiate client with config; get_authenticated_token is patched to return None
    client_with_auth_fail = CanvaClient(**mock_config_data)
    
    brand_template_id = "tpl_abc123"
    autofill_data = {"text_field_name": "Hello World"}
    
    # Any method that calls _ensure_token_is_valid should raise an exception
    with pytest.raises(Exception) as excinfo:
        client_with_auth_fail.create_autofill_job(brand_template_id, autofill_data)
    assert "Failed to obtain Canva access token" in str(excinfo.value)

    with pytest.raises(Exception) as excinfo_import:
        client_with_auth_fail.create_design_import_job("dummy.pdf", "application/pdf", "title")
    assert "Failed to obtain Canva access token" in str(excinfo_import.value)

# --- Tests for get_job_status and poll_job_status with 'autofills' type ---
@patch('requests.get')
def test_get_job_status_autofill_success(mock_get, canva_client_instance):
    job_id = "autofill_job_xyz"
    expected_response = {"job_id": job_id, "status": "SUCCESS", "result": {"design_id": "design_final_id"}}
    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = expected_response
    mock_get.return_value.raise_for_status = MagicMock()

    result = canva_client_instance.get_job_status(job_id, "autofills")

    mock_get.assert_called_once_with(
        f"{CANVA_API_BASE_URL}/autofills/{job_id}",
        headers=canva_client_instance._get_auth_headers()
    )
    assert result == expected_response

@patch.object(CanvaClient, 'get_job_status') # Patching the method on the class itself
def test_poll_job_status_autofill(mock_get_job_status_method, mock_config_data):
    # Instantiate client here as the patch is on the class method
    # Need to ensure get_authenticated_token is also handled for this instance if methods call it.
    with patch('.cursor.shared_tools.proposal_designer_tool.canva_client.get_authenticated_token', return_value="mock_access_token") as _mocked_get_token:
        client = CanvaClient(**mock_config_data)
        client.access_token = "mock_access_token"

        job_id = "autofill_poll_job"
        processing_response = {"job_id": job_id, "status": "PROCESSING"}
        success_response = {"job_id": job_id, "status": "SUCCESS", "result": {"design_id": "design_poll_success"}}

        mock_get_job_status_method.side_effect = [processing_response, success_response]

        final_status = client.poll_job_status(job_id, "autofills", poll_interval=0.01, timeout_seconds=1)

        assert mock_get_job_status_method.call_count == 2
        mock_get_job_status_method.assert_any_call(job_id, "autofills")
        assert final_status == success_response

``` 