#!/bin/bash
# Installation script for the Role Communication System

echo "Installing Role Communication System..."

# Create required directories
mkdir -p conversations
mkdir -p logs

# Check for Python 3
if command -v python3 &>/dev/null; then
    PYTHON=python3
elif command -v python &>/dev/null; then
    PYTHON=python
else
    echo "Error: Python 3 is required but not found"
    exit 1
fi

# Check for pip
if command -v pip3 &>/dev/null; then
    PIP=pip3
elif command -v pip &>/dev/null; then
    PIP=pip
else
    echo "Error: pip is required but not found"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
$PIP install cryptography

# Create default config if it doesn't exist
if [ ! -f config.ini ]; then
    echo "Creating default configuration..."
    cat > config.ini << EOF
[DEFAULT]
# Base directory for message queues
base_dir = conversations

# Check interval in seconds
check_interval = 5.0

# Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
log_level = INFO

# Enable message encryption
encryption_enabled = false

# Encryption key (leave empty to generate a new key)
encryption_key = 

[ROLES]
# List of roles to register automatically
roles = ES,SET,MD,SMM,CTW,UFL,DLC,DRC,BIC
EOF
fi

# Run tests
echo "Running tests to verify installation..."
$PYTHON src/run_tests.py

if [ $? -eq 0 ]; then
    echo "Installation successful!"
    echo ""
    echo "To start the message monitor:"
    echo "  $PYTHON src/role_cli.py monitor"
    echo ""
    echo "To send a message:"
    echo "  $PYTHON src/role_cli.py send SOURCE_ROLE TARGET_ROLE \"Message content\""
    echo ""
    echo "To read messages:"
    echo "  $PYTHON src/role_cli.py read ROLE_NAME"
    echo ""
    echo "For more information, see docs/role_communication_api.md"
else
    echo "Installation failed. Please check the logs for details."
fi 