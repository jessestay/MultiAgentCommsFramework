# Get the current directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# Start the server in the background using the wrapper script
$serverProcess = Start-Process cmd -ArgumentList "/c `"$scriptPath\run-server.bat`"" -PassThru -WindowStyle Hidden

# Save the process ID to a file
$serverProcess.Id | Out-File "$scriptPath\server.pid"

Write-Host "Server started with PID: $($serverProcess.Id)"
Write-Host "Server URL: http://localhost:3100"
Write-Host "SSE Endpoint: http://localhost:3100/sse"
Write-Host "Status page: http://localhost:3100/status" 