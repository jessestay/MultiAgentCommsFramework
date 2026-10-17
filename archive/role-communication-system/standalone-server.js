const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

console.log('===================================================');
console.log('Role Mention System - Standalone Server');
console.log('===================================================');
console.log();

// Define tools and resources
const tools = [
  {
    name: "handle_role_mention",
    description: "Automatically detect and handle @role mentions in messages",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The user message that may contain @role mentions"
        },
        current_role: {
          type: "string",
          description: "The currently active role in the conversation (if known)"
        }
      },
      required: ["message"]
    }
  },
  {
    name: "get_role_info",
    description: "Get information about available roles",
    parameters: {
      type: "object",
      properties: {
        role: {
          type: "string",
          description: "The role to get information about (optional)"
        }
      }
    }
  }
];

const resources = [
  {
    name: "available_roles",
    description: "List of available roles with their descriptions",
    content: []  // Will be populated later
  },
  {
    name: "role_communication_protocol",
    description: "Protocol for role-based communication",
    content: {
      format: "[ROLE]: Message content",
      direct_format: "[ROLE]: @TARGET_ROLE: Message content",
      examples: [
        "[ES]: I've scheduled the meeting for tomorrow.",
        "[ES]: @MD: Please prepare the marketing materials for the meeting."
      ]
    }
  }
];

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

// Populate available_roles resource
resources[0].content = Object.entries(roleMap).map(([abbr, name]) => ({
  abbreviation: abbr,
  name,
  expertise: roleExpertise[abbr]
}));

// Setup Cursor MCP configuration
console.log('Setting up Cursor MCP configuration...');
const homeDir = os.homedir();
const cursorDir = path.join(homeDir, '.cursor');
if (!fs.existsSync(cursorDir)) {
  fs.mkdirSync(cursorDir, { recursive: true });
  console.log(`Created .cursor directory at ${cursorDir}`);
}

// Create a simple configuration file for Cursor
// Note: This is a simplified version and may not work with actual Cursor MCP
const mcpConfig = {
  "servers": [
    {
      "name": "Role Mention Server",
      "url": "http://localhost:3100/sse"
    }
  ]
};

