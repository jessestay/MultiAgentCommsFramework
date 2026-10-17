#!/bin/bash

# This script is a wrapper to run the Canva Proposal Designer Python tool.
# It primarily helps in setting up the Python environment if needed and then calls the Python module.

# Determine the directory of this script
# This helps in locating the Python tool relative to this script if they are bundled together.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PYTHON_TOOL_MODULE_PATH=".cursor.shared_tools.proposal_designer_tool.autofill_proposal_from_template"

# --- Helper Functions ---
log_message() {
    echo "[RUNNER INFO] $(date +'%Y-%m-%d %H:%M:%S'): $1"
}

log_error() {
    echo "[RUNNER ERROR] $(date +'%Y-%m-%d %H:%M:%S'): $1" >&2
}

# --- Main Execution ---
log_message "Starting Canva Proposal Designer Runner Script..."

# 1. Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    log_error "Python 3 (python3) is not installed or not in PATH. Please install Python 3."
    exit 1
fi
log_message "Python 3 found: $(command -v python3)"

# 2. Check for virtual environment
#    The tool's README.md instructs users to set up their own venv for their project.
#    This script assumes that if a venv is active, pip and python3 commands will use it.
#    We won't attempt to activate/deactivate a venv from within this script as it can be unreliable.

if [ -z "$VIRTUAL_ENV" ]; then
    log_message "WARNING: Not currently in a Python virtual environment (VIRTUAL_ENV not set)."
    log_message "It is STRONGLY recommended to run this tool within a dedicated Python virtual environment for your project."
    log_message "Please activate your project's virtual environment where you have installed the tool's requirements."
    # Optionally, exit if not in a venv, or make it configurable.
    # For now, we will proceed but with a warning.
fi

# 3. Check if core dependencies are likely met (basic check for requests)
#    A more robust check would be to verify all packages from requirements.txt, 
#    but that's usually the user's responsibility during setup.
log_message "Attempting to import 'requests' module to check basic Python environment setup..."
if ! python3 -c "import requests" &> /dev/null; then
    log_error "Failed to import 'requests' Python module. This suggests dependencies are not installed correctly in your Python environment."
    log_error "Please ensure you have activated the correct virtual environment and run:"
    log_error "  pip install -r ${SCRIPT_DIR}/requirements.txt"
    exit 1
fi
log_message "Python module 'requests' seems available."

# 4. Execute the Python tool
#    The Python script itself handles loading its config.json from its own directory.
#    The Python script also handles its own logging to a file specified in its config.
log_message "Executing the Canva Proposal Designer Python tool..."
log_message "Command: python3 -m ${PYTHON_TOOL_MODULE_PATH}"
log_message "(Ensure your config.json inside ${SCRIPT_DIR} is correctly set up.)"

# The -u flag is for unbuffered Python output, which can be helpful for seeing logs in real-time.
python3 -u -m "${PYTHON_TOOL_MODULE_PATH}"
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    log_message "Canva Proposal Designer Python tool finished successfully."
else
    log_error "Canva Proposal Designer Python tool exited with error code $EXIT_CODE."
    log_error "Check the tool's own log file (specified in its config.json) for detailed Python errors."
fi

log_message "Canva Proposal Designer Runner Script finished."
exit $EXIT_CODE 