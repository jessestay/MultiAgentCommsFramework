const assert = require('assert');
const http = require('http');
const EventSource = require('eventsource');
const readline = require('readline');

// Configuration
const SERVER_URL = 'http://localhost:3100';
const SSE_ENDPOINT = `${SERVER_URL}/sse`;

/**
 * Test suite for the Role Mention functionality
 * These tests verify that role mentions are properly detected and processed
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

// Test direct role mention handling via API
async function testDirectRoleMentionHandling() {
  console.log('Testing direct role mention handling via API...');
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
    assert.strictEqual(data.result.should_respond_as_role, 'ES', 'Should indicate ES should respond');
    
    console.log('✅ Direct role mention handling is working correctly');
    return true;
  } catch (error) {
    console.error('❌ Direct role mention handling test failed:', error.message);
    return false;
  }
}

// Test SSE connection and message handling
async function testSSEConnection() {
  console.log('Testing SSE connection and message handling...');
  return new Promise((resolve) => {
    try {
      const eventSource = new EventSource(SSE_ENDPOINT);
      
      // Set a timeout in case we never receive a message
      const timeout = setTimeout(() => {
        eventSource.close();
        console.error('❌ SSE connection timed out - no messages received');
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
          
          console.log('✅ SSE connection is working correctly');
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
        console.error('❌ SSE connection error:', error);
        eventSource.close();
        resolve(false);
      };
    } catch (error) {
      console.error('❌ Failed to connect to SSE endpoint:', error.message);
      resolve(false);
    }
  });
}

// Test end-to-end role mention functionality (requires manual verification)
async function testEndToEndRoleMention() {
  console.log('\n=================================================');
  console.log('End-to-End Role Mention Test');
  console.log('=================================================');
  console.log('This test requires manual verification in Cursor.');
  console.log('Please follow these steps:');
  console.log('1. Make sure the Role Mention Server is running');
  console.log('2. Make sure Cursor is configured with the correct MCP server');
  console.log('3. In Cursor, send a message with an @mention (e.g., "@ES Hello")');
  console.log('4. Check if the AI responds as the mentioned role');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('\nDid the AI respond as the mentioned role? (yes/no): ', (answer) => {
      rl.close();
      
      if (answer.toLowerCase() === 'yes') {
        console.log('✅ End-to-end role mention functionality is working correctly');
        resolve(true);
      } else {
        console.log('❌ End-to-end role mention functionality is NOT working correctly');
        console.log('Please check the following:');
        console.log('1. Is the Role Mention Server running?');
        console.log('2. Is Cursor configured with the correct MCP server?');
        console.log('3. Did you restart Cursor after configuring the MCP server?');
        console.log('4. Are you using the correct @mention format (e.g., "@ES")?');
        resolve(false);
      }
    });
  });
}

// Test for the specific issue where @mentions don't get a response
async function testNoResponseToMention() {
  console.log('\n=================================================');
  console.log('Test for No Response to @Mentions');
  console.log('=================================================');
  console.log('This test checks for the specific issue where @mentions');
  console.log('are sent but no response is received from the mentioned role.');
  
  // First, verify that the server is correctly detecting mentions
  const mentionDetectionResult = await testDirectRoleMentionHandling();
  
  if (!mentionDetectionResult) {
    console.log('❌ The server is not correctly detecting @mentions');
    console.log('This is likely the root cause of the issue.');
    return false;
  }
  
  // Next, verify that the SSE connection is working
  const sseConnectionResult = await testSSEConnection();
  
  if (!sseConnectionResult) {
    console.log('❌ The SSE connection is not working correctly');
    console.log('This is likely the root cause of the issue.');
    return false;
  }
  
  // Finally, perform the end-to-end test
  console.log('\nNow testing the actual @mention response in Cursor...');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('\nWhen you send "@ES Hello" in Cursor, does @ES respond? (yes/no): ', (answer) => {
      rl.close();
      
      if (answer.toLowerCase() === 'yes') {
        console.log('✅ @ES is responding correctly to mentions');
        resolve(true);
      } else {
        console.log('❌ @ES is NOT responding to mentions');
        console.log('\nPossible causes:');
        console.log('1. Cursor is not properly configured to use the MCP server');
        console.log('2. The server is not correctly implementing the role mention protocol');
        console.log('3. Cursor needs to be restarted after configuring the MCP server');
        console.log('4. There might be a mismatch between our implementation and what Cursor expects');
        
        console.log('\nTroubleshooting steps:');
        console.log('1. Restart Cursor and try again');
        console.log('2. Check the server logs for any errors or warnings');
        console.log('3. Verify that the server is running and accessible');
        console.log('4. Make sure the SSE endpoint is correctly implemented');
        console.log('5. Contact Cursor support for more information about the role mention protocol');
        
        resolve(false);
      }
    });
  });
}

// Run all tests
async function runTests() {
  console.log('=================================================');
  console.log('Role Mention Functionality - Automated Tests');
  console.log('=================================================');
  
  // Run the tests
  const directHandlingResult = await testDirectRoleMentionHandling();
  const sseConnectionResult = await testSSEConnection();
  const noResponseResult = await testNoResponseToMention();
  
  // Summarize results
  console.log('\n=================================================');
  console.log('Test Results Summary');
  console.log('=================================================');
  console.log(`Direct Role Mention Handling: ${directHandlingResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`SSE Connection: ${sseConnectionResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`No Response to @Mentions: ${noResponseResult ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = directHandlingResult && sseConnectionResult && noResponseResult;
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
  testDirectRoleMentionHandling,
  testSSEConnection,
  testEndToEndRoleMention,
  testNoResponseToMention
}; 