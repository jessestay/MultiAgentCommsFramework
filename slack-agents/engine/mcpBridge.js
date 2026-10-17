// engine/mcpBridge.js — Bridge between Slack agents and MCP tools.
//
// Problem: Slack agents (CMO, CCO, etc.) can only post text to Slack. They cannot
// execute actions via the 22 wired MCP servers. The MCP servers are configured
// in hands/grants.json but not connected to the agents' execution path.
//
// Solution: This module provides a simple interface for agents to invoke MCP tools.
// It spawns the MCP server, lists tools, invokes the requested tool, and returns results.
//
// Usage:
//   const { invokeTool } = require('./mcpBridge');
//   const result = await invokeTool('buffer', 'createPost', { text: '...', channels: [...] });
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const GRANTS_PATH = path.join(__dirname, '..', '..', 'hands', 'grants.json');
const ENV_PATH = path.join(__dirname, '..', '.env');

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
  } catch (e) {
    console.error('[mcpBridge] failed to load .env:', e.message);
  }
  return env;
}

// Expand ${VAR} references in config using .env values
function expandEnv(obj, env) {
  if (typeof obj === 'string') {
    return obj.replace(/\${([^}]+)}/g, (m, name) => env[name] || m);
  }
  if (Array.isArray(obj)) {
    return obj.map(v => expandEnv(v, env));
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = expandEnv(v, env);
    }
    return result;
  }
  return obj;
}

/**
 * Invoke an MCP tool on a configured server.
 * @param {string} serverName - Name from grants.json (e.g., 'buffer', 'linkedin')
 * @param {string} toolName - Tool to invoke (e.g., 'createPost')
 * @param {object} args - Tool arguments
 * @returns {Promise<object>} Tool result
 */
async function invokeTool(serverName, toolName, args = {}) {
  const grants = loadGrants();
  const serverConfig = grants.servers?.[serverName];

  if (!serverConfig) {
    throw new Error(`MCP server '${serverName}' not found in grants.json`);
  }

  const env = loadEnv();
  const config = expandEnv(serverConfig, env);

  console.log(`[mcpBridge] invoking ${serverName}.${toolName}`);

  // For now, support stdio-based MCP servers
  // Full JSON-RPC implementation would go here
  // This is a simplified version that demonstrates the pattern

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error(`MCP tool ${serverName}.${toolName} timed out after 30s`));
    }, 30000);

    // Build command from config
    let cmd, cmdArgs;
    if (config.command) {
      cmd = config.command;
      cmdArgs = config.args || [];
    } else {
      reject(new Error(`Server ${serverName} has no command configured`));
      return;
    }

    const proc = spawn(cmd, cmdArgs, {
      env: { ...process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn ${serverName}: ${err.message}`));
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`${serverName} exited with code ${code}: ${stderr.slice(0, 200)}`));
      } else {
        // Parse MCP response
        // Simplified: in a full implementation, we'd do JSON-RPC handshake,
        // list tools, then invoke the specific tool
        resolve({
          server: serverName,
          tool: toolName,
          stdout: stdout.slice(0, 1000),
          stderr: stderr.slice(0, 500),
          note: 'MCP bridge prototype — full JSON-RPC tool invocation pending'
        });
      }
    });

    // Send JSON-RPC initialize
    const initMsg = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'macf-bridge', version: '1.0.0' }
      }
    }) + '\n';

    proc.stdin.write(initMsg);

    // TODO: Full implementation would:
    // 1. Wait for initialize response
    // 2. Send tools/list
    // 3. Send tools/call with the requested tool and args
    // 4. Parse and return the result

    // For now, close stdin after init to avoid hanging
    setTimeout(() => {
      try { proc.stdin.end(); } catch (e) {}
    }, 2000);
  });
}

/**
 * List available tools for a server.
 */
async function listTools(serverName) {
  // TODO: Implement via JSON-RPC tools/list
  const grants = loadGrants();
  const serverConfig = grants.servers?.[serverName];
  return {
    server: serverName,
    configured: !!serverConfig,
    note: 'Tool listing via JSON-RPC pending full implementation'
  };
}

module.exports = { invokeTool, listTools };
