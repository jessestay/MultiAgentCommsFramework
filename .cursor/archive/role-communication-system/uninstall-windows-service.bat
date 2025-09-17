@echo off
echo ===================================================
echo Role Mention Server - Windows Service Uninstallation
echo ===================================================
echo.
echo This script will uninstall the Role Mention Server Windows service.
echo.
echo NOTE: This script requires Administrator privileges.
echo If you see permission errors, please right-click and select "Run as Administrator".
echo.

REM Change to the directory where the batch file is located
cd /d "%~dp0"

echo Uninstalling the Windows service...
call npm run uninstall-service
echo.

echo When uninstallation is complete, you can close this window.
pause 