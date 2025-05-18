#!/bin/bash

# Setup and Test Script for AI-Assisted Stakeholder Review Framework
# Installs dependencies and runs comprehensive tests

# Set colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect framework dir
FRAMEWORK_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOGS_DIR="$FRAMEWORK_DIR/logs"

# Create logs directory if it doesn't exist
mkdir -p "$LOGS_DIR"

# Log file
LOG_FILE="$LOGS_DIR/setup-$(date +%Y%m%d-%H%M%S).log"

# Log function
log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

# Header
log "${BLUE}=================================${NC}"
log "${BLUE}AI-Assisted Review Framework Setup${NC}"
log "${BLUE}=================================${NC}"
log "Framework directory: $FRAMEWORK_DIR"
log "Log file: $LOG_FILE"
log ""

# Check PHP
log "${YELLOW}Checking PHP...${NC}"
if ! command -v php &> /dev/null; then
    log "${RED}PHP is not installed or not in PATH${NC}"
    exit 1
fi
PHP_VERSION=$(php -v | head -n 1)
log "${GREEN}PHP found: $PHP_VERSION${NC}"
log ""

# Check Composer
log "${YELLOW}Checking Composer...${NC}"
if ! command -v composer &> /dev/null; then
    log "${RED}Composer is not installed or not in PATH${NC}"
    exit 1
fi
COMPOSER_VERSION=$(composer --version | head -n 1)
log "${GREEN}Composer found: $COMPOSER_VERSION${NC}"
log ""

# Install dependencies
log "${YELLOW}Installing dependencies...${NC}"
cd "$FRAMEWORK_DIR" || exit 1
composer install --no-interaction
if [ $? -ne 0 ]; then
    log "${RED}Failed to install dependencies${NC}"
    exit 1
fi
log "${GREEN}Dependencies installed successfully${NC}"
log ""

# Fix parent project context issues
log "${YELLOW}Applying fixes to parent project context files...${NC}"
php "$FRAMEWORK_DIR/patch-plugin-context.php"
if [ $? -ne 0 ]; then
    log "${RED}Warning: Failed to apply fixes to parent project context files${NC}"
    log "${YELLOW}This may not be an issue if the files were already fixed${NC}"
else
    log "${GREEN}Parent project context fixes applied successfully${NC}"
fi
log ""

# Run the PHP test runner
log "${YELLOW}Running comprehensive test suite...${NC}"
php "$FRAMEWORK_DIR/run-all-tests.php"
TESTS_STATUS=$?

# Summary
log "${BLUE}=================================${NC}"
if [ $TESTS_STATUS -ne 0 ]; then
    log "${RED}Some tests failed - please check the logs${NC}"
    log "${YELLOW}For detailed error logs, see:${NC}"
    log "  - $LOGS_DIR"
    exit 1
else
    log "${GREEN}All setup steps and tests completed successfully!${NC}"
    log "${GREEN}The AI-Assisted Review Framework is ready to use.${NC}"
fi
log "${BLUE}=================================${NC}" 