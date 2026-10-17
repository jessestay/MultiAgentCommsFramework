# Project Migration Guide for AutomaticJesse Framework

This guide outlines the process for migrating projects from the AutomaticJesse framework to their own workspaces while maintaining the role-based communication system and agile methodology.

## Overview

Migrating a project to its own workspace provides several benefits:
- Independent management of the project's codebase
- Clearer separation of concerns
- Ability to set up dedicated GitHub repositories
- More organized file structure

While migrating, we maintain integration with the parent AutomaticJesse framework through symlinks.

## Migration Process

### Step 1: Create New Workspace Directory

Create a dedicated directory for your project in a suitable location:

```powershell
mkdir "C:\Users\stay\OneDrive\Documents\Github Repos\project-name"
```

### Step 2: Copy Project Files

Copy all necessary project files to the new workspace:

```powershell
xcopy /E /I "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\project-name" "C:\Users\stay\OneDrive\Documents\Github Repos\project-name"
```

### Step 3: Create Symlinks for Cursor Rules and Project Directories

**CRITICAL: Every migrated project must maintain symlinks to ensure proper integration with the AutomaticJesse framework.**

Create a batch file named `create_symlinks.bat` with the following content, adjusted for your project:

```batch
@echo off
echo Creating symbolic links for the Project...

REM Create symlink for cursor rules directory in the new workspace
rmdir /S /Q "C:\Users\stay\OneDrive\Documents\Github Repos\project-name\.cursor\rules" 2>nul
mkdir "C:\Users\stay\OneDrive\Documents\Github Repos\project-name\.cursor" 2>nul
mklink /D "C:\Users\stay\OneDrive\Documents\Github Repos\project-name\.cursor\rules" "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\.cursor\rules"

REM Create symlink in AutomaticJesse/projects for the new workspace
if not exist "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects" mkdir "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects"
rmdir /S /Q "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\project-name" 2>nul
mklink /D "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\project-name" "C:\Users\stay\OneDrive\Documents\Github Repos\project-name"

echo Symlinks created successfully!
echo.
echo IMPORTANT: The cursor rules symlink has been created. Please verify that:
echo 1. C:\Users\stay\OneDrive\Documents\Github Repos\project-name\.cursor\rules points to 
echo    C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\.cursor\rules
echo 2. All role-based communication and visualization standards are properly linked
echo.
pause
```

Run this batch file with administrator privileges to create the symlinks.

### Step 4: Verify Symlinks

Verify that the symlinks have been created correctly:

```powershell
Get-Item "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\project-name" -Force | Select-Object LinkType, Target
Get-Item "C:\Users\stay\OneDrive\Documents\Github Repos\project-name\.cursor\rules" -Force | Select-Object LinkType, Target
```

### Step 5: Update README Files

1. In the original location, create a reference file (e.g., `project-name-reference.md`) pointing to the new workspace
2. In the new workspace, update or create a README.md file with proper project documentation

### Step 6: Setup Git Repository (Optional)

Set up a Git repository for the new workspace following the instructions in the project's GitHub setup guide.

## Example: Social Media Growth AI Migration

The Social Media Growth AI project was migrated using the following steps:

1. Created a new workspace directory:
```powershell
mkdir "C:\Users\stay\OneDrive\Documents\Github Repos\social-media-growth-ai"
```

2. Copied project files:
```powershell
xcopy /E /I "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\social-media-growth-ai" "C:\Users\stay\OneDrive\Documents\Github Repos\social-media-growth-ai"
```

3. Created a batch file (`create_symlinks.bat`) with the following content:
```batch
@echo off
echo Creating symbolic links for Social Media Growth AI...

REM Create symlink for cursor rules directory in the new workspace
rmdir /S /Q "C:\Users\stay\OneDrive\Documents\Github Repos\social-media-growth-ai\.cursor\rules" 2>nul
mkdir "C:\Users\stay\OneDrive\Documents\Github Repos\social-media-growth-ai\.cursor" 2>nul
mklink /D "C:\Users\stay\OneDrive\Documents\Github Repos\social-media-growth-ai\.cursor\rules" "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\.cursor\rules"

REM Create symlink in AutomaticJesse/projects for the new workspace
if not exist "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects" mkdir "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects"
rmdir /S /Q "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\social-media-growth-ai" 2>nul
mklink /D "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\social-media-growth-ai" "C:\Users\stay\OneDrive\Documents\Github Repos\social-media-growth-ai"

echo Symlinks created successfully!
pause
```

