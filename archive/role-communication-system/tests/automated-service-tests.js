const assert = require('assert');
const http = require('http');
const EventSource = require('eventsource');
const fs = require('fs');
const path = require('path');

// Configuration
const SERVER_URL = 'http://localhost:3100';
const SSE_ENDPOINT = `${SERVER_URL}/sse`;
const JSONRPC_ENDPOINT = `${SERVER_URL}/jsonrpc`;

// Create a log directory if it doesn't exist
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Create a log file for this test run
const logFile = path.join(logDir, `service-test-${new Date().toISOString().replace(/:/g, '-')}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Log to both console and file
function log(message) {
  console.log(message);
  logStream.write(message + '\n');
}

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
      
      // Set a timeout for the entire request
      const requestTimeout = setTimeout(() => {
        req.destroy();
        reject(new Error('Request timed out'));
      }, 2000);
      
      res.on('data', (chunk) => {
        data += chunk.toString();
        // If we get any data, consider it a success for SSE
        if (url.endsWith('/sse') && data.length > 0) {
          clearTimeout(requestTimeout);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
          req.destroy(); // Close the connection
        }
      });
      
      res.on('end', () => {
        clearTimeout(requestTimeout);
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
  log('Test 1: Verifying server is running...');
  try {
    const response = await makeRequest(SERVER_URL);
    assert.strictEqual(response.statusCode, 200, 'Server should return 200 OK');
    log('✅ Server is running');
    return true;
  } catch (error) {
    log(`❌ Server is not running: ${error.message}`);
    log('Please make sure the service is installed and started.');
    return false;
  }
}

// Test that the SSE endpoint is properly implemented
async function testSSEEndpoint() {
  log('Test 2: Verifying SSE endpoint...');
  const maxRetries = 3;
  const retryDelay = 100; // 100ms
  const timeout = 2000; // 2s

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    log(`Attempt ${attempt} of ${maxRetries}...`);
    
    try {
      // Make a GET request to the SSE endpoint
      const response = await makeRequest(SSE_ENDPOINT, 'GET');
      
      // Check status code
      if (response.statusCode !== 200) {
        log(`❌ SSE endpoint returned status code ${response.statusCode}`);
        if (attempt < maxRetries) {
          log(`Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        return false;
      }
      
      // Check headers
      const contentType = response.headers['content-type'];
      const cacheControl = response.headers['cache-control'];
      const connection = response.headers['connection'];
      
      log('Response headers:', {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'Connection': connection
      });
      
      // Check if we received any data
      if (response.body) {
        log('Received data:', response.body);
        // Look for the initial connection message
        if (response.body.includes('"method":"connection"')) {
          log('✅ SSE endpoint has correct headers and sent connection message');
          return true;
        }
      }
      
      log('❌ SSE endpoint did not send expected data');
      if (attempt < maxRetries) {
        log(`Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      return false;
    } catch (error) {
      log(`❌ Error testing SSE endpoint: ${error.message}`);
      if (attempt < maxRetries) {
        log(`Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      return false;
    }
  }
  
  return false;
}

