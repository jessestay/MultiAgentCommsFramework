#!/usr/bin/env node
/**
 * Google Sheets MCP Wrapper for n8n
 * 
 * This script provides a stdio-based MCP server that calls n8n workflows
 * for Google Sheets operations.
 */

const http = require('http');

const N8N_API_URL = process.env.N8N_API_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJiMDFkMmI5ZS1mOTdkLTQ5YWYtYjE4MC1lODViMjQ3MDVjZGYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzYwNTk0OTYyfQ.nN128ZrRjHEyXH00qPzkt2jxqucZV4SCDBVeOZMS4RI';

const READ_WORKFLOW_ID = 'Til8l82bixXS5FGM';
const WRITE_WORKFLOW_ID = 'h8JrUWd3ykJVuGqg';
// MCP Server Trigger webhook path - this is the ONLY way to call Google Sheets operations
const MCP_SERVER_TRIGGER_WEBHOOK_ID = 'b6d67a89-19e2-44f2-8a07-9ed84c7633c1';

// MCP uses newline-delimited JSON over stdio
let buffer = '';

// Ensure stdin is readable and set encoding
process.stdin.setEncoding('utf8');
process.stdin.resume();

process.stdin.on('data', (chunk) => {
  buffer += chunk;
  
  // Process complete lines (newline-delimited JSON)
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Keep incomplete line in buffer
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine) {
      try {
        const message = JSON.parse(trimmedLine);
        
        // Validate basic message structure
        if (!message.jsonrpc || message.jsonrpc !== '2.0') {
          // Can't send error without valid id, skip invalid messages
          continue;
        }
        
        // Only handle requests (messages with method), not responses
        if (message.method) {
          // Ensure message has an id for error responses
          if (message.id === undefined || message.id === null) {
            // Skip messages without id as we can't respond to them
            continue;
          }
          
          handleMessage(message).catch((error) => {
            sendErrorResponse(message.id, -32000, error.message || 'Internal error');
          });
        }
      } catch (e) {
        // Invalid JSON - can't send error without valid id, so skip
        // The protocol requires id for error responses
        continue;
      }
    }
  }
});

process.stdin.on('end', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  // Don't try to send response for uncaught exceptions as it might fail
  // Just log to stderr and exit
  process.stderr.write(`Fatal error: ${error.message}\n`);
  if (error.stack) {
    process.stderr.write(`Stack: ${error.stack}\n`);
  }
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  // Don't try to send response for unhandled rejections as it might fail
  // Just log to stderr and exit
  process.stderr.write(`Unhandled rejection: ${error.message || String(error)}\n`);
  process.exit(1);
});

async function handleMessage(message) {
  try {
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
            name: 'google-sheets-mcp',
            version: '1.0.0'
          }
        }
      });
    } else if (message.method === 'tools/list') {
      sendResponse({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: 'read_google_sheet',
              description: 'Read data from a Google Sheet. Provide sheetId, sheetName (optional, defaults to Sheet1), and range (optional, defaults to A1:Z1000).',
              inputSchema: {
                type: 'object',
                properties: {
                  sheetId: {
                    type: 'string',
                    description: 'The Google Sheet ID'
                  },
                  sheetName: {
                    type: 'string',
                    description: 'The sheet name within the spreadsheet (optional, defaults to Sheet1)'
                  },
                  range: {
                    type: 'string',
                    description: 'The range to read (optional, defaults to A1:Z1000)'
                  }
                },
                required: ['sheetId']
              }
            },
            {
              name: 'write_google_sheet',
              description: 'Write or update data in a Google Sheet. Provide sheetId, sheetName, data (array of objects), and matchingColumns (array of column names to match for updates).',
              inputSchema: {
                type: 'object',
                properties: {
                  sheetId: {
                    type: 'string',
                    description: 'The Google Sheet ID'
                  },
                  sheetName: {
                    type: 'string',
                    description: 'The sheet name within the spreadsheet'
                  },
                  data: {
                    type: 'array',
                    description: 'Array of objects to write/update'
                  },
                  matchingColumns: {
                    type: 'array',
                    description: 'Array of column names to match for updates (e.g., ["test_case"])'
                  }
                },
                required: ['sheetId', 'sheetName', 'data']
              }
            }
          ]
        }
      });
    } else if (message.method === 'tools/call') {
      if (!message.params) {
        sendResponse({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32602,
            message: 'Invalid params: params object is required'
          }
        });
        return;
      }
      
      const { name, arguments: args } = message.params;
      
      if (!name) {
        sendResponse({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32602,
            message: 'Invalid params: tool name is required'
          }
        });
        return;
      }
      
      if (name === 'read_google_sheet') {
        await callN8nWorkflow(READ_WORKFLOW_ID, args || {}, message.id);
      } else if (name === 'write_google_sheet') {
        await callN8nWorkflow(WRITE_WORKFLOW_ID, args || {}, message.id);
      } else {
        sendResponse({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32601,
            message: `Unknown tool: ${name}`
          }
        });
      }
    } else {
      sendResponse({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32601,
          message: `Unknown method: ${message.method}`
        }
      });
    }
  } catch (error) {
    sendResponse({
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32000,
        message: error.message
      }
    });
  }
}

