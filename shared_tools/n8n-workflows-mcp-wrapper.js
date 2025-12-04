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
const fs = require('fs');
const { URL } = require('url');

const N8N_API_URL = process.env.N8N_API_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY || '';
const DEBUG_LOG_PATH = process.env.N8N_MCP_DEBUG_LOG || '/home/stay/GithubRepos/Rockit/mcp-debug-n8n-workflows.log';

function logDebug(message, details = null) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      message,
      ...(details ? { details } : {})
    };
    fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify(entry) + '\n');
  } catch (err) {
    // Avoid crashing if logging fails
  }
}

logDebug('n8n-workflows MCP wrapper starting', {
  apiUrl: N8N_API_URL
});

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
    logDebug('Skipped sendResponse due to invalid id', response);
    return;
  }
  
  const output = JSON.stringify(response) + '\n';
  process.stdout.write(output);
  logDebug('Sent response', { id: response.id, hasError: !!response.error });
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
    logDebug('Dropped error response due to missing id', { code, message });
    return;
  }
  
  const error = {
    code,
    message,
    ...(data && { data })
  };
  
  logDebug('Sending error response', { id, code, message });
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
            
            // List of workflow IDs that are dedicated MCP servers (exclude from n8n-workflows)
            // These workflows have their own dedicated MCP servers and should not be exposed here
            const DEDICATED_MCP_SERVER_WORKFLOWS = [
              'NP3LA2iOlZubV7DA', // Google Sheets MCP Server
              'rGkfrlUD4kzt8jz2'  // n8n Workflows MCP Server (this workflow itself)
            ];
            
            // Find all active workflows with MCP Server Trigger nodes
            for (const workflow of workflows) {
              if (!workflow.active) continue;
              
              // Skip dedicated MCP server workflows - they have their own MCP servers
              if (DEDICATED_MCP_SERVER_WORKFLOWS.includes(workflow.id)) {
                continue;
              }
              
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
                
                // If no toolWorkflow nodes, create a tool directly from the MCP Server Trigger path
                // This allows MCP Server Triggers to be exposed as tools even without toolWorkflow nodes
                if (toolWorkflows.length === 0) {
                  // Create a tool from the MCP Server Trigger itself
                  const toolName = path;
                  const toolDescription = `Execute workflow: ${workflow.name} via MCP Server Trigger (${path})`;
                  
                  tools.push({
                    name: toolName,
                    description: toolDescription,
                    inputSchema: {
                      type: 'object',
                      properties: {}
                    }
                  });
                } else {
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
            
            // List of workflow IDs that are dedicated MCP servers (exclude from n8n-workflows)
            const DEDICATED_MCP_SERVER_WORKFLOWS = [
              'NP3LA2iOlZubV7DA', // Google Sheets MCP Server
              'rGkfrlUD4kzt8jz2'  // n8n Workflows MCP Server (this workflow itself)
            ];
            
            // Find the workflow with this tool
            for (const workflow of workflows) {
              if (!workflow.active) continue;
              
              // Skip dedicated MCP server workflows
              if (DEDICATED_MCP_SERVER_WORKFLOWS.includes(workflow.id)) {
                continue;
              }
              
              // Find MCP Server Trigger nodes
              const mcpTriggers = (workflow.nodes || []).filter(
                node => node.type === '@n8n/n8n-nodes-langchain.mcpTrigger'
              );
              
              for (const trigger of mcpTriggers) {
                const path = trigger.parameters?.path || trigger.name;
                
                // Check if tool name matches the MCP Server Trigger path
                if (path === toolName) {
                  // Found the tool! For parent workflows, we need to find the sub-workflow
                  // that the parent workflow calls and execute it directly.
                  // Check for connected nodes that indicate which sub-workflow to call
                  const connections = workflow.connections?.[trigger.name] || {};
                  let subWorkflowId = null;
                  let httpRequestUrl = null;
                  
                  // Check for toolWorkflow nodes connected via ai_tool port
                  for (const node of workflow.nodes) {
                    const nodeConnections = workflow.connections?.[node.name] || {};
                    const aiToolConnections = nodeConnections.ai_tool || [];
                    
                    for (const connectionArray of aiToolConnections) {
                      for (const connection of connectionArray) {
                        if (connection.node === trigger.name && connection.type === 'ai_tool') {
                          if (node.type === '@n8n/n8n-nodes-langchain.toolWorkflow') {
                            const workflowIdParam = node.parameters?.workflowId;
                            if (typeof workflowIdParam === 'string') {
                              subWorkflowId = workflowIdParam;
                            } else if (workflowIdParam && typeof workflowIdParam === 'object') {
                              subWorkflowId = workflowIdParam.value || workflowIdParam.id;
                            }
                            break;
                          } else if (node.type === 'n8n-nodes-base.httpRequestTool' || 
                                     node.type === 'n8n-nodes-base.httpRequest') {
                            httpRequestUrl = node.parameters?.url;
                            break;
                          }
                        }
                      }
                      if (subWorkflowId || httpRequestUrl) break;
                    }
                    if (subWorkflowId || httpRequestUrl) break;
                  }
                  
                  // Execute the sub-workflow directly (bypassing parent workflow's MCP Server Trigger)
                  if (subWorkflowId) {
                    // Execute sub-workflow via n8n API
                    return executeSubWorkflowViaAPI(subWorkflowId, arguments_ || {})
                      .then(resolve)
                      .catch(reject);
                  } else if (httpRequestUrl) {
                    // Call HTTP Request URL directly (for Evaluation Triggers)
                    return callHttpRequestUrl(httpRequestUrl, arguments_ || {})
                      .then(resolve)
                      .catch(reject);
                  } else {
                    // No connected node found - this shouldn't happen for parent workflows
                    return reject(new Error(`Parent workflow "${workflow.name}" has no connected nodes to execute`));
                  }
                }
                
                // For parent workflows with MCP Server Triggers, call the webhook directly
                // The webhook will route to connected nodes (HTTP Request or toolWorkflow)
                const webhookPath = path || trigger.webhookId;
                const webhookUrl = `${N8N_API_URL}/webhook/${webhookPath}`;
                
                // Call the MCP Server Trigger webhook with tool name and arguments
                // First initialize, then call the tool
                initializeMCPTrigger(webhookUrl)
                  .then(() => callMCPTriggerWebhookJSONRPC(webhookUrl, toolName, arguments_))
                  .then(resolve)
                  .catch(reject);
                return;
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
 * Execute sub-workflow directly via n8n API
 * This bypasses parent workflows with MCP Server Triggers and executes the sub-workflow directly
 */
async function executeSubWorkflowViaAPI(workflowId, inputData) {
  return new Promise((resolve, reject) => {
    // Use the correct n8n workflow execution endpoint
    // Note: This endpoint works for workflows with Manual Triggers or when called from parent workflows
    // For workflows with Schedule/Evaluation triggers, they must be called via parent workflows
    const url = new URL(`${N8N_API_URL}/rest/workflows/${workflowId}/execute`);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-N8N-API-KEY': N8N_API_KEY
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
            const result = JSON.parse(data);
            resolve(result);
          } else {
            // If execution endpoint fails, the workflow might have Schedule/Evaluation triggers
            // In this case, we should call the parent workflow's MCP Server Trigger webhook instead
            // But for now, return the error
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

    // Pass workflow ID and input data
    // n8n REST API expects the input data directly in the request body
    // For workflows with MCP Server Triggers, pass tool name and arguments
    req.write(JSON.stringify(inputData || {}));
    req.end();
  });
}

/**
 * Call HTTP Request URL (for parent workflows that use HTTP Request nodes)
 * This is used for Evaluation Triggers that need webhook calls
 */
async function callHttpRequestUrl(url, inputData) {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(url);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = http.request(requestUrl, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode === 200 || res.statusCode === 201) {
            const result = JSON.parse(data);
            resolve(result);
          } else {
            reject(new Error(`HTTP Request error (${res.statusCode}): ${data}`));
          }
        } catch (e) {
          // If not JSON, return as text
          resolve({ success: true, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`HTTP Request failed: ${error.message}`));
    });

    // Pass input data to the HTTP request
    req.write(JSON.stringify(inputData || {}));
    req.end();
  });
}

