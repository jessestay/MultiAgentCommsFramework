const { Service } = require('node-windows');
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'MCPRoleMentionServer',
  description: 'MCP Role Mention Server for Cursor',
  script: path.join(__dirname, 'mcp-role-server.js'),
  nodeOptions: [],
  // Allow service to interact with desktop (optional)
  allowServiceInteraction: true,
  // Log output
  logOnAs: 'LocalSystem',
  // Dependencies
  dependencies: []
});

// Listen for the "install" event
svc.on('install', function() {
  console.log('Service installed successfully!');
  console.log('Starting service...');
  svc.start();
});

// Listen for the "start" event
svc.on('start', function() {
  console.log('Service started successfully!');
  console.log('The MCP Role Mention Server is now running as a Windows service.');
  console.log('It will automatically start when Windows boots up.');
  console.log('You can manage this service in the Windows Services manager.');
  console.log('Service name: MCPRoleMentionServer');
});

// Listen for the "error" event
svc.on('error', function(err) {
  console.error('Error installing service:', err);
  console.log('You might need to run this script as Administrator.');
});

// Install the service
console.log('Installing the MCP Role Mention Server as a Windows service...');
svc.install(); 