4. Ran the batch file with administrator privileges.

5. Updated READMEs and set up a GitHub repository.

## Example: AI Bridge Migration

The AI Bridge project was migrated using the following steps:

1. Created a new workspace directory:
```powershell
mkdir "C:\Users\stay\OneDrive\Documents\Github Repos\ai-bridge"
```

2. Copied project files from facebook-growth-ai/ai-bridge to the new workspace:
```powershell
xcopy /E /I "C:\Users\stay\OneDrive\Documents\Github Repos\social-media-growth-ai\facebook-growth-ai\ai-bridge" "C:\Users\stay\OneDrive\Documents\Github Repos\ai-bridge"
```

3. Created a batch file (`create_symlinks.bat`) with the following content:
```batch
@echo off
echo Creating symbolic links for the AI Bridge...

REM Create symlink for cursor rules directory in the AI Bridge workspace
rmdir /S /Q "C:\Users\stay\OneDrive\Documents\Github Repos\ai-bridge\.cursor\rules" 2>nul
mkdir "C:\Users\stay\OneDrive\Documents\Github Repos\ai-bridge\.cursor" 2>nul
mklink /D "C:\Users\stay\OneDrive\Documents\Github Repos\ai-bridge\.cursor\rules" "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\.cursor\rules"

REM Create symlink in AutomaticJesse/projects for the AI Bridge
if not exist "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects" mkdir "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects"
rmdir /S /Q "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\ai-bridge" 2>nul
mklink /D "C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\projects\ai-bridge" "C:\Users\stay\OneDrive\Documents\Github Repos\ai-bridge"

REM Replace the existing AI Bridge in facebook-growth-ai with a symlink to the new location
rmdir /S /Q "C:\Users\stay\OneDrive\Documents\Github Repos\social-media-growth-ai\facebook-growth-ai\ai-bridge" 2>nul
mklink /D "C:\Users\stay\OneDrive\Documents\Github Repos\social-media-growth-ai\facebook-growth-ai\ai-bridge" "C:\Users\stay\OneDrive\Documents\Github Repos\ai-bridge"

echo Symlinks created successfully!
echo.
echo IMPORTANT: The cursor rules symlink has been created. Please verify that:
echo 1. C:\Users\stay\OneDrive\Documents\Github Repos\ai-bridge\.cursor\rules points to 
echo    C:\Users\stay\OneDrive\Documents\Github Repos\AutomaticJesse\.cursor\rules
echo 2. All role-based communication and visualization standards are properly linked
echo.
pause
```

4. Ran the batch file with administrator privileges.

5. Created a reference file in AutomaticJesse/projects/ai-bridge-reference.md pointing to the new workspace.

## Critical Importance of Cursor Rules Symlinks

The `.cursor/rules` directory contains all role definitions, communication protocols, and visualization standards that are essential for the proper functioning of the AutomaticJesse framework. When migrating a project:

1. **Always create a symlink** from the new workspace's `.cursor/rules` directory to the main AutomaticJesse `.cursor/rules` directory.
2. **Never copy** the rules directory, as this would create inconsistencies when rules are updated.
3. **Verify** that the symlink works correctly after creation.
4. **Test** the role communication system in the new workspace to ensure it follows the established standards.

All projects created within the AutomaticJesse ecosystem **must** maintain this symlink structure to ensure consistent role-based communication, visual identity, and agile methodology across all projects.

## Troubleshooting

### Symlink Permission Issues

If you encounter "Access denied" errors when creating symlinks:

1. Ensure you're running the batch file as administrator
2. Check that you have the "Create symbolic links" privilege (Local Security Policy > User Rights Assignment)
3. If using PowerShell directly, run with elevated privileges

### Verifying Symlinks

To verify a symlink in PowerShell:

```powershell
Get-Item "path\to\symlink" -Force | Select-Object LinkType, Target
```

In Command Prompt:

```cmd
dir "path\to\symlink" /AL
```

### Common Issues

1. **Missing role communications**: Ensure the symlink to `.cursor/rules` is working correctly
2. **Inconsistent formatting**: Check that the visual identity system is properly linked
3. **Role not responding**: Verify that all system triggers are properly set up

If problems persist, run the `create_symlinks.bat` file again with administrator privileges.

---

*Created by: Executive Secretary (ES)*  
*Last Updated: March 19, 2025* 