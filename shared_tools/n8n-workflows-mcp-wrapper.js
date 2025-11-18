#!/usr/bin/env node

/**
 * n8n Workflows MCP Server Wrapper
 * 
 * This wrapper exposes only workflow-specific tools from n8n workflows
 * that have MCP Server Trigger nodes. It filters out general n8n management tools.
 * 
 * Workflow tools are discovered by querying the n8n API for active workflows
 * with MCP Server Trigger nodes and exposing them as MCP tools.
 */

const http = require('http');
const { URL } = require('url');

const N8N_API_URL = process.env.N8N_API_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY || '';

// Cache for discovered workflow tools
let workflowToolsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Send JSON-RPC response to stdout
 */
function sendResponse(response) {
  // Only send if response has a valid id (not null/undefined)
  if (response.id === undefined || response.id === null) {
    // Can't send response without valid id - log to stderr instead
    process.stderr.write(`Cannot send response without valid id: ${JSON.stringify(response)}\n`);
    return;
  }
  
  const output = JSON.stringify(response) + '\n';
  process.stdout.write(output);
  // Note: Node.js stdout is automatically flushed, no need for flush()
}

/**
 * Send error response
 */
function sendErrorResponse(id, code, message, data = null) {
  // Never send error responses with null/undefined id
  if (id === undefined || id === null) {
    // Log to stderr instead
    process.stderr.write(`Error (code ${code}): ${message}${data ? ' - ' + JSON.stringify(data) : ''}\n`);
    return;
  }
  
  const error = {
    code,
    message,
    ...(data && { data })
  };
  
  sendResponse({
    jsonrpc: '2.0',
    id: id,
    error
  });
}

/**
 * Discover workflow tools from n8n workflows with MCP Server Trigger nodes
 */
async function discoverWorkflowTools() {
  const now = Date.now();
  
  // Return cached tools if still valid
  if (workflowToolsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return workflowToolsCache;
  }
  
  return new Promise((resolve, reject) => {
    const url = new URL(`${N8N_API_URL}/api/v1/workflows`);
    const options = {
      method: 'GET',
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const workflows = JSON.parse(data).data || [];
            const tools = [];
            
            // Find all active workflows with MCP Server Trigger nodes
            for (const workflow of workflows) {
              if (!workflow.active) continue;
              
              // Find MCP Server Trigger nodes
              const mcpTriggers = (workflow.nodes || []).filter(
                node => node.type === '@n8n/n8n-nodes-langchain.mcpTrigger'
              );
              
              for (const trigger of mcpTriggers) {
                const path = trigger.parameters?.path || trigger.name;
                
                // Find toolWorkflow nodes connected to this trigger
                const connections = workflow.connections?.[trigger.name]?.main || [];
                const toolWorkflows = [];
                
                for (const connectionArray of connections) {
                  for (const connection of connectionArray) {
                    const connectedNode = workflow.nodes.find(n => n.name === connection.node);
                    if (connectedNode?.type === '@n8n/n8n-nodes-langchain.toolWorkflow') {
                      toolWorkflows.push(connectedNode);
                    }
                  }
                }
                
                // Create tool for each toolWorkflow node
                for (const toolWorkflow of toolWorkflows) {
                  const toolName = toolWorkflow.parameters?.name || path;
                  const toolDescription = toolWorkflow.parameters?.toolDescription || 
                                         toolWorkflow.parameters?.description || 
                                         `Execute workflow: ${workflow.name}`;
                  
                  // Extract input schema from workflowInputs
                  const inputSchema = {
                    type: 'object',
                    properties: {}
                  };
                  
                  if (toolWorkflow.parameters?.workflowInputs?.schema) {
                    for (const field of toolWorkflow.parameters.workflowInputs.schema) {
                      inputSchema.properties[field.id] = {
                        type: field.type === 'string' ? 'string' : 
                              field.type === 'array' ? 'array' : 
                              field.type === 'number' ? 'number' : 'string',
                        description: field.displayName || field.id
                      };
                      if (field.required) {
                        if (!inputSchema.required) inputSchema.required = [];
                        inputSchema.required.push(field.id);
                      }
                    }
                  }
                  
                  tools.push({
                    name: toolName,
                    description: toolDescription,
                    inputSchema
                  });
                }
              }
            }
            
            // Cache the results
            workflowToolsCache = tools;
            cacheTimestamp = now;
            
            resolve(tools);
          } else {
            reject(new Error(`n8n API error (${res.statusCode}): ${data}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse n8n response: ${e.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`n8n API request failed: ${error.message}`));
    });

    req.end();
  });
}

/**
 * Execute a workflow tool via MCP Server Trigger webhook
 */
async function executeWorkflowTool(toolName, arguments_) {
  return new Promise((resolve, reject) => {
    // First, find the workflow with MCP Server Trigger and toolWorkflow node for this tool
    const url = new URL(`${N8N_API_URL}/api/v1/workflows`);
    const options = {
      method: 'GET',
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const workflows = JSON.parse(data).data || [];
            
            // Find the workflow with this tool
            for (const workflow of workflows) {
              if (!workflow.active) continue;
              
              // Find MCP Server Trigger nodes
              const mcpTriggers = (workflow.nodes || []).filter(
                node => node.type === '@n8n/n8n-nodes-langchain.mcpTrigger'
              );
              
              for (const trigger of mcpTriggers) {
                // Find toolWorkflow nodes connected to this trigger
                const connections = workflow.connections?.[trigger.name]?.main || [];
                
                for (const connectionArray of connections) {
                  for (const connection of connectionArray) {
                    const connectedNode = workflow.nodes.find(n => n.name === connection.node);
                    if (connectedNode?.type === '@n8n/n8n-nodes-langchain.toolWorkflow') {
                      const connectedToolName = connectedNode.parameters?.name;
                      
                      if (connectedToolName === toolName) {
                        // Found the tool! Execute via MCP Server Trigger webhook
                        const webhookPath = trigger.parameters?.path || trigger.webhookId;
                        const webhookUrl = `${N8N_API_URL}/webhook/${webhookPath}`;
                        
                        // Call the MCP Server Trigger webhook with tool name and arguments
                        callMCPTriggerWebhook(webhookUrl, toolName, arguments_)
                          .then(resolve)
                          .catch(reject);
                        return;
                      }
                    }
                  }
                }
              }
            }
            
            reject(new Error(`Tool '${toolName}' not found in any active workflow`));
          } else {
            reject(new Error(`n8n API error (${res.statusCode}): ${data}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse n8n response: ${e.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`n8n API request failed: ${error.message}`));
    });

    req.end();
  });
}

