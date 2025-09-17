@echo off
cd /d "%~dp0"
if not exist logs mkdir logs
if not exist error_screenshots mkdir error_screenshots
if not exist debug_screenshots mkdir debug_screenshots
if not exist debug_html mkdir debug_html

echo Starting messenger at %date% %time% > logs/messenger_startup.log
pip install -r requirements.txt
pip install undetected-chromedriver
python -u linkedin_messenger.py 2>> logs/messenger_error.log 