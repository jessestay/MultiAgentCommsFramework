#!/usr/bin/env node
/**
 * Evaluation Trigger MCP Wrapper
 * 
 * This MCP server provides tools to trigger n8n Evaluation workflows by:
 * 1. Writing test data to Google Sheets (which triggers the Evaluation trigger)
 * 2. Or directly executing workflows with test data
 * 
 * Usage: node evaluation-trigger-mcp-wrapper.js
 */

const http = require('http');
const readline = require('readline');

const N8N_API_URL = process.env.N8N_API_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJiMDFkMmI5ZS1mOTdkLTQ5YWYtYjE4MC1lODViMjQ3MDVjZGYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzYwNTk0OTYyfQ.nN128ZrRjHEyXH00qPzkt2jxqucZV4SCDBVeOZMS4RI';

// Workflow IDs for triggering evaluations
const TRIGGER_EVAL_WORKFLOW_ID = '5y4YyWxcupf5aDAJ'; // "Trigger Evaluation via Webhook"
const WRITE_SHEET_WORKFLOW_ID = 'h8JrUWd3ykJVuGqg'; // "Google Sheets Write Subworkflow"

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  if (line.trim()) {
    try {
      const message = JSON.parse(line);

      // Validate basic message structure
      if (!message.jsonrpc || message.jsonrpc !== '2.0') {
        process.stderr.write(`Invalid Request: jsonrpc must be "2.0" - Received: ${line}\n`);
        return;
      }

      if (!message.method && !message.result && !message.error) {
        process.stderr.write(`Invalid Request: missing method, result, or error - Received: ${line}\n`);
        return;
      }

      // Only handle requests (messages with method), not responses
      if (message.method) {
        handleMessage(message).catch((error) => {
          sendErrorResponse(message.id, -32000, error.message || 'Internal error');
        });
      }
    } catch (e) {
      // Invalid JSON, send parse error
      sendErrorResponse(null, -32700, `Parse error: ${e.message}`);
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
  // Don't try to send response for uncaught exceptions, as the channel might be broken
  process.stderr.write(`Fatal uncaught exception: ${error.message}\nStack: ${error.stack}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  // Don't try to send response for unhandled rejections, as the channel might be broken
  process.stderr.write(`Fatal unhandled rejection: ${error.message || String(error)}\n`);
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
            name: 'evaluation-trigger-mcp',
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
              name: 'trigger_evaluation',
              description: 'Trigger an n8n Evaluation workflow by writing test data to Google Sheets. Provide workflowId (optional, defaults to Top-of-Funnel Collector), sheetName (optional, defaults to Pipeline Tests), and testData (array of test case objects).',
              inputSchema: {
                type: 'object',
                properties: {
                  workflowId: {
                    type: 'string',
                    description: 'The n8n workflow ID to trigger evaluation for (optional, defaults to Top-of-Funnel Collector: 4uqeR9rVn6e2ione)'
                  },
                  sheetName: {
                    type: 'string',
                    description: 'The Google Sheet tab name to write test data to (optional, defaults to "Pipeline Tests")'
                  },
                  testData: {
                    type: 'array',
                    description: 'Array of test case objects to write to the sheet. Each object should match the expected columns for the test sheet.',
                    items: {
                      type: 'object'
                    }
                  }
                },
                required: ['testData']
              }
            }
          ]
        }
      });
    } else if (message.method === 'tools/call') {
      if (!message.params) {
        sendErrorResponse(message.id, -32602, 'Invalid params: params object is required');
        return;
      }

      const { name, arguments: args } = message.params;

      if (name === 'trigger_evaluation') {
        await triggerEvaluation(args, message.id);
      } else {
        sendErrorResponse(message.id, -32601, `Unknown tool: ${name}`);
      }
    } else {
      sendErrorResponse(message.id, -32601, `Unknown method: ${message.method}`);
    }
  } catch (error) {
    sendErrorResponse(message.id, -32000, error.message || 'Internal error during message handling');
  }
}

async function triggerEvaluation(args, messageId) {
  const workflowId = args.workflowId || '4uqeR9rVn6e2ione'; // Top-of-Funnel Collector default
  const sheetName = args.sheetName || 'Pipeline Tests';
  const testData = args.testData || [];

  if (!Array.isArray(testData) || testData.length === 0) {
    sendErrorResponse(messageId, -32602, 'testData must be a non-empty array');
    return;
  }

  // Write test data to Google Sheet using the write subworkflow
  // This will trigger the Evaluation trigger automatically
  return new Promise((resolve, reject) => {
    const url = new URL(`${N8N_API_URL}/api/v1/workflows/${WRITE_SHEET_WORKFLOW_ID}/execute`);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': N8N_API_KEY
      }
    };

    const requestBody = {
      data: {
        sheetId: '1FUovmWGxano2d7JCb0Keejf7k0rzMjeqXrU3reuXP20',
        sheetName: sheetName,
        data: testData,
        matchingColumns: ['test_case']
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
            sendResponse({
              jsonrpc: '2.0',
              id: messageId,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      success: true,
                      message: `Test data written to sheet "${sheetName}". Evaluation trigger should fire automatically for workflow ${workflowId}.`,
                      workflowId: workflowId,
                      sheetName: sheetName,
                      rowsWritten: testData.length,
                      executionId: result.data?.executionId || 'unknown'
                    }, null, 2)
                  }
                ]
              }
            });
          } else {
            const errorData = data ? JSON.parse(data) : { message: `HTTP ${res.statusCode}` };
            sendErrorResponse(messageId, res.statusCode, `n8n API error: ${errorData.message || 'Unknown error'}`);
          }
        } catch (e) {
          sendErrorResponse(messageId, -32000, `Failed to parse n8n response: ${e.message}. Raw response: ${data.substring(0, 200)}`);
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      sendErrorResponse(messageId, -32000, `n8n API request failed: ${error.message}`);
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
  // Flush stdout if available (for non-TTY streams)
  if (typeof process.stdout.flush === 'function') {
    process.stdout.flush();
  }
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

