# Main orchestration script for the Canva Autofill Proposal Tool.
"""
This script automates the process of:
1. Authenticating with the Canva API (via canva_auth.py).
2. Reading data from a CSV file.
3. Creating a new Canva design by populating a Brand Template with the CSV data (Autofill).
4. Polling for the design creation (autofill job) completion.
5. Exporting the newly created Canva design as a PDF.
6. Polling for the export job completion.
7. Downloading the final branded PDF.

Configuration for file paths, Brand Template ID, etc., is via a config.json file.
Requires `canva_auth.py` and `canva_client.py` in the same package.
"""
import os
import time
import csv
import json
import re

# Adjusted import path for the new shared location
from .canva_client import CanvaClient

# --- Configuration Loading ---
# Determine the directory of the current script to build paths to other files
_MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE_PATH = os.path.join(_MODULE_DIR, "config.json")

def load_config():
    """Loads configuration from config.json."""
    try:
        with open(CONFIG_FILE_PATH, 'r') as f:
            config = json.load(f)
        # Basic validation for essential keys - can be expanded
        required_keys = [
            'canva_brand_template_id', 'input_csv_path', 'output_pdf_path',
            'canva_client_id', 'canva_client_secret', 'redirect_uri', 'canva_token_cache_path'
        ]
        for key in required_keys:
            if key not in config:
                raise ValueError(f"Missing required key '{key}' in {CONFIG_FILE_PATH}")
        return config
    except FileNotFoundError:
        print(f"ERROR: Configuration file {CONFIG_FILE_PATH} not found.")
        print(f"Please copy config.json.example to config.json and fill in your details.")
        raise
    except json.JSONDecodeError:
        print(f"ERROR: Could not parse {CONFIG_FILE_PATH}. Ensure it is valid JSON.")
        raise
    except ValueError as ve:
        print(f"ERROR: {ve}")
        raise

# Global config dictionary, loaded once
CONFIG = load_config()

# Polling configuration from config or defaults
POLL_INTERVAL_SECONDS = CONFIG.get('poll_interval_seconds', 5)
MAX_POLL_ATTEMPTS = CONFIG.get('max_poll_attempts', 24) 

def strip_markdown_and_add_bullets(text_value):
    if not isinstance(text_value, str):
        return text_value
    text_value = text_value.replace('\\r\\n', '\\n').replace('\\r', '\\n')
    text_value = re.sub(r"<[^>]+>", "", text_value)
    text_value = re.sub(r"\[([^\]]+)\]\(([^\)]+)\)", "\\1", text_value)
    text_value = re.sub(r"^\s*#{1,6}\s+", "", text_value, flags=re.MULTILINE)
    text_value = re.sub(r"~~(.*?)~~", "\\1", text_value)
    text_value = re.sub(r"\\*\\*(.*?)\\*\\*", "\\1", text_value)
    text_value = re.sub(r"__(.*?)__", "\\1", text_value)
    text_value = re.sub(r"\\*(.*?)\\*", "\\1", text_value)
    text_value = re.sub(r"_(.*?)_", "\\1", text_value)
    text_value = re.sub(r"\`(.*?)`", "\\1", text_value)
    text_value = re.sub(r"^\s*(?:\\*\\*\\*+|---|___+)\s*$", "", text_value, flags=re.MULTILINE)
    text_value = re.sub(r"^\s*>\\s?", "", text_value, flags=re.MULTILINE)
    lines = text_value.split('\\n')
    processed_lines = []
    in_list_continuation = False
    for line in lines:
        current_line_stripped_whitespace = line.strip()
        original_line_before_marker_strip = current_line_stripped_whitespace
        line_after_marker_strip, num_replacements = re.subn(
            r"^\s*(?:[\\*\\-\\+]|\\d+\\.)\s+", "", current_line_stripped_whitespace
        )
        if num_replacements > 0:
            if line_after_marker_strip:
                processed_lines.append("• " + line_after_marker_strip)
            elif original_line_before_marker_strip and not line_after_marker_strip:
                processed_lines.append("• ")
            in_list_continuation = True
        elif current_line_stripped_whitespace:
            processed_lines.append(current_line_stripped_whitespace)
            in_list_continuation = False
        elif not current_line_stripped_whitespace and in_list_continuation:
            processed_lines.append("")
        else:
            processed_lines.append("")
            in_list_continuation = False
    text_value = '\\n'.join(processed_lines)
    text_value = re.sub(r"\\n{3,}", "\\n\\n", text_value)
    text_value = text_value.strip(' \\n')
    text_value = re.sub(r" {2,}", " ", text_value)
    return text_value

