const http = require('http');
const https = require('https');

// Configuration
const SERVER_URL = 'http://localhost:3200';
const SSE_ENDPOINT = `${SERVER_URL}/sse`;
const JSONRPC_ENDPOINT = `${SERVER_URL}/jsonrpc`;

// Test the server status page
async function testServerStatus() {
  console.log('Testing server status page...');
  
  return new Promise((resolve) => {
    http.get(SERVER_URL, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ Server status page is accessible');
          resolve(true);
        } else {
          console.log(`❌ Server status page returned status code ${res.statusCode}`);
          resolve(false);
        }
      });
    }).on('error', (err) => {
      console.log(`❌ Error accessing server status page: ${err.message}`);
      resolve(false);
    });
  });
}

// Test the JSON-RPC endpoint with a list_tools request
async function testListTools() {
  console.log('Testing list_tools request...');
  
  const requestData = {
    jsonrpc: '2.0',
    method: 'list_tools',
    params: {},
    id: 1
  };
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  return new Promise((resolve) => {
    const req = http.request(`${JSONRPC_ENDPOINT}`, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          if (response.jsonrpc === '2.0' && response.result && Array.isArray(response.result)) {
            console.log('✅ list_tools request successful');
            console.log(`Found ${response.result.length} tools:`);
            response.result.forEach(tool => {
              console.log(`  - ${tool.name}: ${tool.description}`);
            });
            resolve(true);
          } else {
            console.log('❌ list_tools request failed: Invalid response format');
            console.log(response);
            resolve(false);
          }
        } catch (error) {
          console.log(`❌ list_tools request failed: ${error.message}`);
          console.log(data);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`❌ list_tools request failed: ${error.message}`);
      resolve(false);
    });
    
    req.write(JSON.stringify(requestData));
    req.end();
  });
}

// Test the JSON-RPC endpoint with a list_resources request
async function testListResources() {
  console.log('Testing list_resources request...');
  
  const requestData = {
    jsonrpc: '2.0',
    method: 'list_resources',
    params: {},
    id: 2
  };
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  return new Promise((resolve) => {
    const req = http.request(`${JSONRPC_ENDPOINT}`, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          if (response.jsonrpc === '2.0' && response.result && Array.isArray(response.result)) {
            console.log('✅ list_resources request successful');
            console.log(`Found ${response.result.length} resources:`);
            response.result.forEach(resource => {
              console.log(`  - ${resource.name}: ${resource.description}`);
            });
            resolve(true);
          } else {
            console.log('❌ list_resources request failed: Invalid response format');
            console.log(response);
            resolve(false);
          }
        } catch (error) {
          console.log(`❌ list_resources request failed: ${error.message}`);
          console.log(data);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`❌ list_resources request failed: ${error.message}`);
      resolve(false);
    });
    
    req.write(JSON.stringify(requestData));
    req.end();
  });
}

// Test the JSON-RPC endpoint with a handle_role_mention request
async function testHandleRoleMention() {
  console.log('Testing handle_role_mention request...');
  
  const requestData = {
    jsonrpc: '2.0',
    method: 'handle_role_mention',
    params: {
      message: '@ES Hello, can you help me?',
      current_role: null
    },
    id: 3
  };
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  return new Promise((resolve) => {
    const req = http.request(`${JSONRPC_ENDPOINT}`, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          if (response.jsonrpc === '2.0' && response.result && response.result.mentioned_role === 'ES') {
            console.log('✅ handle_role_mention request successful');
            console.log(`Detected role: ${response.result.mentioned_role} (${response.result.full_name})`);
            resolve(true);
          } else {
            console.log('❌ handle_role_mention request failed: Invalid response format');
            console.log(response);
            resolve(false);
          }
        } catch (error) {
          console.log(`❌ handle_role_mention request failed: ${error.message}`);
          console.log(data);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`❌ handle_role_mention request failed: ${error.message}`);
      resolve(false);
    });
    
    req.write(JSON.stringify(requestData));
    req.end();
  });
}

// Run all tests
async function runTests() {
  console.log('=================================================');
  console.log('MCP Server Test Suite');
  console.log('=================================================');
  
  const serverStatusResult = await testServerStatus();
  if (!serverStatusResult) {
    console.log('❌ Server is not accessible. Aborting tests.');
    return;
  }
  
  const listToolsResult = await testListTools();
  const listResourcesResult = await testListResources();
  const handleRoleMentionResult = await testHandleRoleMention();
  
  console.log('\n=================================================');
  console.log('Test Results');
  console.log('=================================================');
  console.log(`Server Status: ${serverStatusResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`List Tools: ${listToolsResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`List Resources: ${listResourcesResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Handle Role Mention: ${handleRoleMentionResult ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = serverStatusResult && listToolsResult && listResourcesResult && handleRoleMentionResult;
  console.log(`\nOverall Result: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  console.log('\n=================================================');
  console.log('Next Steps');
  console.log('=================================================');
  console.log('1. Configure Cursor:');
  console.log(`   - Add MCP server with URL: ${SSE_ENDPOINT}`);
  console.log('   - Select "SSE" as the type');
  console.log('2. Restart Cursor');
  console.log('3. Test @mentions in Cursor');
}

// Run the tests
runTests(); 