/**
 * Initialize MCP Server Trigger webhook
 */
async function initializeMCPTrigger(webhookUrl) {
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
      let buffer = '';
      
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        
        // For SSE, process complete lines as they arrive
        if (res.headers['content-type']?.includes('text/event-stream')) {
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonData = line.substring(6);
                const event = JSON.parse(jsonData);
                if (event.jsonrpc === '2.0' && event.result) {
                  resolve(event.result);
                  return;
                } else if (event.error) {
                  // If already initialized, that's okay
                  if (event.error.message && event.error.message.includes('already initialized')) {
                    resolve({ initialized: true });
                    return;
                  } else {
                    reject(new Error(event.error.message || 'MCP Server Trigger initialization error'));
                    return;
                  }
                }
              } catch (e) {
                // Continue parsing other lines
              }
            }
          }
        }
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode === 200 || res.statusCode === 201) {
            // If we already resolved from SSE, don't process again
            if (buffer) {
              // Try to parse as JSON (non-SSE response)
              try {
                const result = JSON.parse(buffer);
                if (result.jsonrpc === '2.0' && result.result) {
                  resolve(result.result);
                } else if (result.error) {
                  // If already initialized, that's okay
                  if (result.error.message && result.error.message.includes('already initialized')) {
                    resolve({ initialized: true });
                  } else {
                    reject(new Error(result.error.message || 'MCP Server Trigger initialization error'));
                  }
                } else {
                  resolve({ initialized: true });
                }
              } catch (e) {
                // If not JSON, try to parse as SSE
                const lines = buffer.split('\n');
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const jsonData = line.substring(6);
                      const event = JSON.parse(jsonData);
                      if (event.jsonrpc === '2.0' && event.result) {
                        resolve(event.result);
                        return;
                      }
                    } catch (e2) {
                      // Continue
                    }
                  }
                }
                // If no valid SSE events, assume success
                resolve({ initialized: true });
              }
            }
          } else {
            reject(new Error(`Initialization error (${res.statusCode}): ${buffer}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse initialization response: ${e.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Initialization request failed: ${error.message}`));
    });

    // Send initialize message
    req.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'n8n-workflows-mcp-wrapper',
          version: '1.0.0'
        }
      }
    }));
    req.end();
  });
}

