# Test cases for autofill_proposal_from_template.py
import pytest
import os
from unittest.mock import patch, mock_open, MagicMock
import json # For mock config

# Adjusted import path for the new shared location
from ..autofill_proposal_from_template import main_process, load_data_from_csv, _load_config
from ..canva_client import CanvaClient

# Mock CSV content
MOCK_CSV_CONTENT = "HEADER_1,HEADER_2\nValue1,Value2"
MOCK_CSV_DATA_EXPECTED = {"HEADER_1": "Value1", "HEADER_2": "Value2"}

@pytest.fixture
def mock_config_data_for_main():
    """Provides default mock config data for the main_process tests."""
    return {
        "canva_client_id": "main_test_client_id",
        "canva_client_secret": "main_test_client_secret",
        "redirect_uri": "http://localhost:8000/main_callback",
        "canva_refresh_token": "main_test_refresh_token",
        "canva_token_cache_path": ".main_test_token_cache.json", # Relative to tool dir
        "canva_brand_template_id": "DAGnknh74p0_main_test",
        "input_csv_path": "test_assets/input.csv", # Relative to tool dir
        "output_pdf_path": "test_output/output.pdf", # Relative to tool dir
        "output_log_path": "test_logs/process.log", # Relative to tool dir
        "default_font": "Arial",
        "poll_interval_seconds": 1, # Faster polling for tests
        "poll_timeout_multiplier": 2 # Smaller timeout for tests
    }

@pytest.fixture
def mock_canva_client_for_main(mocker):
    """Mocks the CanvaClient instance and its methods for main_process flow."""
    mock_client = mocker.MagicMock(spec=CanvaClient)
    mock_client.create_autofill_job.return_value = {"job_id": "autofill_job_123", "status": "PROCESSING"}
    mock_client.poll_job_status.side_effect = [
        {"job_id": "autofill_job_123", "status": "SUCCESS", "result": {"design_id": "new_design_abc"}},
        {"job_id": "export_job_456", "status": "SUCCESS", "result": {"download_url": "https://example.com/download/proposal.pdf"}}
    ]
    mock_client.create_design_export_job.return_value = {"job_id": "export_job_456", "status": "PROCESSING"}
    mock_client.download_file.return_value = True
    
    # Patch CanvaClient instantiation within autofill_proposal_from_template module
    mocker.patch('.cursor.shared_tools.proposal_designer_tool.autofill_proposal_from_template.CanvaClient', return_value=mock_client)
    return mock_client

@pytest.fixture
def mock_load_config_fixture(mocker, mock_config_data_for_main):
    """Mocks the _load_config function within the autofill script."""
    return mocker.patch('.cursor.shared_tools.proposal_designer_tool.autofill_proposal_from_template._load_config', return_value=mock_config_data_for_main)


def test_load_data_from_csv_success(tmp_path):
    csv_file = tmp_path / "test.csv"
    with open(csv_file, 'w') as f:
        f.write(MOCK_CSV_CONTENT)
    data = load_data_from_csv(str(csv_file))
    assert data == MOCK_CSV_DATA_EXPECTED

def test_load_data_from_csv_file_not_found():
    data = load_data_from_csv("non_existent.csv")
    assert data is None

def test_load_data_from_csv_empty(tmp_path):
    csv_file = tmp_path / "empty.csv"
    with open(csv_file, 'w') as f:
        f.write("HEADER_1,HEADER_2\n") # Only headers
    data = load_data_from_csv(str(csv_file))
    assert data == {} # Should return empty dict if only headers or no data rows

def test_load_data_from_csv_malformed(tmp_path):
    csv_file = tmp_path / "malformed.csv"
    # Malformed: more values in data row than headers
    with open(csv_file, 'w') as f:
        f.write("HEADER_1\nValue1,ValueExtra")
    data = load_data_from_csv(str(csv_file))
    # Behavior for malformed CSV (e.g. more values than headers) can vary.
    # The current script's load_data_from_csv uses csv.DictReader which would handle this gracefully
    # by only taking the first value if there's only one header.
    # Let's test the expected outcome with a simple dict reader behavior:
    assert data == {'HEADER_1': 'Value1'} # csv.DictReader typically handles this by assigning only to known fields


