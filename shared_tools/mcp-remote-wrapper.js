#!/usr/bin/env node
/**
 * MCP Remote Wrapper for n8n MCP Server Trigger
 * 
 * This script proxies SSE-based MCP servers (like n8n's MCP Server Trigger)
 * to stdio-based MCP servers that Cursor can use.
 * 
 * Usage: node mcp-remote-wrapper.js <MCP_URL> [--header "Authorization: Bearer <TOKEN>"]
 */

const { spawn } = require('child_process');
const args = process.argv.slice(2);

if (args.length < 1) {
  console.error('Usage: node mcp-remote-wrapper.js <MCP_URL> [--header "Authorization: Bearer <TOKEN>"]');
  process.exit(1);
}

const mcpUrl = args[0];
const headerArgs = args.slice(1);

// Use mcp-remote to proxy SSE → stdio
const mcpRemote = spawn('npx', ['-y', 'mcp-remote', mcpUrl, ...headerArgs], {
  stdio: 'inherit',
  shell: true
});

mcpRemote.on('error', (error) => {
  console.error('Error spawning mcp-remote:', error);
  process.exit(1);
});

mcpRemote.on('exit', (code) => {
  process.exit(code || 0);
});

