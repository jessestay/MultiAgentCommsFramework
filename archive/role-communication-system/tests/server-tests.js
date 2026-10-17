const assert = require('assert');
const http = require('http');
const EventSource = require('eventsource');

// Configuration
const SERVER_URL = 'http://localhost:3100';
const SSE_ENDPOINT = `${SERVER_URL}/sse`;

/**
 * Test suite for the Role Mention Server
 * These tests verify that the server is functioning correctly and
 * that it properly implements the MCP protocol.
 */

// Helper function to make HTTP requests
function makeRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      method: method,
      headers: {}
    };
    
    if (body) {
      options.headers['Content-Type'] = 'application/json';
    }
    
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// Test that the server is running
async function testServerRunning() {
  console.log('Testing server is running...');
  try {
    const response = await makeRequest(SERVER_URL);
    assert.strictEqual(response.statusCode, 200, 'Server should return 200 OK');
    console.log('✅ Server is running');
    return true;
  } catch (error) {
    console.error('❌ Server is not running:', error.message);
    return false;
  }
}

// Test that the SSE endpoint is properly implemented
async function testSSEEndpoint() {
  console.log('Testing SSE endpoint...');
  return new Promise((resolve) => {
    try {
      const eventSource = new EventSource(SSE_ENDPOINT);
      
      // Set a timeout in case we never receive a message
      const timeout = setTimeout(() => {
        eventSource.close();
        console.error('❌ SSE endpoint timed out - no messages received');
        resolve(false);
      }, 5000);
      
      eventSource.onmessage = (event) => {
        clearTimeout(timeout);
        
        try {
          const data = JSON.parse(event.data);
          
          // Verify JSON-RPC format
          assert.strictEqual(data.jsonrpc, '2.0', 'Message should include jsonrpc: "2.0"');
          assert.ok(data.method, 'Message should include a method field');
          assert.ok(data.params, 'Message should include a params field');
          
          console.log('✅ SSE endpoint is properly implemented');
          eventSource.close();
          resolve(true);
        } catch (error) {
          console.error('❌ SSE message format is incorrect:', error.message);
          eventSource.close();
          resolve(false);
        }
      };
      
      eventSource.onerror = (error) => {
        clearTimeout(timeout);
        console.error('❌ SSE endpoint error:', error);
        eventSource.close();
        resolve(false);
      };
    } catch (error) {
      console.error('❌ Failed to connect to SSE endpoint:', error.message);
      resolve(false);
    }
  });
}

// Test the handle-role-mention API with JSON-RPC format
async function testHandleRoleMentionAPI() {
  console.log('Testing handle-role-mention API...');
  try {
    const requestBody = {
      jsonrpc: '2.0',
      method: 'handle_role_mention',
      params: {
        message: '@ES Hello, can you help me?',
        current_role: null
      },
      id: 1
    };
    
    const response = await makeRequest(`${SERVER_URL}/api/handle-role-mention`, 'POST', requestBody);
    assert.strictEqual(response.statusCode, 200, 'API should return 200 OK');
    
    const data = JSON.parse(response.body);
    
    // Verify JSON-RPC format
    assert.strictEqual(data.jsonrpc, '2.0', 'Response should include jsonrpc: "2.0"');
    assert.strictEqual(data.id, 1, 'Response should include the same id as the request');
    assert.ok(data.result, 'Response should include a result field');
    
    // Verify the result content
    assert.strictEqual(data.result.mentioned_role, 'ES', 'Should detect ES role mention');
    
    console.log('✅ handle-role-mention API is properly implemented');
    return true;
  } catch (error) {
    console.error('❌ handle-role-mention API test failed:', error.message);
    return false;
  }
}

// Test the get-role-info API
async function testGetRoleInfoAPI() {
  console.log('Testing get-role-info API...');
  try {
    const response = await makeRequest(`${SERVER_URL}/api/get-role-info?role=ES`);
    assert.strictEqual(response.statusCode, 200, 'API should return 200 OK');
    
    const data = JSON.parse(response.body);
    
    // Verify JSON-RPC format
    assert.strictEqual(data.jsonrpc, '2.0', 'Response should include jsonrpc: "2.0"');
    assert.ok(data.result, 'Response should include a result field');
    
    // Verify the result content
    assert.strictEqual(data.result.role, 'ES', 'Should return info for ES role');
    assert.strictEqual(data.result.full_name, 'Executive Secretary', 'Should return correct full name');
    assert.ok(data.result.expertise, 'Should include expertise information');
    
    console.log('✅ get-role-info API is properly implemented');
    return true;
  } catch (error) {
    console.error('❌ get-role-info API test failed:', error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('=================================================');
  console.log('Role Mention Server - Automated Tests');
  console.log('=================================================');
  
  // First check if the server is running
  const serverRunning = await testServerRunning();
  if (!serverRunning) {
    console.error('Cannot continue tests - server is not running');
    process.exit(1);
  }
  
  // Run the rest of the tests
  const sseResult = await testSSEEndpoint();
  const handleRoleMentionResult = await testHandleRoleMentionAPI();
  const getRoleInfoResult = await testGetRoleInfoAPI();
  
  // Summarize results
  console.log('\n=================================================');
  console.log('Test Results Summary');
  console.log('=================================================');
  console.log(`Server Running: ${serverRunning ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`SSE Endpoint: ${sseResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Handle Role Mention API: ${handleRoleMentionResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Get Role Info API: ${getRoleInfoResult ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = serverRunning && sseResult && handleRoleMentionResult && getRoleInfoResult;
  console.log('\nOverall Result:', allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
  
  return allPassed;
}

// Run the tests if this file is executed directly
if (require.main === module) {
  runTests().then(passed => {
    process.exit(passed ? 0 : 1);
  });
}

module.exports = {
  runTests,
  testServerRunning,
  testSSEEndpoint,
  testHandleRoleMentionAPI,
  testGetRoleInfoAPI
}; 