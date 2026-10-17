@echo off
echo ===================================================
echo Role Mention Server - Windows Service Test
echo ===================================================
echo.
echo This script will test if the Role Mention Server Windows service is running correctly.
echo.

REM Change to the directory where the batch file is located
cd /d "%~dp0"

echo Checking if the service is installed...
sc query RoleMentionServer > nul
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo The RoleMentionServer service is not installed.
    echo Please run install-windows-service.bat first.
    echo.
    pause
    exit /b 1
)

echo Checking if the service is running...
sc query RoleMentionServer | find "RUNNING" > nul
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo The RoleMentionServer service is not running.
    echo Starting the service...
    sc start RoleMentionServer
    echo Waiting for the service to start...
    timeout /t 5 > nul
)

echo Running automated tests...
call npm run test:automated
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Tests failed! Please check the errors above.
    echo The service may not be functioning correctly.
    echo Check the logs in the logs directory for more information.
    echo.
) else (
    echo.
    echo All tests passed successfully!
    echo.
)

echo ===================================================
echo Cursor Configuration Instructions
echo ===================================================
echo 1. Open Cursor IDE
echo 2. Go to Settings > Features > MCP
echo 3. Click "Add" to add a new MCP server
echo 4. Enter the following details:
echo    - Name: Role Mention Server (or any name you prefer)
echo    - Type: SSE (important: do NOT select "HTTP")
echo    - URL: http://localhost:3100/sse (important: include the /sse suffix)
echo 5. Click "Add" to save the server configuration
echo 6. Restart Cursor completely
echo 7. Test by typing @ES Hello in a conversation
echo.

pause 