#!/bin/bash
# .cursor/setup_wsl2_headless_chrome.sh
# Script to install Google Chrome and a compatible ChromeDriver in WSL2 for headless testing.

set -e # Exit immediately if a command exits with a non-zero status.

CHROME_INSTALL_PATH="/opt/google/chrome/google-chrome"
CHROMEDRIVER_INSTALL_PATH="/usr/local/bin/chromedriver"

echo "INFO: Starting Google Chrome and ChromeDriver setup for WSL2."

# --- Helper Functions --- 
function is_command_available() {
    command -v "$1" >/dev/null 2>&1
}

# --- Dependency Installation --- 
if ! is_command_available wget || ! is_command_available unzip || ! is_command_available apt-get;
 then
    echo "INFO: Installing required tools: wget, unzip, apt-utils (if not present)."
    # Check if sudo is available. If not, prompt the user that sudo is required.
    if ! is_command_available sudo; then
        echo "ERROR: sudo command not found. This script requires sudo privileges to install packages."
        echo "Please install sudo or run this script as root."
        exit 1
    fi
    sudo apt-get update -y
    sudo apt-get install -y wget unzip apt-utils ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release xdg-utils
fi

# --- Google Chrome Installation --- 
if ! is_command_available google-chrome-stable && ! [ -f "$CHROME_INSTALL_PATH" ]; then
    echo "INFO: Google Chrome not found. Attempting to install."
    wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/google-chrome-stable_current_amd64.deb
    # Check if sudo is available. If not, prompt the user that sudo is required.
    if ! is_command_available sudo; then
        echo "ERROR: sudo command not found. This script requires sudo privileges to install packages."
        echo "Please install sudo or run this script as root."
        exit 1
    fi
    sudo apt-get update # Update before install
    sudo apt-get install -y /tmp/google-chrome-stable_current_amd64.deb || sudo dpkg -i /tmp/google-chrome-stable_current_amd64.deb && sudo apt-get install -f -y # Fallback if install fails
    rm /tmp/google-chrome-stable_current_amd64.deb
    echo "INFO: Google Chrome installed."
else
    echo "INFO: Google Chrome already installed or found at $CHROME_INSTALL_PATH."
fi

# Determine Chrome version
if [ -f "$CHROME_INSTALL_PATH" ]; then
    CHROME_BINARY_FOR_VERSION_CHECK="$CHROME_INSTALL_PATH"
elif is_command_available google-chrome-stable; then
    CHROME_BINARY_FOR_VERSION_CHECK="google-chrome-stable"
elif is_command_available google-chrome; then
    CHROME_BINARY_FOR_VERSION_CHECK="google-chrome"
else
    echo "ERROR: Could not determine installed Chrome binary to check version."
    exit 1
fi

CHROME_VERSION=$($CHROME_BINARY_FOR_VERSION_CHECK --version | grep -oP '[0-9]+\.[0-9]+\.[0-9]+')
if [ -z "$CHROME_VERSION" ]; then
    echo "ERROR: Could not determine installed Google Chrome version."
    exit 1
fi
echo "INFO: Detected Chrome version: $CHROME_VERSION"

# --- ChromeDriver Installation --- 
# Construct the major version from CHROME_VERSION (e.g., 114.0.5735 -> 114)
CHROME_MAJOR_VERSION=$(echo "$CHROME_VERSION" | cut -d . -f 1)

# Get the latest known good version for this major Chrome version
# Updated endpoint logic for versions >= 115
if [ "$CHROME_MAJOR_VERSION" -ge 115 ]; then
    CHROMEDRIVER_VERSION_URL="https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_${CHROME_MAJOR_VERSION}"
    # If the above doesn't work, try with the full version string up to the third dot component
    if ! wget -qO- "$CHROMEDRIVER_VERSION_URL"; then 
        CHROME_VERSION_PREFIX=$(echo "$CHROME_VERSION" | awk -F. '{print $1"."$2"."$3}')
        CHROMEDRIVER_VERSION_URL="https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_${CHROME_VERSION_PREFIX}"
    fi
else
    # Legacy endpoint for older versions (<=114)
    CHROMEDRIVER_VERSION_URL="https://chromedriver.storage.googleapis.com/LATEST_RELEASE_${CHROME_MAJOR_VERSION}"
fi

CHROMEDRIVER_VERSION=$(wget -qO- "$CHROMEDRIVER_VERSION_URL")
if [ -z "$CHROMEDRIVER_VERSION" ]; then
    echo "ERROR: Could not determine ChromeDriver version for Chrome $CHROME_MAJOR_VERSION from $CHROMEDRIVER_VERSION_URL"
    echo "Please check the URL or manually find the correct ChromeDriver version."
    exit 1
fi
echo "INFO: Determined ChromeDriver version to download: $CHROMEDRIVER_VERSION"

