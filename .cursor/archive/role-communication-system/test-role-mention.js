const http = require('http');

// Test the handle-role-mention API
function testHandleRoleMention() {
  console.log('Testing handle-role-mention API...');
  
  const options = {
    hostname: 'localhost',
    port: 3100,
    path: '/api/handle-role-mention',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  const requestBody = JSON.stringify({
    jsonrpc: '2.0',
    method: 'handle_role_mention',
    params: {
      message: '@ES Hello, can you help me?',
      current_role: null
    },
    id: 1
  });
  
  const req = http.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Response:');
      console.log(data);
      
      try {
        const parsedData = JSON.parse(data);
        console.log('\nParsed Response:');
        console.log(JSON.stringify(parsedData, null, 2));
        
        if (parsedData.jsonrpc === '2.0' && parsedData.result && parsedData.result.mentioned_role === 'ES') {
          console.log('\n✅ Test PASSED: Server correctly detected the @ES mention');
        } else {
          console.log('\n❌ Test FAILED: Server did not correctly detect the @ES mention');
        }
      } catch (error) {
        console.error('\n❌ Test FAILED: Could not parse response as JSON');
        console.error(error);
      }
    });
  });
  
  req.on('error', (error) => {
    console.error('\n❌ Test FAILED: Error making request');
    console.error(error);
  });
  
  req.write(requestBody);
  req.end();
}

// Run the test
testHandleRoleMention(); 