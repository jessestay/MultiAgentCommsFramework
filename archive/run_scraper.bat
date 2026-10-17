@echo off
cd /d %~dp0
"C:\Users\stay\AppData\Local\Microsoft\WindowsApps\python3.11.exe" -c "from automation_scheduler import run_scraper; run_scraper()" 