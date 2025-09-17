@echo off
echo Checking for Chrome installation...

where chrome >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Chrome not found. Attempting to download and install...
    
    :: Download Chrome installer
    curl -L "https://dl.google.com/chrome/install/latest/chrome_installer.exe" -o chrome_installer.exe
    
    if exist chrome_installer.exe (
        echo Installing Chrome...
        chrome_installer.exe /silent /install
        
        if %ERRORLEVEL% EQU 0 (
            echo Chrome installed successfully.
        ) else (
            echo Failed to install Chrome. Please install it manually.
        )
        
        del chrome_installer.exe
    ) else (
        echo Failed to download Chrome installer. Please install Chrome manually.
    )
) else (
    echo Chrome is already installed.
)

pause 