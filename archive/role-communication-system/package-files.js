#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

console.log('Creating package for Role Mention MCP...');

// Create output stream
const output = fs.createWriteStream(path.join(__dirname, 'role-mention-mcp.zip'));
const archive = archiver('zip', {
  zlib: { level: 9 } // Maximum compression
});

// Listen for all archive data to be written
output.on('close', function() {
  console.log(`Package created: role-mention-mcp.zip (${archive.pointer()} bytes)`);
});

// Handle warnings and errors
archive.on('warning', function(err) {
  if (err.code === 'ENOENT') {
    console.warn('Warning:', err);
  } else {
    throw err;
  }
});

archive.on('error', function(err) {
  throw err;
});

// Pipe archive data to the output file
archive.pipe(output);

// Add files to the archive
const files = [
  'role-mention-server.js',
  'package.json',
  'install.js',
  'README.md',
  'QUICK-START.md',
  'mcp.json'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    archive.file(file, { name: file });
    console.log(`Added ${file} to package`);
  } else {
    console.warn(`Warning: ${file} not found, skipping`);
  }
});

// Finalize the archive
archive.finalize(); 