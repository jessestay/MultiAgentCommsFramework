const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'RoleMentionServer',
  description: 'Role Mention Server for Cursor',
  script: path.join(__dirname, 'standalone-server.js'),
  nodeOptions: [],
  env: {
    name: "NODE_ENV",
    value: "production"
  }
});

// Listen for install events
svc.on('install', () => {
  console.log('Service installed successfully');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('Service is already installed');
  svc.uninstall();
});

svc.on('start', () => {
  console.log('Service started successfully');
});

svc.on('uninstall', () => {
  console.log('Service uninstalled successfully');
  console.log('Reinstalling...');
  svc.install();
});

// Install the service
if (svc.exists) {
  console.log('Uninstalling existing service...');
  svc.uninstall();
} else {
  console.log('Installing service...');
  svc.install();
} 