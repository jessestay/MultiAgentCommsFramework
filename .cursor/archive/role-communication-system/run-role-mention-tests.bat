@echo off
echo ===================================================
echo Role Mention Functionality - Test Runner
echo ===================================================
echo.
echo This script will run tests specifically for the role mention functionality.
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

REM Run the tests
echo Running role mention tests...
echo.
node tests/role-mention-tests.js

REM Check the exit code
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Tests failed! Please check the errors above.
  echo.
  pause
  exit /b 1
) else (
  echo.
  echo All tests passed successfully!
  echo.
  pause
) 