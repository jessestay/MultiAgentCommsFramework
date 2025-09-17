# Installation script for the Role Communication System (PowerShell)

Write-Host "Installing Role Communication System..."

# Create required directories
New-Item -ItemType Directory -Force -Path conversations | Out-Null
New-Item -ItemType Directory -Force -Path logs | Out-Null

# Check for Python 3
$pythonCommand = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonVersion = python --version
    if ($pythonVersion -match "Python 3") {
        $pythonCommand = "python"
    }
}
if ($pythonCommand -eq $null -and (Get-Command python3 -ErrorAction SilentlyContinue)) {
    $pythonCommand = "python3"
}
if ($pythonCommand -eq $null) {
    Write-Host "Error: Python 3 is required but not found" -ForegroundColor Red
    exit 1
}

# Check for pip
$pipCommand = $null
if (Get-Command pip -ErrorAction SilentlyContinue) {
    $pipCommand = "pip"
}
if ($pipCommand -eq $null -and (Get-Command pip3 -ErrorAction SilentlyContinue)) {
    $pipCommand = "pip3"
}
if ($pipCommand -eq $null) {
    Write-Host "Error: pip is required but not found" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "Installing dependencies..."
& $pipCommand install cryptography

# Create default config if it doesn't exist
if (-not (Test-Path -Path "config.ini")) {
    Write-Host "Creating default configuration..."
    @"
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
"@ | Out-File -FilePath "config.ini" -Encoding utf8
}

# Run tests
Write-Host "Running tests to verify installation..."
& $pythonCommand src/run_tests.py

if ($LASTEXITCODE -eq 0) {
    Write-Host "Installation successful!" -ForegroundColor Green
    Write-Host ""
    Write-Host "To start the message monitor:"
    Write-Host "  $pythonCommand src/role_cli.py monitor"
    Write-Host ""
    Write-Host "To send a message:"
    Write-Host "  $pythonCommand src/role_cli.py send SOURCE_ROLE TARGET_ROLE ""Message content"""
    Write-Host ""
    Write-Host "To read messages:"
    Write-Host "  $pythonCommand src/role_cli.py read ROLE_NAME"
    Write-Host ""
    Write-Host "For more information, see docs/role_communication_api.md"
} else {
    Write-Host "Installation failed. Please check the logs for details." -ForegroundColor Red
} 