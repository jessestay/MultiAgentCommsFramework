# Canva Proposal Branding Tool

This tool automates the process of taking a pre-branded proposal document (PDF or DOCX), importing it into Canva, and then exporting it as a new PDF. This is intended to leverage Canva's rendering engine for consistent output.

## Prerequisites

1.  **Python 3.7+** installed.
2.  **Input Proposal Document**: A PDF or DOCX file (e.g., `assets/proposal.pdf`) that ALREADY CONTAINS your desired branding, including the company logo and all proposal content.
3.  **Canva Developer Account & App**:
    *   You need a Canva developer account and an app created in the Canva Developer Portal.
    *   The app must be configured with the following **scopes**:
        *   `design:content:write` (to import the document and create a design)
        *   `design:content:read` (to export the design)
        *   `folder:read` (potentially needed for some operations, included in auth defaults)
        *   `asset:read` (potentially needed, included in auth defaults)
    *   You need a **Redirect URI** configured for your app. For CLI usage, `http://localhost:8000/callback` is used by default in `config.json.example`.
4.  **API Credentials & Configuration**:
    *   Copy the `config.json.example` file in this directory to `config.json`.
    *   Populate `config.json` with your actual Canva App credentials:
        *   `canva_client_id`
        *   `canva_client_secret`
        *   `redirect_uri` (must match one configured in your Canva App)
        *   Optionally, a `canva_refresh_token` if you have one for non-interactive use.
    *   Also configure `canva_brand_template_id`, `input_csv_path`, `output_pdf_path`, etc., in `config.json` as needed.
    *   **DO NOT COMMIT `config.json` TO VERSION CONTROL if it contains real secrets.**

## Setup (Per Project)

To use this shared tool in a new project:

1.  Ensure this tool's directory (`.cursor/shared_tools/proposal_designer_tool/`) is available in your project (e.g., via symlink or by having the `.cursor` directory versioned globally).
2.  Create and activate a Python virtual environment for your project:
    ```bash
    python3 -m venv .venv-myproject # Or your preferred venv name
    source .venv-myproject/bin/activate  # On Windows: .venv-myproject\Scripts\activate
    ```
3.  Install the required Python packages into your project's virtual environment:
    ```bash
    pip install -r .cursor/shared_tools/proposal_designer_tool/requirements.txt
    ```
4.  Prepare your input CSV file as specified by the `input_csv_path` in your `config.json`.
5.  Ensure you have a `config.json` file inside `.cursor/shared_tools/proposal_designer_tool/` (copied from `config.json.example`) and that it is populated with your Canva credentials and desired paths/IDs.

## Usage

1.  Activate your project's virtual environment.
2.  Run the main script. The command will be structured to run the module, for example:
    ```bash
    python3 -m .cursor.shared_tools.proposal_designer_tool.autofill_proposal_from_template
    ```
    *(The exact command might vary slightly based on your project structure and how Python resolves modules. The `.cursor/rules/` documentation will provide the canonical command.)*

3.  **First-time run / Token Expiry**: If a valid `canva_refresh_token` is not in your `config.json` or the cached token is invalid, the script will output a Canva authorization URL. You must open this URL in your browser, authorize the application, and then copy the full redirect URL you are taken to (or just the `code=` part from that URL). Paste this back into the terminal when prompted by the script.
4.  The script will then, according to its `config.json`:
    *   Read data from the specified CSV.
    *   Use the Canva Autofill API to populate a Brand Template.
    *   Export the newly created Canva design as a PDF.
    *   Save the final PDF to the specified output path.
    *   Log its output to the specified log path.

## Configuration

All configuration is now managed via the `config.json` file within this tool's directory (`.cursor/shared_tools/proposal_designer_tool/config.json`). Refer to `config.json.example` for all available options, including:

*   `canva_client_id`, `canva_client_secret`, `redirect_uri`, `canva_refresh_token` (optional)
*   `canva_brand_template_id`
*   `input_csv_path` (relative to this tool's directory, or absolute)
*   `output_pdf_path` (relative to this tool's directory, or absolute)
*   `output_log_path` (relative to this tool's directory, or absolute)
*   `canva_token_cache_path` (relative to this tool's directory)
*   Polling settings, default font, etc.

## Running Tests (TDD/BDD)

Unit tests are written using `pytest`.

1.  Ensure you have activated your project's virtual environment and installed dependencies from `requirements.txt` (which includes `pytest` and `pytest-mock`).
2.  Navigate to `.cursor/shared_tools/proposal_designer_tool/` directory.
3.  Run pytest:
    ```bash
    pytest
    ```
    Pytest should automatically discover and run tests in the `tests/` subdirectory.

## Important Notes
*   The tool uses Canva's **Autofill API** with a **Brand Template**, not the Design Import API. It populates a template with data from a CSV.
*   The script includes polling mechanisms for asynchronous Canva API jobs.
*   Access tokens expire. The script attempts to cache and refresh tokens. If issues persist, deleting the token cache file (path defined in `config.json`) will force a new authorization flow.

## Troubleshooting

*   **Python not found / ModuleNotFoundError**: Ensure Python 3.7+ is installed and you have activated your virtual environment where packages are installed.
*   **Configuration file `config.json` not found/invalid**: Ensure you copied `config.json.example` to `config.json` in the `.cursor/shared_tools/proposal_designer_tool/` directory and that it is valid JSON with all required fields populated.
*   **Input CSV not found**: Verify the `input_csv_path` in `config.json` is correct. Relative paths are from the tool's directory.
*   **Canva API errors**: Refer to the script's log output (path in `config.json`) and the Canva API documentation for specific error codes. Ensure your tokens are valid and your Canva App has the necessary permissions/scopes (e.g., `design:content:read`, `design:content:write`).
*   **Autofill/Export job failures**: Check the log output for error messages from the Canva API.

## Canva API Endpoints Used

*   `POST /rest/v1/oauth/token` (for fetching/refreshing access token)
*   `POST /rest/v1/autofills` (to create an autofill job with a Brand Template and data)
*   `GET /rest/v1/autofills/{job_id}` (to check autofill job status)
*   `POST /rest/v1/exports` (to export the design created by autofill as PDF)
*   `GET /rest/v1/exports/{job_id}` (to check export job status and get download URL) 