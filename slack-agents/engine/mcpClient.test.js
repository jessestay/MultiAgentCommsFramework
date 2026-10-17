// engine/mcpClient.test.js — TDD tests for the MCP bridge.
// Run: node engine/mcpClient.test.js
'use strict';

const assert = require('assert');

async function runTests() {
  console.log('=== MCP Client Tests ===\n');

  const { invokeTool, listTools, closeAll } = require('./mcpClient');

  // Test 1: List tools from Tavily (known working server)
  console.log('Test 1: listTools(tavily) returns tools...');
  try {
    const tools = await listTools('tavily');
    assert(Array.isArray(tools), 'tools should be an array');
    assert(tools.length > 0, 'should have at least one tool');
    const names = tools.map(t => t.name);
    assert(names.includes('tavily_search'), 'should include tavily_search');
    console.log(`  ✓ Found ${tools.length} tools: ${names.slice(0, 3).join(', ')}...`);
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}`);
    process.exit(1);
  }

  // Test 2: Invoke a real tool (tavily_search)
  console.log('\nTest 2: invokeTool(tavily, tavily_search, ...) returns results...');
  try {
    const result = await invokeTool('tavily', 'tavily_search', {
      query: 'test query',
      max_results: 2
    });
    assert(result, 'result should exist');
    assert(result.content, 'result should have content');
    console.log(`  ✓ Tool invoked successfully, got content`);
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}`);
    process.exit(1);
  }

  // Test 3: Invalid server throws clear error
  console.log('\nTest 3: invokeTool with invalid server throws...');
  try {
    await invokeTool('nonexistent-server-xyz', 'someTool', {});
    console.log('  ✗ FAILED: should have thrown');
    process.exit(1);
  } catch (e) {
    assert(e.message.includes('not found'), 'error should mention not found');
    console.log(`  ✓ Correctly threw: ${e.message.slice(0, 60)}...`);
  }

  // Test 4: Grants file loads correctly
  console.log('\nTest 4: grants.json has expected servers...');
  try {
    const fs = require('fs');
    const path = require('path');
    const grants = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', '..', 'hands', 'grants.json'), 'utf8'
    ));
    const servers = Object.keys(grants.servers || {});
    assert(servers.length >= 10, `should have 10+ servers, got ${servers.length}`);
    assert(servers.includes('tavily'), 'should include tavily');
    console.log(`  ✓ Found ${servers.length} servers in grants.json`);
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}`);
    process.exit(1);
  }

  await closeAll();
  console.log('\n=== All tests passed ✓ ===');
}

runTests().catch(e => {
  console.error('Test runner failed:', e.message);
  process.exit(1);
});
