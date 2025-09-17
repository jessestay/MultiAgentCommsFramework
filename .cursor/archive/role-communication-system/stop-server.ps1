# Get the current directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# Read the process ID from the file
$pidFile = "$scriptPath\server.pid"
if (Test-Path $pidFile) {
    $processId = Get-Content $pidFile
    if ($processId) {
        try {
            Stop-Process -Id $processId -Force
            Remove-Item $pidFile
            Write-Host "Server stopped successfully"
        } catch {
            Write-Host "Error stopping server: $_"
        }
    } else {
        Write-Host "No server process ID found"
    }
} else {
    Write-Host "No server.pid file found"
} 