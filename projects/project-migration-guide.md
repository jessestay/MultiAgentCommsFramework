# Project Migration Guide

This document outlines the process for migrating projects from the main AutomaticJesse workspace to their own dedicated workspaces while maintaining the role-based communication system and agile framework through symbolic links.

## Overview

The AutomaticJesse framework is designed as a parent-level system that applies to all child projects. When a project grows in complexity, it may benefit from having its own dedicated workspace. This guide documents the process for:

1. Creating a new dedicated workspace for a project
2. Setting up proper symlinks to maintain framework consistency
3. Configuring references between the original and new locations

## Migration Process

### 1. Create the New Workspace

First, create a new directory for your project in a suitable location:

```bash
# Create the new project directory
mkdir "C:\Users\stay\OneDrive\Documents\Github Repos\[project-name]"

# If the project has subdirectories, create those as well
mkdir "C:\Users\stay\OneDrive\Documents\Github Repos\[project-name]\[subproject-name]"
```

### 2. Copy Project Files

Copy all necessary project files to the new location:

```bash
# Copy all project files to the new location
xcopy "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\[project-name]\*" "C:\Users\stay\OneDrive\Documents\Github Repos\[project-name]\" /E /H /C /I
```

### 3. Create Symlinks

#### 3.1 Create the Batch File

Create a batch file with the following content, replacing `[project-name]` and `[subproject-name]` with your actual project names:

```batch
@echo off
echo Creating symbolic links...

REM Create symlink for cursor rules directory
rmdir /S /Q "C:\Users\stay\OneDrive\Documents\Github Repos\[project-name]\.cursor\rules" 2>nul
mkdir "C:\Users\stay\OneDrive\Documents\Github Repos\[project-name]\.cursor" 2>nul
mklink /D "C:\Users\stay\OneDrive\Documents\Github Repos\[project-name]\.cursor\rules" "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\.cursor\rules"

REM Create symlink in AutomaticJesse/projects for the main project
if not exist "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects" mkdir "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects"
rmdir /S /Q "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\[project-name]" 2>nul
mklink /D "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\[project-name]" "C:\Users\stay\OneDrive\Documents\Github Repos\[project-name]"

REM Create symlink for subprojects if they exist
rmdir /S /Q "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\[subproject-name]" 2>nul
mklink /D "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\[subproject-name]" "C:\Users\stay\OneDrive\Documents\Github Repos\[project-name]\[subproject-name]"

echo Symlinks created successfully!
pause
```

#### 3.2 Run the Batch File with Administrator Privileges

Run the batch file with administrator privileges to create the symlinks:

```bash
# Using PowerShell
Start-Process -FilePath "create_symlinks.bat" -Verb RunAs -Wait
```

Or through GUI: right-click the batch file and select "Run as administrator".

### 4. Verify Symlinks

Verify that the symlinks were created correctly:

```bash
# Using PowerShell
Get-Item -Path "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\[project-name]", "C:\Users\stay\OneDrive\Documents\Github Repos\[project-name]\.cursor\rules" | ForEach-Object { "$($_.FullName) - $(if($_.LinkType){'SymbolicLink -> ' + $_.Target} else {'Regular directory'})" }
```

### 5. Update README Files

#### 5.1 Create a Reference README in the Original Location

Create a README.md file in the original project location with information about the new location:

```markdown
# [Project Name] Reference

**IMPORTANT: This project has been moved to its own dedicated workspace.**

## New Location

This project is now maintained in its own workspace at:
```
C:\Users\stay\OneDrive\Documents\Github Repos\[project-name]
```

## Overview

Brief description of what the project does.

## Primary Components

1. Component 1
2. Component 2
3. Component 3

## Team Framework

This project maintains the same role-based communication system and Agile framework from the main AutomaticJesse workspace.

## Current Status

Current development status and focus areas.

Please refer to the new workspace location for the most up-to-date code and documentation.
```

#### 5.2 Update the README in the New Location

Ensure the README.md in the new location is comprehensive and includes:

- Project overview and goals
- Installation and setup instructions
- Usage examples
- Development workflow
- Links to relevant documentation

## 6. Git Repository Setup (Optional)

If you want to create a separate Git repository for the project:

```bash
# Initialize Git repository
cd "C:\Users\stay\OneDrive\Documents\Github Repos\[project-name]"
git init
git add .
git commit -m "Initial commit after migration from AutomaticJesse"

# Add remote and push (if using GitHub)
git remote add origin https://github.com/yourusername/[project-name].git
git push -u origin main
```

## Common Issues and Solutions

### Permission Denied When Creating Symlinks

**Issue**: You receive "Access denied" or "Insufficient privileges" when trying to create symlinks.

**Solution**: Run the batch file or PowerShell commands with administrator privileges.

### Symlink Target Not Found

**Issue**: Symlink creation fails because target doesn't exist.

**Solution**: Ensure all directories exist before creating symlinks. The batch file should handle this with the `mkdir` commands.

### Changes Not Reflecting Across Symlinks

**Issue**: Changes in one location are not visible in the linked location.

**Solution**: Symlinks work transparently for file operations. If changes aren't reflecting, verify the symlink is working correctly using `Get-Item` in PowerShell.

## Real-World Example: Social Media Growth AI Migration

The Social Media Growth AI project was successfully migrated using this process:

1. Created new workspace at `C:\Users\stay\OneDrive\Documents\Github Repos\social-media-growth-ai`
2. Created the symlinks:
   - Linked `.cursor/rules` to the main AutomaticJesse rules directory
   - Created symlinks in the original AutomaticJesse directory pointing to the new workspace
3. Updated READMEs in both locations
4. Verified all symlinks were working correctly

The batch file used for this migration was:

```batch
@echo off
echo Creating symbolic links...

REM Create symlink for cursor rules directory
rmdir /S /Q "C:\Users\stay\OneDrive\Documents\Github Repos\social-media-growth-ai\.cursor\rules" 2>nul
mklink /D "C:\Users\stay\OneDrive\Documents\Github Repos\social-media-growth-ai\.cursor\rules" "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\.cursor\rules"

REM Create symlink in AutomaticJesse/projects for social-media-growth-ai
if not exist "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects" mkdir "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects"
rmdir /S /Q "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\social-media-growth-ai" 2>nul
mklink /D "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\social-media-growth-ai" "C:\Users\stay\OneDrive\Documents\Github Repos\social-media-growth-ai"

REM Create symlink in AutomaticJesse/projects for facebook-growth-ai
rmdir /S /Q "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\facebook-growth-ai" 2>nul
mklink /D "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\facebook-growth-ai" "C:\Users\stay\OneDrive\Documents\Github Repos\social-media-growth-ai\facebook-growth-ai"

echo Symlinks created successfully!
pause
```

## Conclusion

By following this process, you can maintain the benefits of the AutomaticJesse framework while giving projects their own dedicated workspace. The symlink structure ensures that all projects continue to share the same role-based communication system and agile framework, while allowing for independent development and organization.

This document should be updated whenever improvements to the migration process are discovered or when new requirements emerge.

---

*Created by: Executive Secretary (ES)*
*Last Updated: March 19, 2025* 