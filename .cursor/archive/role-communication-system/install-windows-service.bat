@echo off
echo ===================================================
echo Role Mention Server - Windows Service Installation
echo ===================================================
echo.
echo This script will install the Role Mention Server as a Windows service.
echo The service will start automatically when Windows boots up.
echo.
echo NOTE: This script requires Administrator privileges.
echo If you see permission errors, please right-click and select "Run as Administrator".
echo.

REM Change to the directory where the batch file is located
cd /d "%~dp0"

echo Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo Failed to install dependencies. Please check the error message above.
    pause
    exit /b 1
)
echo Dependencies installed successfully.
echo.

echo Installing the Windows service...
powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0install-service.ps1\"'"
echo Installation complete. Please check the Windows Services manager for the RoleMentionServer service.
echo.

echo Waiting for the service to start...
timeout /t 5 > nul

echo Running automated tests...
call npm run test:automated
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Tests failed! Please check the errors above.
    echo The service is installed but may not be functioning correctly.
    echo Check the logs in the logs directory for more information.
    echo.
) else (
    echo.
    echo All tests passed successfully!
    echo.
)

echo ===================================================
echo IMPORTANT: Next Steps
echo ===================================================
echo 1. You may need to manually start the service:
echo    - Press Win+R, type 'services.msc' and press Enter
echo    - Find "RoleMentionServer" in the list
echo    - Right-click and select "Start" if it's not running
echo.
echo 2. Verify the server is running:
echo    - Open http://localhost:3100 in your web browser (without /sse)
echo    - You should see the Role Mention Server status page
echo.
echo 3. Configure Cursor:
echo    - Open Cursor IDE
echo    - Go to Settings > Features > MCP
echo    - Click "+ Add New MCP Server"
echo    - Select "SSE" as the type (not HTTP)
echo    - Enter "Role Mention Server" as the name
echo    - Enter "http://localhost:3100/sse" as the URL (with /sse)
echo    - Click "Add"
echo.
echo NOTE: If you try to access http://localhost:3100/sse directly in a browser,
echo       you will see "Not Found" - this is normal. The /sse endpoint is only
echo       for Cursor to use, not for direct browser viewing.
echo.
echo 4. Start using @mentions in Cursor:
echo    Example: @ES I need help coordinating a fundraising campaign
echo ===================================================
echo.

echo When installation is complete, you can close this window.
echo The service will continue running in the background.
pause 