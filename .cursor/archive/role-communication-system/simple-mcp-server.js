const http = require('http');
const url = require('url');

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  // Handle SSE endpoint
  if (parsedUrl.pathname === '/sse') {
    console.log('SSE connection established');
    
    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    // Send initial connection message
    const initialMessage = {
      jsonrpc: "2.0",
      method: "connection",
      params: {
        status: "connected",
        server: "Simple MCP Server",
        version: "1.0.0"
      }
    };
    console.log('Sending connection message:', JSON.stringify(initialMessage, null, 2));
    res.write(`data: ${JSON.stringify(initialMessage)}\n\n`);
    
    // Define a simple tool
    const toolsMessage = {
      jsonrpc: "2.0",
      method: "register_tools",
      params: {
        tools: [{
          name: "add",
          description: "Add two numbers together",
          parameters: {
            type: "object",
            properties: {
              a: {
                type: "number",
                description: "First number to add"
              },
              b: {
                type: "number",
                description: "Second number to add"
              }
            },
            required: ["a", "b"]
          }
        }]
      }
    };
    console.log('Sending tools message:', JSON.stringify(toolsMessage, null, 2));
    res.write(`data: ${JSON.stringify(toolsMessage)}\n\n`);
    
    // Send a resources message
    const resourcesMessage = {
      jsonrpc: "2.0",
      method: "register_resources",
      params: {
        resources: [{
          name: "greeting",
          description: "A greeting message",
          content: {
            text: "Hello from the MCP server!"
          }
        }]
      }
    };
    console.log('Sending resources message:', JSON.stringify(resourcesMessage, null, 2));
    res.write(`data: ${JSON.stringify(resourcesMessage)}\n\n`);
    
    // Keep connection alive
    const pingInterval = setInterval(() => {
      const pingMessage = {
        jsonrpc: "2.0",
        method: "ping",
        params: {
          timestamp: new Date().toISOString()
        }
      };
      res.write(`data: ${JSON.stringify(pingMessage)}\n\n`);
    }, 30000);
    
    // Handle client disconnect
    req.on('close', () => {
      clearInterval(pingInterval);
      console.log('Client disconnected');
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
        if (request.method === 'hello') {
          const response = {
            jsonrpc: "2.0",
            result: `Hello, ${request.params.name}!`,
            id: request.id
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        }
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: "Parse error"
          },
          id: null
        }));
      }
    });
    return;
  }
  
  // Handle 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Start the server
const PORT = 3100;
server.listen(PORT, () => {
  console.log(`Simple MCP Server running on port ${PORT}`);
  console.log(`SSE Endpoint: http://localhost:${PORT}/sse`);
}); 