/**
 * Call MCP Server Trigger webhook with tool execution request
 */
async function callMCPTriggerWebhook(webhookUrl, toolName, arguments_) {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode === 200 || res.statusCode === 201) {
            // Try to parse as JSON first
            try {
              const result = JSON.parse(data);
              resolve(result);
            } catch (e) {
              // If not JSON, might be SSE - return as text
              resolve({ output: data });
            }
          } else {
            reject(new Error(`Webhook error (${res.statusCode}): ${data}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse webhook response: ${e.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Webhook request failed: ${error.message}`));
    });

    // MCP Server Trigger expects tool name and arguments in the request body
    req.write(JSON.stringify({
      tool: toolName,
      arguments: arguments_
    }));
    req.end();
  });
}


/**
 * Handle incoming JSON-RPC messages
 */
let buffer = '';

process.stdin.on('data', (chunk) => {
  buffer += chunk.toString();
  
  // Process complete JSON-RPC messages (lines)
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Keep incomplete line in buffer
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    let message = null;
    try {
      message = JSON.parse(line);
      
      // Validate JSON-RPC message
      if (!message.jsonrpc || message.jsonrpc !== '2.0') {
        if (message.id !== undefined && message.id !== null) {
          sendErrorResponse(message.id, -32600, 'Invalid Request: jsonrpc must be "2.0"');
        }
        continue;
      }
      
      // Ensure message has an id for responses
      if (message.id === undefined || message.id === null) {
        // Skip messages without id as we can't respond to them
        continue;
      }
      
      if (message.method === 'initialize') {
        sendResponse({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'n8n-workflows-mcp',
              version: '1.0.0'
            }
          }
        });
      } else if (message.method === 'tools/list') {
        discoverWorkflowTools()
          .then(tools => {
            sendResponse({
              jsonrpc: '2.0',
              id: message.id,
              result: {
                tools: tools.map(tool => ({
                  name: tool.name,
                  description: tool.description,
                  inputSchema: tool.inputSchema
                }))
              }
            });
          })
          .catch(error => {
            sendErrorResponse(message.id, -32000, `Failed to discover workflow tools: ${error.message}`);
          });
      } else if (message.method === 'tools/call') {
        const { name, arguments: args } = message.params || {};
        
        if (!name) {
          sendErrorResponse(message.id, -32602, 'Invalid params: tool name is required');
          continue;
        }
        
        executeWorkflowTool(name, args || {})
          .then(result => {
            sendResponse({
              jsonrpc: '2.0',
              id: message.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                  }
                ]
              }
            });
          })
          .catch(error => {
            sendErrorResponse(message.id, -32000, `Tool execution failed: ${error.message}`);
          });
      } else {
        sendErrorResponse(message.id, -32601, `Method not found: ${message.method}`);
      }
    } catch (e) {
      // Invalid JSON - try to send error if we have a message with id
      if (message && message.id !== undefined && message.id !== null) {
        sendErrorResponse(message.id, -32700, `Parse error: ${e.message}`);
      }
      // Otherwise, skip invalid messages silently
    }
  }
});

// Handle errors
process.on('uncaughtException', (error) => {
  process.stderr.write(`Uncaught exception: ${error.message}\n${error.stack}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  process.stderr.write(`Unhandled rejection: ${reason}\n`);
  process.exit(1);
});

