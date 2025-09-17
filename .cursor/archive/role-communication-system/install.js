#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Role Mention MCP Server Installation');
console.log('====================================');

// Check if Node.js is installed
try {
  const nodeVersion = execSync('node --version').toString().trim();
  console.log(`Node.js version: ${nodeVersion}`);
} catch (error) {
  console.error('Error: Node.js is not installed. Please install Node.js before continuing.');
  process.exit(1);
}

// Install dependencies
console.log('\nInstalling dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('Dependencies installed successfully.');
} catch (error) {
  console.error('Error installing dependencies:', error.message);
  process.exit(1);
}

// Create .cursor directory if it doesn't exist
const cursorDir = path.join(process.cwd(), '.cursor');
if (!fs.existsSync(cursorDir)) {
  console.log('\nCreating .cursor directory...');
  try {
    fs.mkdirSync(cursorDir, { recursive: true });
    console.log('.cursor directory created successfully.');
  } catch (error) {
    console.error('Error creating .cursor directory:', error.message);
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
console.log('\nCreating MCP configuration file...');
try {
  fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
  console.log(`MCP configuration file created at ${mcpConfigPath}`);
} catch (error) {
  console.error('Error creating MCP configuration file:', error.message);
}

console.log('\nInstallation completed successfully!');
console.log('\nTo start the server, run:');
console.log('  npm start');
console.log('\nThen open Cursor and start using @mentions in your messages.');
console.log('Example: "Hey @ES, can you coordinate with the team about our fundraising campaign?"'); 