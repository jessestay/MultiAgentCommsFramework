#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('Setting up Cursor MCP configuration...');

// Determine the home directory
const homeDir = os.homedir();

// Create .cursor directory in the home directory if it doesn't exist
const cursorDir = path.join(homeDir, '.cursor');
if (!fs.existsSync(cursorDir)) {
  console.log(`Creating .cursor directory in ${homeDir}...`);
  try {
    fs.mkdirSync(cursorDir, { recursive: true });
    console.log('.cursor directory created successfully.');
  } catch (error) {
    console.error('Error creating .cursor directory:', error.message);
    process.exit(1);
  }
}

// Create MCP configuration file
const mcpConfig = {
  mcpServers: {
    'role-mention': {
      url: 'http://localhost:3000/sse'
    }
  }
};

const mcpConfigPath = path.join(cursorDir, 'mcp.json');
console.log(`Creating MCP configuration file at ${mcpConfigPath}...`);
try {
  fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
  console.log('MCP configuration file created successfully.');
} catch (error) {
  console.error('Error creating MCP configuration file:', error.message);
  process.exit(1);
}

// Also create a local .cursor directory in the current project
const projectCursorDir = path.join(process.cwd(), '.cursor');
if (!fs.existsSync(projectCursorDir)) {
  console.log('Creating .cursor directory in the current project...');
  try {
    fs.mkdirSync(projectCursorDir, { recursive: true });
    console.log('Project .cursor directory created successfully.');
  } catch (error) {
    console.error('Error creating project .cursor directory:', error.message);
  }
}

// Create MCP configuration file in the project directory
const projectMcpConfigPath = path.join(projectCursorDir, 'mcp.json');
console.log(`Creating MCP configuration file at ${projectMcpConfigPath}...`);
try {
  fs.writeFileSync(projectMcpConfigPath, JSON.stringify(mcpConfig, null, 2));
  console.log('Project MCP configuration file created successfully.');
} catch (error) {
  console.error('Error creating project MCP configuration file:', error.message);
}

console.log('\nCursor MCP configuration completed successfully!');
console.log('\nTo start using the role mention system:');
console.log('1. Start the MCP server: npm start');
console.log('2. Open Cursor IDE');
console.log('3. Use @mentions in your messages (e.g., "@ES, can you help with...")');
console.log('\nNote: You may need to restart Cursor for the MCP configuration to take effect.'); 