def load_data_from_csv(file_path):
    try:
        with open(file_path, mode='r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            first_row = next(reader, None)
            if first_row:
                return {
                    k.strip(): strip_markdown_and_add_bullets(v.strip() if v else "")
                    for k, v in first_row.items()
                }
            else:
                print(f"Error: CSV file {file_path} is empty or has no data rows.")
                return None
    except FileNotFoundError:
        print(f"Error: CSV data file not found at {file_path}")
        return None
    except Exception as e:
        print(f"Error reading CSV file {file_path}: {e}")
        return None

def main_process():
    print("Starting Canva Autofill Proposal Process...")
    
    # Paths from config are relative to the tool package dir or absolute
    # If relative, make them absolute based on _MODULE_DIR
    input_csv_path_from_config = CONFIG['input_csv_path']
    output_pdf_path_from_config = CONFIG['output_pdf_path']
    output_log_path_from_config = CONFIG.get('output_log_path', os.path.join(_MODULE_DIR, 'brand_proposal_output.log'))

    csv_file_abs_path = os.path.join(_MODULE_DIR, input_csv_path_from_config) if not os.path.isabs(input_csv_path_from_config) else input_csv_path_from_config
    output_pdf_abs_path = os.path.join(_MODULE_DIR, output_pdf_path_from_config) if not os.path.isabs(output_pdf_path_from_config) else output_pdf_path_from_config
    log_file_abs_path = os.path.join(_MODULE_DIR, output_log_path_from_config) if not os.path.isabs(output_log_path_from_config) else output_log_path_from_config

    # Ensure output directories exist
    os.makedirs(os.path.dirname(output_pdf_abs_path), exist_ok=True)
    os.makedirs(os.path.dirname(log_file_abs_path), exist_ok=True)

    print(f"Brand Template ID: {CONFIG['canva_brand_template_id']}")
    print(f"CSV data file (resolved): {csv_file_abs_path}")
    print(f"Output PDF to (resolved): {output_pdf_abs_path}")
    print(f"Output Log to (resolved): {log_file_abs_path}")

    autofill_data = load_data_from_csv(csv_file_abs_path)
    if not autofill_data:
        print("Halting process due to CSV data loading error.")
        return

    try:
        client = CanvaClient(
            client_id=CONFIG['canva_client_id'],
            client_secret=CONFIG['canva_client_secret'],
            redirect_uri=CONFIG['redirect_uri'],
            token_cache_path=os.path.join(_MODULE_DIR, CONFIG['canva_token_cache_path']),
            config_refresh_token=CONFIG.get('canva_refresh_token') # Optional
        )
        # _ensure_authenticated is called implicitly by API methods now

        data_for_canva = {}
        for header_name, value in autofill_data.items():
            if header_name:
                data_for_canva[header_name] = {"type": "text", "text": value}
            else:
                print(f"Warning: Empty header found. Corresponding value: '{value}'. Skipping this column.")

        if not data_for_canva:
            print("Error: No data fields were prepared for Canva. Check CSV headers and content.")
            return

        final_payload_for_api = {
            "brand_template_id": CONFIG['canva_brand_template_id'],
            "data": data_for_canva
        }
        potential_title_key = "title" # Assumed CSV key for title
        if potential_title_key in autofill_data and autofill_data[potential_title_key]:
             final_payload_for_api["title"] = autofill_data[potential_title_key]
        
        print("\n--- Debug: final_payload_for_api (summary) ---")
        payload_summary = {k: v for k, v in final_payload_for_api.items() if k != 'data'}
        payload_summary['data_keys_count'] = len(final_payload_for_api.get('data', {}))
        print(json.dumps(payload_summary, indent=2))
        print("--- End Debug Summary ---\n")

        print("\nStep 1: Creating Autofill job...")
        autofill_job_response = client.create_autofill_job(
            brand_template_id=final_payload_for_api["brand_template_id"],
            data=final_payload_for_api["data"],
            title=final_payload_for_api.get("title")
        )

        if not autofill_job_response or autofill_job_response.get("error") or \
           not isinstance(autofill_job_response.get('job'), dict) or \
           'id' not in autofill_job_response['job'] or \
           'status' not in autofill_job_response['job']:
            print("Failed to create autofill job or unexpected response structure. Response:")
            print(json.dumps(autofill_job_response, indent=2))
            return
        
        autofill_job_id = autofill_job_response['job']['id']
        initial_status = autofill_job_response['job']['status']
        print(f"Autofill job creation initiated. Job ID: {autofill_job_id}, Initial Status: {initial_status}")

        if initial_status == "failed":
            print("Autofill job failed on creation.")
            if "error" in autofill_job_response["job"]:
                print(f"Error details: {json.dumps(autofill_job_response[\'job\'][\'error\'], indent=2)}")
            return
        if initial_status not in ["in_progress", "success"]:
            print(f"Autofill job has an unexpected initial status: {initial_status}. Halting.")
            return

        print("\nStep 2: Polling Autofill job status...")
        autofill_status_response = client.poll_job_status(autofill_job_id, "autofills", POLL_INTERVAL_SECONDS, MAX_POLL_ATTEMPTS)
        
        if not autofill_status_response or autofill_status_response.get("error") or \
           not isinstance(autofill_status_response.get('job'), dict) or \
           autofill_status_response['job'].get('status') != "success":
            print(f"Autofill job {autofill_job_id} did not complete successfully after polling.")
            print(f"Last poll response: {json.dumps(autofill_status_response, indent=2)}")
            return

        new_design_id = autofill_status_response['job'].get('result', {}).get('design_id')
        if not new_design_id:
            print(f"Autofill job {autofill_job_id} succeeded, but no design_id found in result.")
            print(f"Result: {json.dumps(autofill_status_response[\'job\'].get(\'result\'), indent=2)}")
            return
        print(f"Autofill job {autofill_job_id} completed. New Design ID: {new_design_id}")

        print("\nStep 3: Creating Export job for the new design...")
        export_job_response = client.create_design_export_job(new_design_id, export_format="pdf")

        if not export_job_response or export_job_response.get("error") or \
           not isinstance(export_job_response.get('job'), dict) or \
           'id' not in export_job_response['job'] or \
           'status' not in export_job_response['job']:
            print("Failed to create export job or unexpected response structure. Response:")
            print(json.dumps(export_job_response, indent=2))
            return

        export_job_id = export_job_response['job']['id']
        initial_export_status = export_job_response['job']['status']
        print(f"Export job creation initiated. Job ID: {export_job_id}, Initial Status: {initial_export_status}")

        if initial_export_status == "failed":
            print("Export job failed on creation.")
            if "error" in export_job_response["job"]:
                print(f"Error details: {json.dumps(export_job_response[\'job\'][\'error\'], indent=2)}")
            return
        if initial_export_status not in ["in_progress", "success"]:
            print(f"Export job has an unexpected initial status: {initial_export_status}. Halting.")
            return

        print("\nStep 4: Polling Export job status...")
        export_status_response = client.poll_job_status(export_job_id, "exports", POLL_INTERVAL_SECONDS, MAX_POLL_ATTEMPTS)

        if not export_status_response or export_status_response.get("error") or \
           not isinstance(export_status_response.get('job'), dict) or \
           export_status_response['job'].get('status') != "success":
            print(f"Export job {export_job_id} did not complete successfully after polling.")
            print(f"Last poll response: {json.dumps(export_status_response, indent=2)}")
            return

        download_urls = export_status_response['job'].get('result', {}).get('download_urls')
        if not download_urls or not isinstance(download_urls, list) or not download_urls[0]:
            print(f"Export job {export_job_id} succeeded, but no download URL found in result.")
            print(f"Result: {json.dumps(export_status_response[\'job\'].get(\'result\'), indent=2)}")
            return
        
        pdf_download_url = download_urls[0] # Assuming the first URL is the PDF
        print(f"Export job {export_job_id} completed. PDF Download URL: {pdf_download_url}")

        print("\nStep 5: Downloading the exported PDF...")
        if client.download_file(pdf_download_url, output_pdf_abs_path):
            print(f"Successfully downloaded branded proposal to {output_pdf_abs_path}")
        else:
            print(f"Failed to download branded proposal from {pdf_download_url}")

    except Exception as e:
        print(f"An unexpected error occurred in main_process: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Setup to redirect stdout and stderr to a log file and also print to console
    script_dir_for_log = os.path.dirname(os.path.abspath(__file__))
    log_path_from_config_for_main = CONFIG.get('output_log_path', os.path.join(script_dir_for_log, 'brand_proposal_output.log'))
    final_log_path = os.path.join(script_dir_for_log, log_path_from_config_for_main) if not os.path.isabs(log_path_from_config_for_main) else log_path_from_config_for_main
    
    os.makedirs(os.path.dirname(final_log_path), exist_ok=True)
    
    class Tee:
        def __init__(self, *files):
            self.files = files
        def write(self, obj):
            for f in self.files:
                f.write(obj)
                f.flush() # If you want the output to be visible immediately
        def flush(self):
            for f in self.files:
                f.flush()

    import sys
    original_stdout = sys.stdout
    original_stderr = sys.stderr
    
    try:
        with open(final_log_path, 'w', encoding='utf-8') as log_file:
            sys.stdout = Tee(original_stdout, log_file)
            sys.stderr = Tee(original_stderr, log_file)
            print(f"Logging to: {final_log_path}")
            main_process()
    except Exception as e:
        # If logging setup fails, print to original stderr
        print(f"Critical error during logging setup or main execution: {e}", file=original_stderr)
        import traceback
        traceback.print_exc(file=original_stderr)
    finally:
        sys.stdout = original_stdout
        sys.stderr = original_stderr
        print(f"Process finished. Full log available at: {final_log_path}") 