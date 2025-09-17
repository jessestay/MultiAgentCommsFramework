const { Service } = require('node-windows');
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'MCPRoleMentionServer',
  description: 'MCP Role Mention Server for Cursor',
  script: path.join(__dirname, 'mcp-role-server.js')
});

// Listen for the "uninstall" event
svc.on('uninstall', function() {
  console.log('Service uninstalled successfully!');
  console.log('The MCP Role Mention Server Windows service has been removed.');
});

// Listen for the "error" event
svc.on('error', function(err) {
  console.error('Error uninstalling service:', err);
  console.log('You might need to run this script as Administrator.');
});

// Uninstall the service
console.log('Uninstalling the MCP Role Mention Server Windows service...');
svc.uninstall(); 