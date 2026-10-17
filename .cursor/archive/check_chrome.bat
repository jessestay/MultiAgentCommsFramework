@echo off
echo Checking for Chrome installation in common locations...

set FOUND=0

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    echo Found Chrome at: C:\Program Files\Google\Chrome\Application\chrome.exe
    set FOUND=1
)

if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    echo Found Chrome at: C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
    set FOUND=1
)

if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    echo Found Chrome at: %LOCALAPPDATA%\Google\Chrome\Application\chrome.exe
    set FOUND=1
)

if %FOUND%==0 (
    echo Chrome not found in common locations.
    echo Please install Chrome manually from: https://www.google.com/chrome/
)

pause 