@patch('.cursor.shared_tools.proposal_designer_tool.autofill_proposal_from_template.load_data_from_csv')
@patch('os.makedirs') # Mock makedirs during download and logging
def test_main_process_success(
    mock_os_makedirs, 
    mock_load_csv_main, 
    mock_canva_client_for_main, 
    mock_load_config_fixture, # This applies the mocked config
    capsys, 
    tmp_path
):
    mock_load_csv_main.return_value = MOCK_CSV_DATA_EXPECTED
    
    # Configure paths in the mocked config to use tmp_path
    # This ensures that when main_process constructs paths, they are valid temp paths.
    config_data = mock_load_config_fixture.return_value # Get the dict from the mock
    config_data['input_csv_path'] = str(tmp_path / "input.csv")
    config_data['output_pdf_path'] = str(tmp_path / "output.pdf")
    config_data['output_log_path'] = str(tmp_path / "process.log")
    config_data['canva_token_cache_path'] = str(tmp_path / ".token_cache")

    # Create a dummy input CSV for the process to find
    with open(config_data['input_csv_path'], 'w') as f:
        f.write(MOCK_CSV_CONTENT)

    main_process() # main_process will use the mocked config via _load_config

    mock_canva_client_for_main.create_autofill_job.assert_called_once_with(
        config_data['canva_brand_template_id'], MOCK_CSV_DATA_EXPECTED
    )
    assert mock_canva_client_for_main.poll_job_status.call_count == 2
    mock_canva_client_for_main.poll_job_status.assert_any_call(
        "autofill_job_123", "autofills", 
        config_data['poll_interval_seconds'], 
        config_data['poll_timeout_multiplier']
    )
    mock_canva_client_for_main.create_design_export_job.assert_called_once_with(
        "new_design_abc", "pdf"
    )
    mock_canva_client_for_main.poll_job_status.assert_any_call(
        "export_job_456", "exports", 
        config_data['poll_interval_seconds'], 
        config_data['poll_timeout_multiplier']
    )
    mock_canva_client_for_main.download_file.assert_called_once_with(
        "https://example.com/download/proposal.pdf", config_data['output_pdf_path']
    )

    captured = capsys.readouterr()
    assert "Starting Canva Autofill Proposal Process..." in captured.out
    assert "Successfully downloaded branded proposal to:" in captured.out
    assert config_data['output_pdf_path'] in captured.out
    assert os.path.exists(config_data['output_log_path']) # Check log file was created

@patch('.cursor.shared_tools.proposal_designer_tool.autofill_proposal_from_template.load_data_from_csv')
def test_main_process_csv_load_fails(mock_load_csv_main, mock_canva_client_for_main, mock_load_config_fixture, capsys, tmp_path):
    mock_load_csv_main.return_value = None
    config_data = mock_load_config_fixture.return_value
    config_data['input_csv_path'] = str(tmp_path / "input.csv") # Still need a path for the log message
    config_data['output_log_path'] = str(tmp_path / "process_fail.log")

    main_process()
    
    captured = capsys.readouterr()
    assert "Halting process due to CSV data loading error." in captured.out
    mock_canva_client_for_main.create_autofill_job.assert_not_called()
    assert os.path.exists(config_data['output_log_path']) # Check log file

@patch('.cursor.shared_tools.proposal_designer_tool.autofill_proposal_from_template.load_data_from_csv')
def test_main_process_autofill_job_fails(mock_load_csv_main, mock_canva_client_for_main, mock_load_config_fixture, capsys, tmp_path):
    mock_load_csv_main.return_value = MOCK_CSV_DATA_EXPECTED
    config_data = mock_load_config_fixture.return_value
    config_data['input_csv_path'] = str(tmp_path / "input.csv")
    config_data['output_log_path'] = str(tmp_path / "process_autofill_fail.log")
    with open(config_data['input_csv_path'], 'w') as f:
        f.write(MOCK_CSV_CONTENT)

    mock_canva_client_for_main.create_autofill_job.return_value = {"error": "failed", "details": "Autofill API down"}

    main_process()

    captured = capsys.readouterr()
    assert "Failed to create autofill job." in captured.out
    assert "Details: Autofill API down" in captured.out
    mock_canva_client_for_main.poll_job_status.assert_not_called()
    assert os.path.exists(config_data['output_log_path']) # Check log file


# Minimal test for _load_config to ensure it tries to load json
@patch("builtins.open", new_callable=mock_open, read_data='{"canva_client_id": "dummy_id"}')
@patch('os.path.exists', return_value=True) # Ensure file is 'found' by os.path.exists
def test_load_config_basic_load(mock_os_exists, mock_file_open):
    # Determine the expected path that _load_config will try to open
    # This depends on how _load_config constructs the CONFIG_FILE_PATH
    # Assuming it's relative to the module dir:
    module_dir = os.path.dirname(os.path.abspath('.cursor.shared_tools.proposal_designer_tool.autofill_proposal_from_template'.replace('.', '/') + ".py"))
    expected_config_path = os.path.join(module_dir, 'config.json')
    
    config = _load_config()
    
    mock_file_open.assert_called_once_with(expected_config_path, 'r')
    assert config['canva_client_id'] == 'dummy_id'

@patch('os.path.exists', return_value=False) # Simulate config.json not found
def test_load_config_file_not_found(mock_os_exists, capsys):
    with pytest.raises(SystemExit) as e:
        _load_config()
    assert e.type == SystemExit
    assert e.value.code == 1
    captured = capsys.readouterr()
    assert "ERROR: Configuration file config.json not found in the tool directory" in captured.err 