/**
 * Call MCP Server Trigger webhook with JSON-RPC format (for parent workflows)
 */
async function callMCPTriggerWebhookJSONRPC(webhookUrl, toolName, arguments_) {
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
            // MCP Server Trigger returns JSON-RPC response or SSE stream
            // Try to parse as JSON first
            try {
              const result = JSON.parse(data);
              // If it's a JSON-RPC response, extract the result
              if (result.jsonrpc === '2.0' && result.result) {
                resolve(result.result);
              } else {
                resolve(result);
              }
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

    // MCP Server Trigger expects JSON-RPC format
    const jsonrpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: arguments_ || {}
      }
    };
    
    req.write(JSON.stringify(jsonrpcRequest));
    req.end();
  });
}

/**
 * Call MCP Server Trigger webhook with tool execution request (for toolWorkflow nodes)
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
      logDebug('Received message', { id: message.id, method: message.method });
      
      // Validate JSON-RPC message
      if (!message.jsonrpc || message.jsonrpc !== '2.0') {
        if (message.id !== undefined && message.id !== null) {
          sendErrorResponse(message.id, -32600, 'Invalid Request: jsonrpc must be "2.0"');
        }
        continue;
      }
      
      // Handle notifications (messages without id) - these don't require responses
      if (message.id === undefined || message.id === null) {
        if (message.method === 'notifications/initialized') {
          // This is expected after initialize - just acknowledge silently
          logDebug('Received initialized notification', {});
          continue;
        } else if (message.method) {
          // Unknown notification - log but don't respond (notifications don't require responses)
          logDebug('Received unknown notification', { method: message.method });
          continue;
        } else {
          // Invalid message - skip silently
          continue;
        }
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
            logDebug('discoverWorkflowTools failed', { error: error.message });
          });
      } else if (message.method === 'tools/call') {
        const { name, arguments: args } = message.params || {};
        
        if (!name) {
          sendErrorResponse(message.id, -32602, 'Invalid params: tool name is required');
          logDebug('tools/call missing name', { id: message.id });
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
            logDebug('tools/call success', { id: message.id, tool: name });
          })
          .catch(error => {
            sendErrorResponse(message.id, -32000, `Tool execution failed: ${error.message}`);
            logDebug('tools/call error', { id: message.id, tool: name, error: error.message });
          });
      } else {
        sendErrorResponse(message.id, -32601, `Method not found: ${message.method}`);
        logDebug('Unknown method', { method: message.method });
      }
    } catch (e) {
      // Invalid JSON - try to send error if we have a message with id
      // Double-check that message exists and has a valid id before responding
      if (message && typeof message === 'object' && message.id !== undefined && message.id !== null) {
        try {
          sendErrorResponse(message.id, -32700, `Parse error: ${e.message}`);
        } catch (responseError) {
          // If sending error response fails, log to stderr and continue
          process.stderr.write(`Failed to send error response: ${responseError.message}\n`);
        }
      }
      // Otherwise, skip invalid messages silently - log to stderr for debugging
      process.stderr.write(`Skipping invalid message (no valid id): ${line.substring(0, 100)}\n`);
      logDebug('Parse error or invalid message', { line: line.substring(0, 100), error: e.message });
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