const mcpConfigPath = path.join(cursorDir, 'mcp.json');
fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
console.log(`MCP configuration written to ${mcpConfigPath}`);

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
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
  
  // Store active SSE connections
  if (!server.sseClients) {
    server.sseClients = [];
  }
  
  // Handle SSE endpoint
  if (parsedUrl.pathname === '/sse') {
    console.log('SSE connection established');
    
    // Set headers for SSE - ensure exact format expected by MCP clients
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    console.log('SSE headers sent:', {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    // Send an initial connection message with proper MCP format
    const initialMessage = {
      jsonrpc: "2.0",
      method: "connection",
      params: {
        status: "connected",
        server: "Role Mention Server",
        version: "1.0.0"
      }
    };
    console.log('Sending initial connection message:', JSON.stringify(initialMessage, null, 2));
    res.write(`data: ${JSON.stringify(initialMessage)}\n\n`);
    res.flushHeaders();
    
    // Send tool definitions to Cursor
    const toolsMessage = {
      jsonrpc: "2.0",
      method: "register_tools",
      params: tools
    };
    console.log('Sending tools message:', JSON.stringify(toolsMessage, null, 2));
    res.write(`data: ${JSON.stringify(toolsMessage)}\n\n`);
    res.flushHeaders();
    
    // Send resources definitions to Cursor
    const resourcesMessage = {
      jsonrpc: "2.0",
      method: "register_resources",
      params: resources
    };
    console.log('Sending resources message:', JSON.stringify(resourcesMessage, null, 2));
    res.write(`data: ${JSON.stringify(resourcesMessage)}\n\n`);
    res.flushHeaders();
    
    // Add this client to the list of active SSE connections
    const clientId = Date.now();
    const sseClient = {
      id: clientId,
      response: res
    };
    server.sseClients.push(sseClient);
    console.log(`SSE client ${clientId} connected. Total clients: ${server.sseClients.length}`);
    
    // Keep the connection alive with a ping every 30 seconds
    const pingInterval = setInterval(() => {
      const pingMessage = {
        jsonrpc: "2.0",
        method: "ping",
        params: {
          timestamp: new Date().toISOString()
        }
      };
      console.log('Sending ping message:', JSON.stringify(pingMessage));
      res.write(`data: ${JSON.stringify(pingMessage)}\n\n`);
    }, 30000);
    
    // Handle client disconnect
    req.on('close', () => {
      console.log(`SSE client disconnected: ${clientId}`);
      const index = server.sseClients.findIndex(client => client.id === clientId);
      if (index !== -1) {
        server.sseClients.splice(index, 1);
      }
      clearInterval(pingInterval);
      console.log(`Total SSE clients: ${server.sseClients.length}`);
    });
    
    return;
  }
  
  // Handle JSON-RPC requests
  if (parsedUrl.pathname === '/jsonrpc' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const request = JSON.parse(body);
        console.log('Received JSON-RPC request:', JSON.stringify(request));
        
        // Ensure this is a valid JSON-RPC request
        if (request.jsonrpc !== '2.0' || !request.method) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Invalid Request'
            },
            id: request.id || null
          }));
          return;
        }
        
        // Handle method calls
        switch (request.method) {
          case 'handle_role_mention':
            const { message, current_role } = request.params || {};
            if (!message) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32602,
                  message: 'Invalid params: message is required'
                },
                id: request.id
              }));
              return;
            }
            
            const result = handleRoleMention(message, current_role);
            console.log('Role mention result:', JSON.stringify(result));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              result,
              id: request.id
            }));
            break;
            
          case 'get_role_info':
            const { role } = request.params || {};
            const roleInfo = getRoleInfo(role);
            console.log('Role info result:', JSON.stringify(roleInfo));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              result: roleInfo,
              id: request.id
            }));
            break;
            
          case 'list_tools':
            console.log('Sending tools list');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              result: tools,
              id: request.id
            }));
            break;
            
          case 'list_resources':
            console.log('Sending resources list');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              result: resources.map(resource => ({
                name: resource.name,
                description: resource.description
              })),
              id: request.id
            }));
            break;
            
          case 'read_resource':
            const { name } = request.params || {};
            const resource = resources.find(r => r.name === name);
            
            if (!resource) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32602,
                  message: `Resource not found: ${name}`
                },
                id: request.id
              }));
              return;
            }
            
            console.log(`Sending resource: ${name}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              result: {
                content: resource.content,
                mime_type: 'application/json'
              },
              id: request.id
            }));
            break;
            
          default:
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: -32601,
                message: `Method not found: ${request.method}`
              },
              id: request.id
            }));
        }
      } catch (error) {
        console.error('Error processing JSON-RPC request:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32700,
            message: 'Parse error',
            data: error.message
          },
          id: null
        }));
      }
    });
    
    return;
  }
  
  // Handle API endpoints
  if (parsedUrl.pathname === '/api/handle-role-mention' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const requestData = JSON.parse(body);
        
        // Check if this is a JSON-RPC request
        if (requestData.jsonrpc === "2.0" && requestData.method && requestData.params) {
          const { message, current_role } = requestData.params;
          const result = handleRoleMention(message, current_role);
          
          // Format response as JSON-RPC
          const response = {
            jsonrpc: "2.0",
            id: requestData.id,
            result: result
          };
          
          // Send the role mention event to all connected SSE clients
          if (result.mentioned_role && server.sseClients && server.sseClients.length > 0) {
            const mentionEvent = {
              jsonrpc: "2.0",
              method: "role_mention",
              params: {
                role: result.mentioned_role,
                full_name: result.full_name,
                expertise: result.expertise,
                system_message: result.system_message,
                role_prefix: result.role_prefix,
                message: message,
                is_urgent: result.is_urgent || false,
                multiple_roles: result.multiple_roles || false,
                additional_roles: result.additional_roles || []
              }
            };
            
            console.log(`Broadcasting role mention event to ${server.sseClients.length} clients:`, mentionEvent);
            
            server.sseClients.forEach(client => {
              try {
                client.response.write(`data: ${JSON.stringify(mentionEvent)}\n\n`);
              } catch (error) {
                console.error(`Error sending to client ${client.id}:`, error);
              }
            });
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } else {
          // Legacy format for backward compatibility
          const { message, current_role } = requestData;
          const result = handleRoleMention(message, current_role);
          
          // Send the role mention event to all connected SSE clients
          if (result.mentioned_role && server.sseClients && server.sseClients.length > 0) {
            const mentionEvent = {
              jsonrpc: "2.0",
              method: "role_mention",
              params: {
                role: result.mentioned_role,
                full_name: result.full_name,
                expertise: result.expertise,
                system_message: result.system_message,
                role_prefix: result.role_prefix,
                message: message,
                is_urgent: result.is_urgent || false,
                multiple_roles: result.multiple_roles || false,
                additional_roles: result.additional_roles || []
              }
            };
            
            console.log(`Broadcasting role mention event to ${server.sseClients.length} clients:`, mentionEvent);
            
            server.sseClients.forEach(client => {
              try {
                client.response.write(`data: ${JSON.stringify(mentionEvent)}\n\n`);
              } catch (error) {
                console.error(`Error sending to client ${client.id}:`, error);
              }
            });
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        }
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          jsonrpc: "2.0", 
          error: { 
            code: -32700, 
            message: "Parse error", 
            data: error.message 
          },
          id: null
        }));
      }
    });
    return;
  }
  
  // Add a new endpoint for direct role mention testing
  if (parsedUrl.pathname === '/api/test-role-mention' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const { message } = JSON.parse(body);
        
        // Process the role mention
        const result = handleRoleMention(message, null);
        
        // Send the role mention event to all connected SSE clients
        if (result.mentioned_role && server.sseClients && server.sseClients.length > 0) {
          const mentionEvent = {
            jsonrpc: "2.0",
            method: "role_mention",
            params: {
              role: result.mentioned_role,
              full_name: result.full_name,
              expertise: result.expertise,
              system_message: result.system_message,
              role_prefix: result.role_prefix,
              message: message,
              is_urgent: result.is_urgent || false,
              multiple_roles: result.multiple_roles || false,
              additional_roles: result.additional_roles || []
            }
          };
          
          console.log(`Broadcasting test role mention event to ${server.sseClients.length} clients:`, mentionEvent);
          
          server.sseClients.forEach(client => {
            try {
              client.response.write(`data: ${JSON.stringify(mentionEvent)}\n\n`);
            } catch (error) {
              console.error(`Error sending to client ${client.id}:`, error);
            }
          });
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Role mention event sent to ${server.sseClients ? server.sseClients.length : 0} clients`,
          result: result
        }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false,
          error: error.message
        }));
      }
    });
    return;
  }
  
  if (parsedUrl.pathname === '/api/get-role-info' && req.method === 'GET') {
    const role = parsedUrl.query.role;
    const result = getRoleInfo(role);
    
    // Format response as JSON-RPC
    const response = {
      jsonrpc: "2.0",
      result: result,
      id: null
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
    return;
  }
  
  // Serve a simple status page
  if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Role Mention Server</title>
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
          </style>
        </head>
        <body>
          <h1>Role Mention Server</h1>
          <div class="status">
            <p>✅ Server is running on port 3100</p>
            <p>Available endpoints:</p>
            <ul>
              <li><code>/sse</code> - SSE - Server-Sent Events endpoint for Cursor</li>
              <li><code>/api/handle-role-mention</code> - POST - Handle role mentions in messages</li>
              <li><code>/api/get-role-info</code> - GET - Get information about available roles</li>
              <li><code>/api/test-role-mention</code> - POST - Test role mention functionality</li>
            </ul>
          </div>
          <div class="note">
            <p><strong>Note:</strong> The <code>/sse</code> endpoint is specifically for Cursor to use with Server-Sent Events protocol. 
            If you try to access it directly in a browser, you will see "Connection established" but no visible content. 
            This is normal and expected behavior.</p>
          </div>
          <div class="test-area">
            <h2>Test Role Mention</h2>
            <p>Use this form to test the role mention functionality:</p>
            <div>
              <input type="text" id="message" placeholder="Enter a message with @mention (e.g., @ES Hello)" value="@ES Hello, can you help me?">
              <button onclick="testRoleMention()">Test</button>
            </div>
            <div id="result"></div>
            <script>
              function testRoleMention() {
                const message = document.getElementById('message').value;
                const resultDiv = document.getElementById('result');
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = 'Sending request...';
                
                fetch('/api/test-role-mention', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ message })
                })
                .then(response => response.json())
                .then(data => {
                  resultDiv.innerHTML = '<h3>Result:</h3><pre>' + JSON.stringify(data, null, 2) + '</pre>';
                  if (data.success) {
                    resultDiv.innerHTML += '<p>✅ Role mention event sent successfully!</p>';
                    resultDiv.innerHTML += '<p>Check Cursor to see if the AI responds as the mentioned role.</p>';
                  } else {
                    resultDiv.innerHTML += '<p>❌ Error sending role mention event.</p>';
                  }
                })
                .catch(error => {
                  resultDiv.innerHTML = '<h3>Error:</h3><pre>' + error + '</pre>';
                });
              }
            </script>
          </div>
          <h2>Connected SSE Clients: <span id="clientCount">${server.sseClients ? server.sseClients.length : 0}</span></h2>
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

