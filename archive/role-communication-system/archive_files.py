#!/usr/bin/env python3
import os
import shutil
from datetime import datetime

def create_archive():
    """Create an archive directory and move non-relevant files there."""
    print("Starting archiving process...")
    
    # Files to keep in the main directory
    keep_files = [
        "generate_role_system.py",
        "role_manager.py",
        "role_activation.md",
        "README.md",
        "archive_files.py"  # Keep this script
    ]
    
    # Directories to keep in the main directory
    keep_dirs = [
        "Claude-Roles",
        "archive",
        ".cursor",
        ".git"
    ]
    
    # Create archive directory if it doesn't exist
    if not os.path.exists("archive"):
        os.makedirs("archive")
        print("Created archive directory")
    
    # Create README in archive directory
    readme_content = f"""# Archive of AutomaticJesse Files

This directory contains files and directories from the original AutomaticJesse project that were created by AI roles established in ChatGPT. These files are preserved for future reference and potential use by individual AI roles in Cursor/Claude.

## Purpose

- Maintain historical context for AI roles
- Preserve work products from previous role interactions
- Provide reference materials for future role tasks
- Enable continuity between ChatGPT and Cursor/Claude implementations

## Usage

Individual roles may access these archived files when relevant to their assigned tasks. The archive structure maintains the original organization to facilitate easy reference.

*Last Updated: {datetime.now().strftime("%Y-%m-%d")}*
"""
    
    with open(os.path.join("archive", "README.md"), "w") as f:
        f.write(readme_content)
    
    # Move files to archive
    files_moved = 0
    for item in os.listdir("."):
        # Skip directories and files we want to keep
        if os.path.isdir(item):
            if item not in keep_dirs:
                try:
                    shutil.move(item, os.path.join("archive", item))
                    print(f"Moved directory: {item} to archive")
                    files_moved += 1
                except Exception as e:
                    print(f"Error moving directory {item}: {e}")
        elif item not in keep_files:
            try:
                shutil.move(item, os.path.join("archive", item))
                print(f"Moved file: {item} to archive")
                files_moved += 1
            except Exception as e:
                print(f"Error moving file {item}: {e}")
    
    print(f"Archiving complete. {files_moved} items moved to archive directory.")
    print("Archive contents:")
    for item in os.listdir("archive"):
        print(f"  - {item}")

if __name__ == "__main__":
    create_archive() 