@echo off
echo Starting Role Mention Server...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
pause 