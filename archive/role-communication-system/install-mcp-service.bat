@echo off
echo ===================================================
echo MCP Role Mention Server - Windows Service Installation
echo ===================================================
echo.
echo This script will install the MCP Role Mention Server as a Windows service.
echo The service will start automatically when Windows boots up.
echo.
echo NOTE: This script requires Administrator privileges.
echo If you see permission errors, please right-click and select "Run as Administrator".
echo.

REM Change to the directory where the batch file is located
cd /d "%~dp0"

echo Installing dependencies...
call npm install node-windows --save
call npm install github:modelcontextprotocol/typescript-sdk --save
if %ERRORLEVEL% NEQ 0 (
    echo Failed to install dependencies. Please check the error message above.
    pause
    exit /b 1
)
echo Dependencies installed successfully.
echo.

echo Installing the Windows service...
call node install-mcp-service.js
echo.

echo ===================================================
echo IMPORTANT: Next Steps
echo ===================================================
echo 1. You may need to manually start the service:
echo    - Press Win+R, type 'services.msc' and press Enter
echo    - Find "MCPRoleMentionServer" in the list
echo    - Right-click and select "Start" if it's not running
echo.
echo 2. Verify the server is running:
echo    - Open http://localhost:3100 in your web browser
echo    - You should see the MCP Role Mention Server status page
echo.
echo 3. Configure Cursor:
echo    - Open Cursor IDE
echo    - Go to Settings > Features > MCP
echo    - Click "+ Add New MCP Server"
echo    - Select "SSE" as the type (not HTTP)
echo    - Enter "MCP Role Mention Server" as the name
echo    - Enter "http://localhost:3100/sse" as the URL
echo    - Click "Add"
echo.
echo 4. Start using @mentions in Cursor:
echo    Example: @ES I need help coordinating a fundraising campaign
echo ===================================================
echo.

echo When installation is complete, you can close this window.
echo The service will continue running in the background.
pause 