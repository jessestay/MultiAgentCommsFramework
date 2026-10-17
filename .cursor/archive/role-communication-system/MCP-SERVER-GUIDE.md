# MCP Role Mention Server Guide

This guide provides instructions for setting up and using the MCP Role Mention Server, which implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) for role-based communication in Cursor.

## What is the MCP Role Mention Server?

The MCP Role Mention Server is a server that implements the Model Context Protocol (MCP) to enable role-based communication in Cursor. It allows you to use @mentions in your conversations to activate different AI roles.

## Installation Options

You have two options for running the MCP Role Mention Server:

### Option 1: Run as a Standalone Server (Temporary)

1. Open a command prompt in the project directory
2. Run: `npm run start:mcp`
3. The server will run until you close the command prompt
4. Verify the server is running by opening `http://localhost:3100` in your browser

### Option 2: Install as a Windows Service (Recommended)

1. Right-click on `install-mcp-service.bat` and select "Run as Administrator"
2. Wait for the installation to complete
3. Manually start the service:
   - Press Win+R, type `services.msc` and press Enter
   - Find "MCPRoleMentionServer" in the list
   - Right-click and select "Start" if it's not already running
4. Verify the server is running by opening `http://localhost:3100` in your browser

## Configure Cursor

After verifying the server is running:

1. Open Cursor IDE
2. Go to Settings > Features > MCP
3. Click "+ Add New MCP Server"
4. Select "SSE" as the type (not HTTP)
5. Enter "MCP Role Mention Server" as the name
6. Enter "http://localhost:3100/sse" as the URL
7. Click "Add"
8. Restart Cursor completely

## Using Role Mentions

Once the server is running and Cursor is configured:

1. In a Cursor conversation, type an @mention followed by your request
2. Example: `@ES I need help coordinating a fundraising campaign`
3. The AI will respond as the Executive Secretary role

## Available Roles

- `@ES` - Executive Secretary
- `@SET` - Software Engineering Team
- `@MD` - Marketing Director
- `@SMM` - Social Media Manager
- `@CTW` - Copy Technical Writer
- `@BIC` - Business Income Coach
- `@UFL` - Utah Family Lawyer
- `@DLC` - Debt Consumer Law Coach
- `@SE` - Software Engineering Scrum Master
- `@DRC` - Dating Relationship Coach

## Troubleshooting

### Server Not Running
- Make sure Node.js is installed
- Check if the service is running in services.msc
- Try restarting the service

### "No tools available" or "No resources available" in Cursor
- Make sure the server is running
- Make sure you're using the correct URL: `http://localhost:3100/sse`
- Make sure you've selected "SSE" as the server type, not "HTTP"
- Try removing and re-adding the MCP server in Cursor
- Restart Cursor completely

### @mentions Not Working
- Make sure the server is running
- Make sure Cursor is configured correctly
- Try restarting Cursor
- Check the server logs for any errors

## Technical Details

The MCP Role Mention Server implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) version 2024-11-05. It provides the following tools and resources:

### Tools

1. `handle_role_mention` - Automatically detect and handle @role mentions in messages
2. `get_role_info` - Get information about available roles

### Resources

1. `available_roles` - List of available roles with their descriptions
2. `role_communication_protocol` - Protocol for role-based communication

## Uninstallation

To uninstall the Windows service:

1. Right-click on `uninstall-mcp-service.bat` and select "Run as Administrator"
2. Wait for the uninstallation to complete 