// Function to handle role mentions
function handleRoleMention(message, current_role = null) {
  // Check if message contains an @mention
  const mentionRegex = /@([A-Z]+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(message)) !== null) {
    mentions.push(match[1]);
  }
  
  if (mentions.length === 0) {
    // No mentions found, continue as current role if one is active
    if (current_role && roleMap[current_role]) {
      return {
        mentioned_role: current_role,
        should_respond_as_role: current_role,
        full_name: roleMap[current_role],
        expertise: roleExpertise[current_role],
        instruction: `Continue responding as ${current_role} (${roleMap[current_role]}).`,
        role_prefix: `[${current_role}]: `,
        system_message: `You are now responding as the ${roleMap[current_role]}. Focus on ${roleExpertise[current_role]}.`
      };
    }
    // No current role, respond as normal
    return {
      mentioned_role: null,
      should_respond_as_role: null,
      instruction: "No role mentioned. Respond as the AI assistant.",
      role_prefix: "",
      system_message: "You are an AI assistant. Respond normally without any specific role."
    };
  }
  
  // Get the first valid mentioned role
  const mentionedRole = mentions.find(role => roleMap[role]) || mentions[0];
  
  // Determine if this is an urgent message
  const isUrgent = message.toLowerCase().includes("urgent") || 
                   message.toLowerCase().includes("asap") ||
                   message.toLowerCase().includes("immediately");
  
  // Check if message is addressed to multiple roles
  const multipleRoles = mentions.length > 1;
  const additionalRoles = multipleRoles ? 
    mentions.filter(role => role !== mentionedRole && roleMap[role]) : [];
  
  // Create a detailed system message for the role
  const systemMessage = `You are now responding as the ${roleMap[mentionedRole] || mentionedRole}. 
Focus on ${roleExpertise[mentionedRole] || "general assistance"}.
${isUrgent ? "This is an URGENT request that requires immediate attention." : ""}
${multipleRoles ? `This message also mentions other roles: ${additionalRoles.join(", ")}. You may need to coordinate with them.` : ""}

Always format your responses with the role prefix: [${mentionedRole}]: 
When addressing another role directly, use: [${mentionedRole}]: @TARGET_ROLE: Your message

Example:
[${mentionedRole}]: I'll help you with that request.
[${mentionedRole}]: @ES: Can you please schedule a meeting for this?`;
  
  return {
    mentioned_role: mentionedRole,
    should_respond_as_role: mentionedRole,
    full_name: roleMap[mentionedRole] || mentionedRole,
    expertise: roleExpertise[mentionedRole] || "general assistance",
    is_urgent: isUrgent,
    multiple_roles: multipleRoles,
    additional_roles: additionalRoles,
    instruction: `Respond as ${mentionedRole} (${roleMap[mentionedRole] || "Unknown Role"}). ${isUrgent ? "This is an urgent message that requires immediate attention." : ""} ${multipleRoles ? `The message also mentions other roles: ${additionalRoles.join(", ")}. You may need to coordinate with them.` : ""}`,
    role_prefix: `[${mentionedRole}]: `,
    system_message: systemMessage
  };
}

// Function to get role information
function getRoleInfo(role = null) {
  if (role && roleMap[role]) {
    return {
      role,
      full_name: roleMap[role],
      expertise: roleExpertise[role],
      exists: true
    };
  } else if (role) {
    return {
      role,
      exists: false,
      available_roles: Object.keys(roleMap)
    };
  } else {
    return {
      available_roles: Object.keys(roleMap),
      role_info: Object.entries(roleMap).map(([abbr, name]) => ({
        abbreviation: abbr,
        name,
        expertise: roleExpertise[abbr]
      }))
    };
  }
}

// Start the server
const PORT = 3100;
server.listen(PORT, () => {
  console.log(`Role Mention Server running on port ${PORT}`);
  console.log(`Server URL: http://localhost:${PORT}`);
  console.log(`SSE Endpoint: http://localhost:${PORT}/sse`);
  console.log(`Status page: http://localhost:${PORT}/status`);
  console.log('\nAvailable roles:');
  Object.entries(roleMap).forEach(([abbr, name]) => {
    console.log(`  @${abbr} - ${name}: ${roleExpertise[abbr]}`);
  });
  console.log('\nUse Ctrl+C to stop the server');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
}); 