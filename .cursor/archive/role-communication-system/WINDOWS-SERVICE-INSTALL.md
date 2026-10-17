# Windows Service Installation Guide

This guide provides detailed instructions for installing the Role Mention Server as a Windows service.

## Prerequisites

- Windows 10 or later
- Node.js 14.x or later
- Administrator privileges

## Installation Steps

1. **Download the Role Mention Server**
   - Clone or download this repository to your local machine

2. **Install as a Windows Service**
   - Right-click on `install-windows-service.bat` and select "Run as administrator"
   - The script will:
     - Install required dependencies
     - Install the service as "RoleMentionServer"
     - Run automated tests to verify functionality
     - Provide next steps

3. **Verify the Service is Running**
   - Open Services (search for "services.msc" in the Start menu)
   - Find "RoleMentionServer" in the list
   - Verify that its status is "Running"
   - If not, right-click and select "Start"

4. **Test the Server**
   - Open http://localhost:3100 in your web browser
   - You should see the Role Mention Server status page
   - Alternatively, run `test-windows-service.bat` to run automated tests

## Automated Testing

The installation process includes automated tests to verify that the service is functioning correctly. These tests check:

1. **Server Status**: Verifies the server is running and accessible
2. **SSE Endpoint**: Verifies the SSE endpoint is properly implemented
3. **JSON-RPC Endpoint**: Verifies the JSON-RPC endpoint is working
4. **Role Mention Functionality**: Verifies role mentions are correctly detected and processed

Test logs are stored in the `logs` directory for troubleshooting.

You can run these tests at any time using:
```
test-windows-service.bat
```

## Configuring Cursor

1. **Open Cursor IDE**
   - Launch the Cursor IDE application

2. **Access MCP Settings**
   - Go to Settings > Features > MCP

3. **Add the Role Mention Server**
   - Click "+ Add New MCP Server"
   - Enter the following details:
     - Name: `Role Mention Server` (or any name you prefer)
     - Type: `SSE` (important: do NOT select "HTTP")
     - URL: `http://localhost:3100/sse` (important: include the /sse suffix)
   - Click "Add" to save the server configuration

4. **Restart Cursor**
   - Close and reopen Cursor to ensure the new MCP server is properly loaded

5. **Test @mentions**
   - Start a new conversation
   - Type `@ES Hello, can you help me?`
   - The AI should respond as the Executive Secretary role

## Troubleshooting

### Service Installation Issues

1. **Installation fails**
   - Make sure you're running the batch file as Administrator
   - Check if Node.js is installed and in your PATH
   - Check the Windows Event Viewer for error messages

2. **Service won't start**
   - Open Services (search for "services.msc" in the Start menu)
   - Find "RoleMentionServer" in the list
   - Right-click and select "Properties"
   - Check the "Log On" tab to ensure it has the necessary permissions
   - Check the Windows Event Viewer for error messages

3. **Tests fail**
   - Check the logs in the `logs` directory
   - Verify the service is running
   - Try running `test-windows-service.bat` again

### Cursor Integration Issues

1. **"Failed to create client" error**
   - Ensure the service is running (check `http://localhost:3100`)
   - Make sure you selected `SSE` as the server type (not "HTTP")
   - Verify you included `/sse` at the end of the URL
   - Restart Cursor completely

2. **No response when using @mentions**
   - Check if the service is running
   - Verify the MCP server is properly configured in Cursor
   - Try restarting Cursor
   - Check if you're using a valid role abbreviation

## Uninstallation

To remove the Windows service:

1. Run `uninstall-windows-service.bat` as administrator
2. The service will be stopped and removed from your system 