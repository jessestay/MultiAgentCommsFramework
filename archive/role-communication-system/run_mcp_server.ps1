$ErrorActionPreference = "Stop"
$env:PYTHONIOENCODING = "utf-8"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Redirect stderr to a file
Start-Transcript -Path "$scriptPath\mcp_powershell.log" -Append

try {
    & "$scriptPath\.venv\Scripts\python.exe" "$scriptPath\mcp_command_server.py" *>&1
}
catch {
    $_ | Out-File "$scriptPath\mcp_error.log" -Append
    throw
}
finally {
    Stop-Transcript
} 