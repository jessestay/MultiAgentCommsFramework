# Google Sheets MCP Server Setup Instructions

## Overview
This setup creates an n8n MCP Server Trigger workflow that exposes Google Sheets read/write operations as MCP tools, accessible from Cursor via `mcp-remote`.

## Step 1: Create Bearer Auth Credential in n8n

1. Go to n8n Settings → Credentials
2. Create new credential: **HTTP Bearer Auth**
3. Name: `Google Sheets MCP Bearer Auth`
4. Token: `sheets-mcp-token-2024`
5. Save

## Step 2: Create Sub-Workflows

### Sub-Workflow 1: Google Sheets Read

1. Create new workflow: **Google Sheets Read Subworkflow**
2. Add **Google Sheets** node:
   - Operation: **Read**
   - Document ID: `={{ $json.sheetId }}`
   - Sheet Name: `={{ $json.sheetName || 'Sheet1' }}`
   - Range: `={{ $json.range || 'A1:Z1000' }}`
3. Save workflow and note the **Workflow ID** (from URL)

### Sub-Workflow 2: Google Sheets Write

1. Create new workflow: **Google Sheets Write Subworkflow**
2. Add **Google Sheets** node:
   - Operation: **Append**
   - Document ID: `={{ $json.sheetId }}`
   - Sheet Name: `={{ $json.sheetName || 'Sheet1' }}`
   - Columns: Use `={{ $json.values }}` (array of rows)
3. Save workflow and note the **Workflow ID** (from URL)

## Step 3: Create Main MCP Server Workflow

1. Import `.cursor/shared_tools/google-sheets-mcp-workflow.json` into n8n
2. Update the **Call n8n Sub-Workflow Tool** nodes:
   - Replace `sheets-read-subworkflow` with actual workflow ID from Step 2.1
   - Replace `sheets-write-subworkflow` with actual workflow ID from Step 2.2
3. Connect **MCP Server Trigger** to both tool nodes
4. **Activate** the workflow
5. Copy the **Production MCP URL** from the MCP Server Trigger node (e.g., `http://localhost:5678/mcp/sheets`)

## Step 4: Update Cursor MCP Config

The `.cursor/mcp.json` file is already configured to use `mcp-remote-wrapper.js`. Update the MCP URL if needed:

```json
{
  "google-sheets-mcp": {
    "command": "node",
    "args": [
      ".cursor/shared_tools/mcp-remote-wrapper.js",
      "http://localhost:5678/mcp/sheets",  // ← Update with your actual MCP URL
      "--header",
      "Authorization: Bearer sheets-mcp-token-2024"
    ]
  }
}
```

## Step 5: Install mcp-remote (if not already installed)

The wrapper uses `mcp-remote` which should auto-install via `npx`, but you can pre-install:

```bash
npm install -g mcp-remote
```

## Step 6: Restart Cursor

Restart Cursor to load the new MCP server configuration.

## Verification

After setup, you should be able to use Google Sheets tools from Cursor. The MCP server exposes:
- `read_sheet`: Read data from a Google Sheet
- `write_sheet`: Write data to a Google Sheet

## Troubleshooting

- **"No row found" error**: Ensure the MCP Server Trigger workflow is **activated**
- **Connection errors**: Verify n8n is running on `http://localhost:5678`
- **Auth errors**: Check that the bearer token matches in both n8n credential and Cursor config
- **Tool not found**: Verify sub-workflow IDs are correct in the main workflow

