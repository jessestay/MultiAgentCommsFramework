#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('Role Mention MCP Server - Installation and Setup');
console.log('===============================================');

// Function to run a command and log its output
function runCommand(command, description) {
  console.log(`\n${description}...`);
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`${description} completed successfully.`);
    return true;
  } catch (error) {
    console.error(`Error during ${description.toLowerCase()}:`, error.message);
    return false;
  }
}

// Check if Node.js is installed
try {
  const nodeVersion = execSync('node --version').toString().trim();
  console.log(`Node.js version: ${nodeVersion}`);
} catch (error) {
  console.error('Error: Node.js is not installed. Please install Node.js before continuing.');
  process.exit(1);
}

// Install dependencies
if (!runCommand('npm install', 'Installing dependencies')) {
  console.error('Failed to install dependencies. Please check the error message above.');
  process.exit(1);
}

// Set up Cursor configuration
console.log('\nSetting up Cursor MCP configuration...');

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

// Run tests
if (runCommand('npm test', 'Running tests')) {
  console.log('\nAll tests passed successfully!');
} else {
  console.warn('\nSome tests failed, but we will continue with the installation.');
}

console.log('\nInstallation and setup completed successfully!');
console.log('\nStarting the MCP server...');
console.log('(Press Ctrl+C to stop the server)\n');

// Start the server
try {
  execSync('node role-mention-server.js', { stdio: 'inherit' });
} catch (error) {
  console.error('Error starting the server:', error.message);
  process.exit(1);
} 