# Test cases for canva_auth.py
import pytest
import hashlib
import base64
import re
from unittest.mock import patch, mock_open, MagicMock
import os
import json # Added for writing mock config

# Adjusted import path for the new shared location
from ..canva_auth import generate_pkce_codes, get_authorization_url, get_authenticated_token, save_token, load_token

# Mock successful API response for token exchange
@pytest.fixture
def mock_token_response_success():
    return {
        "access_token": "mock_access_token_value",
        "refresh_token": "mock_refresh_token_value",
        "expires_in": 3600,
        "token_type": "Bearer"
    }

# Mock error API response for token exchange
@pytest.fixture
def mock_token_response_error():
    return {
        "error": "invalid_grant",
        "error_description": "The authorization code is invalid or expired."
    }

# Fixture for creating a temporary config.json for tests
@pytest.fixture
def temp_config_file(tmp_path):
    config_content = {
        "canva_client_id": "test_client_id_from_config",
        "canva_client_secret": "test_client_secret_from_config",
        "redirect_uri": "http://localhost:8000/callback_from_config",
        "canva_token_cache_path": ".canva_token_cache_test.json", # Relative to tool dir
        "canva_refresh_token": "config_refresh_token_value" # Optional
    }
    config_dir = tmp_path / "proposal_designer_tool"
    config_dir.mkdir()
    config_file = config_dir / "config.json"
    with open(config_file, 'w') as f:
        json.dump(config_content, f)
    return config_file, config_dir

def test_generate_pkce_codes():
    verifier, challenge = generate_pkce_codes()
    assert len(verifier) >= 43
    assert len(verifier) <= 128
    assert re.match(r"^[A-Za-z0-9\-._~]+$", verifier), "Verifier contains invalid characters"
    expected_challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    assert challenge == expected_challenge, "Code challenge is not correctly derived from verifier"

@patch('requests.post')
def test_get_authenticated_token_new_token_flow(mock_post_patch, mock_token_response_success, temp_config_file):
    config_file_path, tool_dir = temp_config_file
    # CanvaClient (and thus get_authenticated_token) will use client_id, etc. passed to it.
    # These values would originally come from reading config.json in the main script.
    # For this test, we pass them directly.
    
    test_client_id = "direct_client_id"
    test_client_secret = "direct_client_secret"
    test_redirect_uri = "http://localhost:7777/direct_callback"
    test_token_cache_path = str(tool_dir / ".canva_token_cache_for_test.json") # Ensure full path for test

    mock_post_patch.return_value.json.return_value = mock_token_response_success
    mock_post_patch.return_value.raise_for_status = MagicMock()

    with patch('secrets.token_urlsafe') as mock_secrets_token_urlsafe:
        mock_secrets_token_urlsafe.return_value = "test_state_12345"
        test_redirect_url_with_code_and_state = f"{test_redirect_uri}?code=test_auth_code&state=test_state_12345"
        
        token = get_authenticated_token(
            client_id=test_client_id,
            client_secret=test_client_secret,
            redirect_uri=test_redirect_uri,
            token_cache_path=test_token_cache_path,
            refresh_token_from_config=None, # Test without pre-configured refresh token first
            test_auth_code_full_url=test_redirect_url_with_code_and_state
        )

    assert token == "mock_access_token_value"
    mock_post_patch.assert_called_once()
    if os.path.exists(test_token_cache_path):
        os.remove(test_token_cache_path) # Clean up


@patch('requests.post') # For refresh token attempt
def test_get_authenticated_token_with_config_refresh_token(mock_post_patch, mock_token_response_success, temp_config_file):
    config_file_path, tool_dir = temp_config_file
    
    test_client_id = "refresh_client_id"
    test_client_secret = "refresh_client_secret"
    test_redirect_uri = "http://localhost:7777/refresh_callback"
    test_token_cache_path = str(tool_dir / ".canva_token_cache_for_refresh_test.json")
    # Simulate having a refresh token in the config
    config_refresh_token = "sample_refresh_token_from_config"

    # Mock the refresh token POST call to be successful
    mock_post_patch.return_value.json.return_value = mock_token_response_success
    mock_post_patch.return_value.raise_for_status = MagicMock()

    # Ensure cache is empty to force refresh attempt from config
    if os.path.exists(test_token_cache_path):
        os.remove(test_token_cache_path)

    token = get_authenticated_token(
        client_id=test_client_id,
        client_secret=test_client_secret,
        redirect_uri=test_redirect_uri,
        token_cache_path=test_token_cache_path,
        refresh_token_from_config=config_refresh_token,
        test_auth_code_full_url=None # Should not be called if refresh works
    )

    assert token == "mock_access_token_value"
    # Check that requests.post was called for token refresh
    mock_post_patch.assert_called_once()
    args, kwargs = mock_post_patch.call_args
    assert "grant_type=refresh_token" in kwargs['data']
    assert f"refresh_token={config_refresh_token}" in kwargs['data']

    if os.path.exists(test_token_cache_path):
        os.remove(test_token_cache_path) # Clean up


def test_save_and_load_token(mock_token_response_success, tmp_path):
    test_cache_file = tmp_path / "test_cache.json"
    token_data = mock_token_response_success
    save_token(token_data, token_cache_path=str(test_cache_file))
    loaded_data = load_token(token_cache_path=str(test_cache_file))
    assert loaded_data == token_data
    # os.remove(test_cache_file) # tmp_path handles cleanup

def test_get_authorization_url():
    test_client_id_arg = "actual_test_client_id_for_url_func"
    test_redirect_uri_arg = "http://localhost:9999/test_redirect"
    test_scope_arg = "test_scope_for_url_func"
    test_state_arg = "state_for_url_func_123"
    code_verifier, code_challenge = generate_pkce_codes()
    
    auth_url = get_authorization_url(
        client_id=test_client_id_arg, 
        redirect_uri=test_redirect_uri_arg, 
        scope=test_scope_arg, 
        code_challenge=code_challenge, 
        state=test_state_arg
    )
    
    assert 'response_type=code' in auth_url
    assert f'client_id={test_client_id_arg}' in auth_url
    assert f'redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Ftest_redirect' in auth_url
    assert f'scope={test_scope_arg}' in auth_url
    assert f'code_challenge={code_challenge}' in auth_url
    assert 'code_challenge_method=S256' in auth_url
    assert f'state={test_state_arg}' in auth_url

# Note: load_secrets is no longer part of canva_auth.py. It's handled by the main script now.
# Therefore, tests for load_secrets are removed from this file. 