@echo off
echo Stopping Role Mention Server...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-server.ps1"
pause 