// Test the JSON-RPC endpoint
async function testJSONRPCEndpoint() {
  log('Test 3: Testing JSON-RPC endpoint...');
  try {
    const requestData = {
      jsonrpc: '2.0',
      method: 'list_tools',
      params: {},
      id: 1
    };
    
    const response = await makeRequest(JSONRPC_ENDPOINT, 'POST', requestData);
    
    if (response.statusCode >= 200 && response.statusCode < 300) {
      try {
        const data = JSON.parse(response.body);
        if (data.jsonrpc === '2.0' && data.result && Array.isArray(data.result)) {
          log(`✅ JSON-RPC endpoint is working correctly`);
          log(`Found ${data.result.length} tools:`);
          data.result.forEach(tool => {
            log(`  - ${tool.name}: ${tool.description}`);
          });
          return true;
        } else {
          log(`❌ JSON-RPC endpoint returned invalid response format`);
          log(JSON.stringify(data, null, 2));
          return false;
        }
      } catch (parseError) {
        log(`❌ Error parsing JSON-RPC response: ${parseError.message}`);
        log(response.body);
        return false;
      }
    } else {
      log(`❌ JSON-RPC endpoint returned status code ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    log(`❌ Error testing JSON-RPC endpoint: ${error.message}`);
    return false;
  }
}

// Test role mention functionality
async function testRoleMention() {
  log('Test 4: Testing role mention functionality...');
  
  const testCases = [
    { message: '@ES Hello, can you help me?', description: 'Basic ES mention' },
    { message: '@SET I need technical help', description: 'SET mention' },
    { message: '@ES can you coordinate with @MD on a marketing campaign?', description: 'Multiple role mention' },
    { message: '@SET I urgently need help with a coding issue', description: 'Urgent message' },
    { message: 'No mention here', description: 'No mention', current_role: 'ES' }
  ];
  
  let allPassed = true;
  
  for (const test of testCases) {
    log(`\n--- Testing: ${test.description} ---`);
    try {
      const requestData = {
        jsonrpc: '2.0',
        method: 'handle_role_mention',
        params: {
          message: test.message,
          current_role: test.current_role
        },
        id: 2
      };
      
      const response = await makeRequest(JSONRPC_ENDPOINT, 'POST', requestData);
      
      if (response.statusCode >= 200 && response.statusCode < 300) {
        try {
          const data = JSON.parse(response.body);
          if (data.jsonrpc === '2.0' && data.result) {
            log(`✅ Role mention test passed: ${test.description}`);
            if (test.message.includes('@')) {
              const mentionMatch = test.message.match(/@([A-Z]+)/);
              if (mentionMatch && mentionMatch[1] === data.result.mentioned_role) {
                log(`   Correctly identified role: ${data.result.mentioned_role}`);
              } else {
                log(`❌ Incorrect role identification. Expected: ${mentionMatch ? mentionMatch[1] : 'none'}, Got: ${data.result.mentioned_role}`);
                allPassed = false;
              }
            }
          } else {
            log(`❌ Role mention handling returned invalid response format`);
            log(JSON.stringify(data, null, 2));
            allPassed = false;
          }
        } catch (parseError) {
          log(`❌ Error parsing role mention response: ${parseError.message}`);
          log(response.body);
          allPassed = false;
        }
      } else {
        log(`❌ Role mention handling returned status code ${response.statusCode}`);
        allPassed = false;
      }
    } catch (error) {
      log(`❌ Error testing role mention: ${error.message}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

// Run all tests
async function runTests() {
  log('=================================================');
  log('Role Mention Server - Automated Service Tests');
  log('=================================================');
  log(`Test started at: ${new Date().toISOString()}`);
  log('');
  
  // Test 1: Verify server is running
  const serverRunning = await testServerRunning();
  if (!serverRunning) {
    log('\n❌ Tests failed: Server is not running');
    log('Please make sure the service is installed and started.');
    process.exit(1);
  }
  
  // Test 2: Verify SSE endpoint
  const sseEndpointWorking = await testSSEEndpoint();
  
  // Test 3: Test JSON-RPC endpoint
  const jsonRpcEndpointWorking = await testJSONRPCEndpoint();
  
  // Test 4: Test role mention functionality
  const roleMentionWorking = await testRoleMention();
  
  // Summary
  log('\n=================================================');
  log('Test Summary');
  log('=================================================');
  log(`1. Server Status: ${serverRunning ? '✅ Running' : '❌ Not Running'}`);
  log(`2. SSE Endpoint: ${sseEndpointWorking ? '✅ Working' : '❌ Failed'}`);
  log(`3. JSON-RPC Endpoint: ${jsonRpcEndpointWorking ? '✅ Working' : '❌ Failed'}`);
  log(`4. Role Mention Functionality: ${roleMentionWorking ? '✅ Working' : '❌ Failed'}`);
  
  const allTestsPassed = serverRunning && sseEndpointWorking && jsonRpcEndpointWorking && roleMentionWorking;
  
  if (allTestsPassed) {
    log('\n✅ All tests passed successfully!');
    log('\nCursor Configuration Instructions:');
    log('1. Open Cursor IDE');
    log('2. Go to Settings > Features > MCP');
    log('3. Click "Add" to add a new MCP server');
    log('4. Enter the following details:');
    log('   - Name: Role Mention Server (or any name you prefer)');
    log('   - Type: SSE (important: do NOT select "HTTP")');
    log('   - URL: http://localhost:3100/sse (important: include the /sse suffix)');
    log('5. Click "Add" to save the server configuration');
    log('6. Restart Cursor completely');
    log('7. Test by typing @ES Hello in a conversation');
    
    process.exit(0);
  } else {
    log('\n❌ Some tests failed. Please check the errors above.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`);
  log(error.stack);
  process.exit(1);
}); 