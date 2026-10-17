@echo off
echo Role Mention MCP Server - Installation and Setup
echo ===============================================
echo.

echo Checking Node.js installation...
node --version
if %ERRORLEVEL% NEQ 0 (
  echo Error: Node.js is not installed. Please install Node.js before continuing.
  exit /b 1
)

echo.
echo Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
  echo Failed to install dependencies. Please check the error message above.
  exit /b 1
)

echo.
echo Setting up Cursor MCP configuration...
node setup-cursor.js
if %ERRORLEVEL% NEQ 0 (
  echo Failed to set up Cursor configuration. Please check the error message above.
  exit /b 1
)

echo.
echo Running tests...
call npm test
if %ERRORLEVEL% NEQ 0 (
  echo Some tests failed, but we will continue with the installation.
)

echo.
echo Installation and setup completed successfully!
echo.
echo Starting the MCP server...
echo (Press Ctrl+C to stop the server)
echo.

node role-mention-server.js 