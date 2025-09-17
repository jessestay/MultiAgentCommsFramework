@echo off
echo ===================================================
echo Simple Role Mention Server - Starter
echo ===================================================
echo.
echo This script will start the Simple Role Mention Server.
echo.

REM Change to the directory where the batch file is located
cd /d "%~dp0"

REM Run the server
echo Starting the server...
echo.
node simple-role-server.js

REM This line will only be reached if the server stops
echo.
echo The server has stopped.
echo.
pause 