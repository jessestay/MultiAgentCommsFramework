# Ensure we're running with admin privileges
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "Please run this script as Administrator"
    exit 1
}

# Get the current directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# Create the service using New-Service
$serviceName = "RoleMentionServer"
$displayName = "Role Mention Server"
$description = "Role Mention Server for Cursor"
$binaryPath = "cmd.exe /c `"$scriptPath\run-server.bat`""

# Remove existing service if it exists
if (Get-Service $serviceName -ErrorAction SilentlyContinue) {
    Write-Host "Removing existing service..."
    Stop-Service $serviceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $serviceName
    Start-Sleep -Seconds 2
}

# Create the new service
Write-Host "Creating new service..."
$service = New-Service -Name $serviceName `
    -DisplayName $displayName `
    -Description $description `
    -BinaryPathName $binaryPath `
    -StartupType Automatic

# Set the service account to NetworkService
Write-Host "Configuring service account..."
$servicePath = "HKLM:\System\CurrentControlSet\Services\$serviceName"
Set-ItemProperty -Path $servicePath -Name "ObjectName" -Value "NT AUTHORITY\NetworkService"

# Grant necessary permissions
Write-Host "Setting permissions..."
$acl = Get-Acl $scriptPath
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule("NT AUTHORITY\NetworkService", "ReadAndExecute", "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.SetAccessRule($rule)
Set-Acl $scriptPath $acl

# Start the service
Write-Host "Starting service..."
Start-Sleep -Seconds 2
Start-Service $serviceName

Write-Host "Service installation complete!"
Write-Host "Service name: $serviceName"
Write-Host "Status: $((Get-Service $serviceName).Status)" 