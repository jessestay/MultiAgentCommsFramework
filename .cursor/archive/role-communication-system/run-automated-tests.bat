@echo off
echo ===================================================
echo Role Mention Server - Automated Test Runner
echo ===================================================
echo.
echo This script will run automated tests for the Role Mention Server.
echo.

REM Change to the directory where the batch file is located
cd /d "%~dp0"

REM Check if the eventsource package is installed
echo Checking dependencies...
call npm list eventsource || (
  echo Installing eventsource package...
  call npm install eventsource --save-dev
)
echo.

REM Check if the service is installed
echo Checking if the service is installed...
sc query RoleMentionServer > nul
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo The RoleMentionServer service is not installed.
    echo Running tests against standalone server...
    echo.
    
    REM Start the standalone server in a new window
    echo Starting standalone server for testing...
    start "Role Mention Server" cmd /k "node standalone-server.js"
    
    REM Wait for the server to start
    echo Waiting for server to start...
    timeout /t 5 > nul
) else (
    echo Service is installed.
    
    REM Check if the service is running
    echo Checking if the service is running...
    sc query RoleMentionServer | find "RUNNING" > nul
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo The RoleMentionServer service is not running.
        echo Starting the service...
        sc start RoleMentionServer
        echo Waiting for the service to start...
        timeout /t 5 > nul
    ) else (
        echo Service is running.
    )
)

REM Run the automated tests
echo.
echo Running automated tests...
echo.
call node tests/automated-service-tests.js

REM Check the exit code
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Tests failed! Please check the errors above.
  echo Check the logs in the logs directory for more information.
  echo.
  
  REM If we started a standalone server, ask if we should stop it
  sc query RoleMentionServer > nul
  if %ERRORLEVEL% NEQ 0 (
    echo A standalone server was started for testing.
    set /p STOP_SERVER="Do you want to stop the standalone server? (Y/N): "
    if /i "%STOP_SERVER%"=="Y" (
      echo Stopping standalone server...
      taskkill /fi "WINDOWTITLE eq Role Mention Server" /f
      echo Standalone server stopped.
    )
  )
  
  pause
  exit /b 1
) else (
  echo.
  echo All tests passed successfully!
  echo.
  
  REM If we started a standalone server, ask if we should stop it
  sc query RoleMentionServer > nul
  if %ERRORLEVEL% NEQ 0 (
    echo A standalone server was started for testing.
    set /p STOP_SERVER="Do you want to stop the standalone server? (Y/N): "
    if /i "%STOP_SERVER%"=="Y" (
      echo Stopping standalone server...
      taskkill /fi "WINDOWTITLE eq Role Mention Server" /f
      echo Standalone server stopped.
    )
  )
  
  echo.
  echo Cursor Configuration Instructions:
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
) 