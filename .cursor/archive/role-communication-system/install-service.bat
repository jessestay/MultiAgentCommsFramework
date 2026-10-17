@echo off
echo Installing Role Mention Server Windows Service...
powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0install-service.js\"'"
echo Installation complete. Please check the Windows Services manager for the RoleMentionServer service.
pause 