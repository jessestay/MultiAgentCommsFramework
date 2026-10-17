const http = require('http');
const fs = require('fs');
const path = require('path');

console.log('===================================================');
console.log('Simple Role Mention Server');
console.log('===================================================');
console.log();

// Define valid roles and their full names
const roleMap = {
  'ES': 'Executive Secretary',
  'SET': 'Software Engineering Team',
  'MD': 'Marketing Director',
  'SMM': 'Social Media Manager',
  'CTW': 'Copy/Technical Writer',
  'BIC': 'Business Income Coach',
  'UFL': 'Utah Family Lawyer',
  'DLC': 'Debt/Consumer Law Coach',
  'SE': 'Software Engineering Scrum Master',
  'DRC': 'Dating/Relationship Coach'
};

// Role expertise and responsibilities
const roleExpertise = {
  'ES': 'coordination, scheduling, communication management, task delegation',
  'SET': 'software development, system architecture, technical implementation, coding',
  'MD': 'marketing strategy, campaign planning, brand management, market analysis',
  'SMM': 'social media management, content creation, audience engagement, platform optimization',
  'CTW': 'content writing, technical documentation, copywriting, editing',
  'BIC': 'business strategy, income optimization, revenue growth, financial planning',
  'UFL': 'Utah family law, legal advice, document preparation, case strategy',
  'DLC': 'debt management, consumer law, legal defense, financial protection',
  'SE': 'agile methodology, scrum practices, sprint planning, team coordination',
  'DRC': 'relationship advice, dating strategies, communication improvement, conflict resolution'
};

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Handle SSE endpoint
  if (pathname === '/sse') {
    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    // Send a simple message to confirm connection
    res.write('data: {"connected": true}\n\n');
    
    // Keep the connection alive with a ping every 30 seconds
    const pingInterval = setInterval(() => {
      res.write('data: {"ping": true}\n\n');
    }, 30000);
    
    // Handle client disconnect
    req.on('close', () => {
      clearInterval(pingInterval);
    });
    
    return;
  }
  
  // Serve a simple status page
  if (pathname === '/' || pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Simple Role Mention Server</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #333; }
            .role { margin-bottom: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
            .role-name { font-weight: bold; }
            .role-expertise { color: #666; }
            .status { padding: 10px; background-color: #e6f7e6; border-radius: 4px; margin-bottom: 20px; }
            .note { padding: 10px; background-color: #fff3cd; border-radius: 4px; margin-bottom: 20px; }
            .test-area { padding: 10px; background-color: #e3f2fd; border-radius: 4px; margin-bottom: 20px; }
            button { padding: 8px 16px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; }
            button:hover { background-color: #45a049; }
            input { padding: 8px; width: 300px; margin-right: 10px; }
            #result { margin-top: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background-color: #f9f9f9; display: none; }
            pre { white-space: pre-wrap; word-wrap: break-word; }
          </style>
        </head>
        <body>
          <h1>Simple Role Mention Server</h1>
          <div class="status">
            <p>✅ Server is running on port 3100</p>
            <p>Available endpoints:</p>
            <ul>
              <li><code>/sse</code> - SSE - Server-Sent Events endpoint</li>
            </ul>
          </div>
          <div class="note">
            <p><strong>Important:</strong> This is a simplified server that focuses solely on role mention functionality.</p>
            <p>To use this server with Cursor:</p>
            <ol>
              <li>Configure Cursor to use <code>http://localhost:3100/sse</code> as an SSE MCP server</li>
              <li>Use @mentions in your conversations (e.g., <code>@ES Hello</code>)</li>
            </ol>
          </div>
          <div class="test-area">
            <h2>Manual Configuration Instructions</h2>
            <p>Since the automatic MCP configuration isn't working, you can try this manual approach:</p>
            <ol>
              <li>Open Cursor</li>
              <li>Go to Settings > Features > MCP</li>
              <li>Remove any existing "Role Mention Server" entries</li>
              <li>Click "+ Add New MCP Server"</li>
              <li>Select "SSE" as the type (not HTTP)</li>
              <li>Enter "Role Mention Server" as the name</li>
              <li>Enter "http://localhost:3100/sse" as the URL</li>
              <li>Click "Add"</li>
              <li>Restart Cursor completely</li>
              <li>Try using @mentions in your conversations</li>
            </ol>
          </div>
          <h2>Available Roles</h2>
          ${Object.entries(roleMap).map(([abbr, name]) => `
            <div class="role">
              <div class="role-name">@${abbr} - ${name}</div>
              <div class="role-expertise">${roleExpertise[abbr]}</div>
            </div>
          `).join('')}
        </body>
      </html>
    `);
    return;
  }
  
  // Handle 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Start the server
const PORT = 3100;
server.listen(PORT, () => {
  console.log(`Simple Role Mention Server running on port ${PORT}`);
  console.log(`Server URL: http://localhost:${PORT}`);
  console.log(`SSE Endpoint: http://localhost:${PORT}/sse`);
  console.log('\nAvailable roles:');
  Object.entries(roleMap).forEach(([abbr, name]) => {
    console.log(`  @${abbr} - ${name}: ${roleExpertise[abbr]}`);
  });
  console.log('\nUse Ctrl+C to stop the server');
}); 