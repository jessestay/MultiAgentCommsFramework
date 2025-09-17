#!/usr/bin/env python
"""
Cleanup script for the Planner-Executor Architecture project.
This script moves log files to the logs directory and updates .cursorignore.
"""

import os
import shutil
from datetime import datetime

def ensure_directory_exists(directory):
    """Ensure that a directory exists, creating it if necessary."""
    if not os.path.exists(directory):
        os.makedirs(directory)
        print(f"Created directory: {directory}")

def move_logs_to_logs_directory():
    """Move log files from the root directory to the logs directory."""
    log_files = [
        "content_campaign.log",
        "planner_executor_demo_with_adapters.log",
        "planner_executor_demo.log"
    ]
    
    ensure_directory_exists("logs")
    
    for log_file in log_files:
        if os.path.exists(log_file):
            # Add timestamp to avoid overwriting existing files
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            new_filename = f"{os.path.splitext(log_file)[0]}_{timestamp}.log"
            destination = os.path.join("logs", new_filename)
            
            shutil.move(log_file, destination)
            print(f"Moved {log_file} to {destination}")

def update_cursorignore():
    """Update .cursorignore file with patterns for files to ignore."""
    ignore_patterns = [
        "# Log files",
        "*.log",
        "",
        "# Generated files",
        "conversations/",
        "plans/",
        "",
        "# Temporary files",
        "temp*.md",
        "temp.txt",
        "",
        "# Virtual environment",
        ".venv/",
        "",
        "# Cached files",
        "__pycache__/",
        "*.py[cod]",
        "*$py.class",
        ""
    ]
    
    # Read existing .cursorignore if it exists
    existing_patterns = []
    if os.path.exists(".cursorignore"):
        with open(".cursorignore", "r") as f:
            existing_patterns = [line.strip() for line in f.readlines()]
    
    # Merge patterns, avoiding duplicates
    all_patterns = []
    for pattern in ignore_patterns:
        if pattern not in existing_patterns:
            all_patterns.append(pattern)
    
    all_patterns.extend([p for p in existing_patterns if p not in ignore_patterns])
    
    # Write updated .cursorignore
    with open(".cursorignore", "w") as f:
        f.write("\n".join(all_patterns))
    
    print("Updated .cursorignore file")

def archive_one_time_use_files():
    """Move one-time use files to the archive directory."""
    one_time_files = [
        # Add any one-time use files here that should be archived
    ]
    
    ensure_directory_exists("archive")
    
    for file in one_time_files:
        if os.path.exists(file):
            destination = os.path.join("archive", file)
            shutil.move(file, destination)
            print(f"Archived {file} to {destination}")

def main():
    """Main function to run the cleanup process."""
    print("Starting cleanup process...")
    
    move_logs_to_logs_directory()
    update_cursorignore()
    archive_one_time_use_files()
    
    print("Cleanup process completed successfully!")

if __name__ == "__main__":
    main() 