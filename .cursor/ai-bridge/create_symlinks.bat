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