if [ -f "$CHROMEDRIVER_INSTALL_PATH" ] && ("$CHROMEDRIVER_INSTALL_PATH" --version | grep -q "$CHROMEDRIVER_VERSION"); then
    echo "INFO: Compatible ChromeDriver $CHROMEDRIVER_VERSION already installed at $CHROMEDRIVER_INSTALL_PATH."
else
    echo "INFO: Downloading ChromeDriver $CHROMEDRIVER_VERSION..."
    # Download URL logic based on version >= 115
    if [ "$CHROME_MAJOR_VERSION" -ge 115 ]; then
        CHROMEDRIVER_DOWNLOAD_URL="https://edgedl.me.gvt1.com/edgedl/chrome/chrome-for-testing/${CHROMEDRIVER_VERSION}/linux64/chromedriver-linux64.zip"
    else
        CHROMEDRIVER_DOWNLOAD_URL="https://chromedriver.storage.googleapis.com/${CHROMEDRIVER_VERSION}/chromedriver_linux64.zip"
    fi
    
    wget -q "$CHROMEDRIVER_DOWNLOAD_URL" -O /tmp/chromedriver_linux64.zip
    unzip -q -o /tmp/chromedriver_linux64.zip -d /tmp/
    
    # For versions >= 115, the zip contains a directory like chromedriver-linux64/
    if [ "$CHROME_MAJOR_VERSION" -ge 115 ]; then
        CHROME_DRIVER_FILE_IN_ZIP="chromedriver-linux64/chromedriver"
    else
        CHROME_DRIVER_FILE_IN_ZIP="chromedriver"
    fi

    # Check if sudo is available. If not, prompt the user that sudo is required.
    if ! is_command_available sudo; then
        echo "ERROR: sudo command not found. This script requires sudo privileges to install packages."
        echo "Please install sudo or run this script as root."
        exit 1
    fi
    sudo mv "/tmp/${CHROME_DRIVER_FILE_IN_ZIP}" "$CHROMEDRIVER_INSTALL_PATH"
    sudo chmod +x "$CHROMEDRIVER_INSTALL_PATH"
    rm /tmp/chromedriver_linux64.zip
    # Remove the directory if it was created by unzip for new versions
    if [ "$CHROME_MAJOR_VERSION" -ge 115 ]; then
        rm -rf "/tmp/chromedriver-linux64"
    fi
    echo "INFO: ChromeDriver $CHROMEDRIVER_VERSION installed to $CHROMEDRIVER_INSTALL_PATH."
fi

# --- Output Paths --- 
echo "INFO: --- Setup Complete --- "
echo "INFO: Google Chrome binary should be available at: $($CHROME_BINARY_FOR_VERSION_CHECK -h | head -n1 | cut -d' ' -f1) (often /opt/google/chrome/google-chrome or resolvable as google-chrome-stable)"
echo "INFO: ChromeDriver is installed at: $CHROMEDRIVER_INSTALL_PATH"

# Verify ChromeDriver can run
if ! "$CHROMEDRIVER_INSTALL_PATH" --version > /dev/null; then
    echo "ERROR: ChromeDriver at $CHROMEDRIVER_INSTALL_PATH failed to execute properly."
    exit 1
fi

echo "INFO: ChromeDriver version check successful: $("$CHROMEDRIVER_INSTALL_PATH" --version)"
echo "INFO: To use in behat.yml (MinkExtension):
      selenium2:
        capabilities:
          chrome:
            binary: $($CHROME_BINARY_FOR_VERSION_CHECK -h | head -n1 | cut -d' ' -f1) # Or the direct path like /opt/google/chrome/google-chrome
            # No need to specify chromedriver path if it's in system PATH and compatible
            # Or, if using Selenium Server, configure it to use this ChromeDriver.
            # For direct Behat\Mink\Driver\Selenium2Driver, ensure $CHROMEDRIVER_INSTALL_PATH is in system PATH
            # or specify via 'webdriver.chrome.driver' Java system property if using standalone Selenium JAR directly (less common with MinkExtension)
            # With MinkExtension, having chromedriver in PATH is usually sufficient if not using a Selenium Server Hub.
            # If chromedriver is NOT in PATH, you might need to start it manually or ensure your test runner/Selenium Server knows its location.
            # For direct driver control (no Selenium Server hub), ChromeDriver must be running and accessible.
            # The Behat MinkExtension usually expects ChromeDriver to be running on wd_host (e.g., http://localhost:9515)
            # So, you'd run: '$CHROMEDRIVER_INSTALL_PATH --port=9515' separately.
"

# Test Chrome headless launch (optional basic check)
# echo "INFO: Performing a quick test of headless Chrome launch..."
# if $CHROME_BINARY_FOR_VERSION_CHECK --headless --disable-gpu --no-sandbox --version > /dev/null; then
#   echo "INFO: Headless Chrome launched successfully."
# else
#   echo "WARNING: Headless Chrome test launch failed. There might be missing dependencies or other issues."
# fi 