#!/bin/bash

# Script to sync updates from .cursor folder to MultiAgentCommsFramework repository
# This script should be run from the .cursor directory

echo "Syncing updates to MultiAgentCommsFramework..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "Error: Not in a git repository. Please run this script from the .cursor directory."
    exit 1
fi

# Add all changes
git add .

# Check if there are any changes to commit
if git diff --staged --quiet; then
    echo "No changes to commit."
    exit 0
fi

# Commit changes with timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "Auto-sync cursor rules and framework updates - $TIMESTAMP"

# Push to remote repository
git push origin main

echo "Updates successfully synced to MultiAgentCommsFramework repository!" 