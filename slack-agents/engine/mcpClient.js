// engine/mcpClient.js — Proper MCP client for Slack agents using the official SDK.
//
// This enables Slack agents (CMO, CCO, etc.) to actually invoke MCP tools,
// not just post text to Slack. This is the "hands" the team was promised.
'use strict';

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('fs');
const path = require('path');

const GRANTS_PATH = path.join(__dirname, '..', '..', 'hands', 'grants.json');
const ENV_PATH = path.join(__dirname, '..', '.env');

// Cache of connected clients by server name
const clients = {};

function loadGrants() {
  return JSON.parse(fs.readFileSync(GRANTS_PATH, 'utf8'));
}

function loadEnv() {
  const env = {};
  try {
    const content = fs.readFileSync(ENV_PATH, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim();
      }
    }
  } catch (e) {}
  return env;
}

function expandEnv(obj, env) {
  if (typeof obj === 'string') {
    return obj.replace(/\${([^}]+)}/g, (m, name) => env[name] || m);
  }
  if (Array.isArray(obj)) return obj.map(v => expandEnv(v, env));
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) result[k] = expandEnv(v, env);
    return result;
  }
  return obj;
}

async function getClient(serverName) {
  if (clients[serverName]) return clients[serverName];

  const grants = loadGrants();
  const serverConfig = grants.servers?.[serverName];
  if (!serverConfig) {
    throw new Error(`MCP server '${serverName}' not found in grants.json`);
  }

  const env = loadEnv();
  const config = expandEnv(serverConfig, env);

  if (!config.command) {
    throw new Error(`Server ${serverName} has no command configured`);
  }

  console.log(`[mcpClient] connecting to ${serverName}...`);

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args || [],
    env: { ...process.env, ...config.env }
  });

  const client = new Client(
    { name: 'macf-slack-agent', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  clients[serverName] = client;

  console.log(`[mcpClient] connected to ${serverName}`);
  return client;
}

/**
 * Invoke an MCP tool.
 * @param {string} serverName - Server from grants.json
 * @param {string} toolName - Tool name
 * @param {object} args - Tool arguments
 * @returns {Promise<any>} Tool result
 */
async function invokeTool(serverName, toolName, args = {}) {
  const client = await getClient(serverName);
  console.log(`[mcpClient] ${serverName}.${toolName}(${JSON.stringify(args).slice(0, 100)})`);

  const result = await client.callTool({
    name: toolName,
    arguments: args
  });

  return result;
}

/**
 * List tools available on a server.
 */
async function listTools(serverName) {
  const client = await getClient(serverName);
  const result = await client.listTools();
  return result.tools;
}

/**
 * Close all connections (for cleanup).
 */
async function closeAll() {
  for (const [name, client] of Object.entries(clients)) {
    try {
      await client.close();
      console.log(`[mcpClient] closed ${name}`);
    } catch (e) {}
    delete clients[name];
  }
}

module.exports = { invokeTool, listTools, closeAll };
