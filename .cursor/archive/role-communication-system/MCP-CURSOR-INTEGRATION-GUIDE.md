# MCP Role Mention Server - Cursor Integration Guide

This guide provides detailed instructions for setting up and using the MCP Role Mention Server with Cursor IDE.

## Overview

The MCP Role Mention Server implements the Model Context Protocol (MCP) to enable role-based communication in Cursor. This allows you to use @mentions in your conversations to activate different expert roles.

## Server Options

You have two options for running the server:

1. **Direct MCP Server** - A lightweight server running on port 3200
2. **Windows Service** - A background service that runs automatically on system startup

## Installation and Setup

### Option 1: Running the Direct MCP Server

1. **Start the server**:
   - Run `run-direct-mcp-server.bat` by double-clicking it
   - The server will start on port 3200

2. **Verify the server is running**:
   - Open a web browser and navigate to `http://localhost:3200`
   - You should see a status page showing the server is running

3. **Configure Cursor**:
   - Open Cursor IDE
   - Go to Settings > Features > MCP
   - Click "Add" to add a new MCP server
   - Enter the following details:
     - Name: `Role Mention Server` (or any name you prefer)
     - Type: `SSE` (important: do NOT select "HTTP")
     - URL: `http://localhost:3200/sse` (important: include the `/sse` suffix)
   - Click "Add" to save the server configuration

4. **Restart Cursor**:
   - Close and reopen Cursor to ensure the new MCP server is properly loaded

### Option 2: Installing as a Windows Service

1. **Install the service**:
   - Right-click `install-windows-service.bat` and select "Run as administrator"
   - Follow the prompts to install the service

2. **Start the service**:
   - Open Services (search for "services.msc" in the Start menu)
   - Find "MCP Role Mention Server" in the list
   - Right-click and select "Start"

3. **Verify the server is running**:
   - Open a web browser and navigate to `http://localhost:3100`
   - You should see a status page showing the server is running

4. **Configure Cursor**:
   - Open Cursor IDE
   - Go to Settings > Features > MCP
   - Click "Add" to add a new MCP server
   - Enter the following details:
     - Name: `Role Mention Server` (or any name you prefer)
     - Type: `SSE` (important: do NOT select "HTTP")
     - URL: `http://localhost:3100/sse` (important: include the `/sse` suffix)
   - Click "Add" to save the server configuration

5. **Restart Cursor**:
   - Close and reopen Cursor to ensure the new MCP server is properly loaded

## Using Role Mentions in Cursor

Once the server is running and Cursor is configured, you can use @mentions in your conversations:

1. Start a new conversation in Cursor
2. Type `@` followed by a role abbreviation, for example: `@ES Hello`
3. The AI will respond as the mentioned role

### Available Roles

The following roles are available for @mentions:

| Abbreviation | Full Name | Expertise |
|--------------|-----------|-----------|
| ES | Executive Secretary | coordination, scheduling, communication management, task delegation |
| SET | Software Engineering Team | software development, system architecture, technical implementation, coding |
| MD | Marketing Director | marketing strategy, campaign planning, brand management, market analysis |
| SMM | Social Media Manager | social media management, content creation, audience engagement, platform optimization |
| CTW | Copy/Technical Writer | content writing, technical documentation, copywriting, editing |
| BIC | Business Income Coach | business strategy, income optimization, revenue growth, financial planning |
| UFL | Utah Family Lawyer | Utah family law, legal advice, document preparation, case strategy |
| DLC | Debt/Consumer Law Coach | debt management, consumer law, legal defense, financial protection |
| SE | Software Engineering Scrum Master | agile methodology, scrum practices, sprint planning, team coordination |
| DRC | Dating/Relationship Coach | relationship advice, dating strategies, communication improvement, conflict resolution |

## Troubleshooting

### Server Issues

1. **Server won't start**:
   - Ensure Node.js is installed on your system
   - Check if another application is using port 3100 or 3200
   - Run the server from a command prompt to see error messages

2. **Windows service won't start**:
   - Check the Windows Event Viewer for error messages
   - Ensure the service has the correct permissions
   - Try uninstalling and reinstalling the service

### Cursor Integration Issues

1. **"Failed to create client" error**:
   - Ensure the server is running (check `http://localhost:3100` or `http://localhost:3200`)
   - Make sure you selected `SSE` as the server type (not "HTTP")
   - Verify you included `/sse` at the end of the URL
   - Restart Cursor completely

2. **No response when using @mentions**:
   - Check if the server is running
   - Verify the MCP server is properly configured in Cursor
   - Try restarting Cursor
   - Check if you're using a valid role abbreviation

3. **"Not Found" when accessing `/sse` directly in browser**:
   - This is normal! The `/sse` endpoint is for Server-Sent Events and is not meant to be viewed directly in a browser
   - Use `http://localhost:3100` or `http://localhost:3200` (without `/sse`) to check if the server is running

## Advanced: Testing the SSE Endpoint

If you want to verify the SSE endpoint is working correctly:

1. Open the file `test-sse.html` in a web browser
2. Enter the SSE URL (`http://localhost:3200/sse` or `http://localhost:3100/sse`)
3. Click "Connect"
4. You should see messages from the server, including connection status and tool definitions

## Uninstallation

### Removing the Windows Service

1. Run `uninstall-windows-service.bat` as administrator
2. The service will be stopped and removed from your system

### Stopping the Direct Server

1. Press Ctrl+C in the command window where the server is running
2. Close the command window 