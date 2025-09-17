# Role Mention System - Quick Start Guide

This guide provides a quick overview of how to set up and use the Role Mention System.

## What is the Role Mention System?

The Role Mention System allows you to use @mentions in Cursor to activate different AI roles. For example, typing `@ES` will activate the Executive Secretary role.

## Installation Options

You have two options for running the Role Mention Server:

### Option 1: Run as a Standalone Server (Temporary)

1. Open a command prompt in the project directory
2. Run: `node server.js`
3. The server will run until you close the command prompt
4. Verify the server is running by opening `http://localhost:3100` in your browser

### Option 2: Install as a Windows Service (Recommended)

1. Right-click on `install-windows-service.bat` and select "Run as Administrator"
2. Wait for the installation to complete
3. Manually start the service:
   - Press Win+R, type `services.msc` and press Enter
   - Find "RoleMentionServer" in the list
   - Right-click and select "Start" if it's not already running
4. Verify the server is running by opening `http://localhost:3100` in your browser (without /sse)
   - **Note:** If you try to access `http://localhost:3100/sse` directly in a browser, you will see "Not Found" - this is normal. The /sse endpoint is only for Cursor to use, not for direct browser viewing.

## Configure Cursor

After verifying the server is running:

1. Open Cursor IDE
2. Go to Settings > Features > MCP
3. Click "+ Add New MCP Server"
4. Select "SSE" as the type (not HTTP)
5. Enter "Role Mention Server" as the name
6. Enter "http://localhost:3100/sse" as the URL (with /sse)
7. Click "Add"

## Using Role Mentions

Once the server is running and Cursor is configured:

1. In a Cursor conversation, type an @mention followed by your request
2. Example: `@ES I need help coordinating a fundraising campaign`
3. The AI will respond as the Executive Secretary role

## Available Roles

- `@ES` - Executive Secretary
- `@SMM` - Social Media Manager
- `@BIC` - Business Income Coach
- `@CTW` - Copy Technical Writer
- `@DRC` - Dating Relationship Coach
- `@DCL` - Debt Consumer Law Coach
- `@MD` - Marketing Director
- `@SESM` - Software Engineering Scrum Master
- `@UFL` - Utah Family Lawyer

## Troubleshooting

### Server Not Running
- Make sure Node.js is installed
- Check if the service is running in services.msc
- Try restarting the service

### "Failed to create client" error in Cursor
- Make sure the server is running (verify at http://localhost:3100)
- Make sure you've selected "SSE" as the server type, not "HTTP"
- Make sure you've entered the URL correctly: http://localhost:3100/sse
- Try restarting Cursor after configuring the MCP server

### Browser shows "Not Found" at /sse endpoint
- This is normal and expected behavior
- The /sse endpoint is only for Cursor to use with SSE protocol
- Use http://localhost:3100 (without /sse) to verify the server is running 