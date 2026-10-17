#!/bin/bash
# Test script for google-sheets-mcp-wrapper.js

echo "Testing MCP server initialization..."
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}' | \
  N8N_API_URL=http://localhost:5678 \
  N8N_API_KEY=test \
  /home/stay/.nvm/versions/node/v20.19.5/bin/node /home/stay/GithubRepos/Rockit/.cursor/shared_tools/google-sheets-mcp-wrapper.js 2>&1

echo ""
echo "Testing tools/list..."
(echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'; sleep 0.1; echo '{"jsonrpc":"2.0","method":"tools/list","id":2}') | \
  N8N_API_URL=http://localhost:5678 \
  N8N_API_KEY=test \
  timeout 2 /home/stay/.nvm/versions/node/v20.19.5/bin/node /home/stay/GithubRepos/Rockit/.cursor/shared_tools/google-sheets-mcp-wrapper.js 2>&1

