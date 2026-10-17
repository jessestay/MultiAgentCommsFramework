@echo off
REM Set up environment variables
set NODE_ENV=production
set PORT=3100
set CURSOR_MCP_SERVER=true

REM Change to the script's directory
cd /d "%~dp0"

REM Run the server
node standalone-server.js 