async function callN8nWorkflow(workflowId, inputData, messageId) {
  return new Promise((resolve, reject) => {
    let url, requestBody;
    
    // ALWAYS use MCP Server Trigger for Google Sheets operations
    // This is the ONLY supported method - webhooks are NOT used
    if (workflowId === WRITE_WORKFLOW_ID) {
      // Use MCP Server Trigger for write operations
      const toolName = 'write_google_sheet';
      url = new URL(`${N8N_API_URL}/webhook/${MCP_SERVER_TRIGGER_WEBHOOK_ID}`);
      requestBody = {
        tool: toolName,
        arguments: inputData
      };
    } else if (workflowId === READ_WORKFLOW_ID) {
      // Use MCP Server Trigger for read operations
      const toolName = 'read_google_sheet';
      url = new URL(`${N8N_API_URL}/webhook/${MCP_SERVER_TRIGGER_WEBHOOK_ID}`);
      requestBody = {
        tool: toolName,
        arguments: inputData
      };
    } else {
      // For other workflows, try execution endpoint
      url = new URL(`${N8N_API_URL}/api/v1/executions/workflow`);
      requestBody = {
        workflowId: workflowId,
        data: inputData
      };
    }
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
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
              // Check if response is SSE (text/event-stream) or JSON
              const contentType = res.headers['content-type'] || '';
              let result;
              
              if (contentType.includes('text/event-stream') || data.startsWith('data:')) {
                // Parse SSE format: data: {...}\n\n
                const lines = data.split('\n');
                let jsonData = '';
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    jsonData = line.substring(6); // Remove 'data: ' prefix
                    break;
                  }
                }
                if (jsonData) {
                  result = JSON.parse(jsonData);
                } else {
                  // Try parsing entire response as JSON
                  result = JSON.parse(data);
                }
              } else {
                result = JSON.parse(data);
              }
              
              // Extract the output from the workflow execution
              // For executeWorkflowTrigger workflows, the output is in resultData.runData
              let output = null;
              if (result.data?.resultData?.runData) {
                const nodeNames = Object.keys(result.data.resultData.runData);
                if (nodeNames.length > 0) {
                  const lastNode = nodeNames[nodeNames.length - 1];
                  const nodeData = result.data.resultData.runData[lastNode];
                  if (nodeData && nodeData.length > 0 && nodeData[0].data?.main) {
                    output = nodeData[0].data.main[0];
                  }
                }
              }
              
              sendResponse({
                jsonrpc: '2.0',
                id: messageId,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(output || result, null, 2)
                    }
                  ]
                }
              });
            } else {
              const errorData = data ? JSON.parse(data) : { message: `HTTP ${res.statusCode}` };
              sendResponse({
                jsonrpc: '2.0',
                id: messageId,
                error: {
                  code: -32000,
                  message: `n8n API error (${res.statusCode}): ${errorData.message || 'Unknown error'}`
                }
              });
            }
          } catch (e) {
            sendResponse({
              jsonrpc: '2.0',
              id: messageId,
              error: {
                code: -32000,
                message: `Failed to parse n8n response: ${e.message}. Raw response: ${data.substring(0, 200)}`
              }
            });
          }
          resolve();
        });
    });

    req.on('error', (error) => {
      sendResponse({
        jsonrpc: '2.0',
        id: messageId,
        error: {
          code: -32000,
          message: `n8n API request failed: ${error.message}`
        }
      });
      resolve();
    });

    req.write(JSON.stringify(requestBody));
    req.end();
  });
}

function sendResponse(response) {
  // Ensure response has required fields
  if (!response.jsonrpc) {
    response.jsonrpc = '2.0';
  }
  
  // Use process.stdout.write to ensure output goes to stdout, not stderr
  const output = JSON.stringify(response) + '\n';
  process.stdout.write(output);
  // Note: Node.js stdout is automatically flushed, no need for flush()
}

function sendErrorResponse(id, code, message) {
  // MCP protocol requires id to be string or number, not null
  // If id is null/undefined, we can't send a proper error response
  if (id === null || id === undefined) {
    // Log to stderr instead
    process.stderr.write(`Error (code ${code}): ${message}\n`);
    return;
  }
  
  sendResponse({
    jsonrpc: '2.0',
    id: id,
    error: {
      code: code,
      message: message
    }
  });
}

