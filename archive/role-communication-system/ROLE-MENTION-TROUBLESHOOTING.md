# Role Mention Troubleshooting Guide

This guide provides troubleshooting steps for issues with the Role Mention System, particularly when @mentions don't work as expected in Cursor.

## Common Issues and Solutions

### Issue: @mentions don't get a response in Cursor

When you type `@ES Hello` or mention any other role in Cursor, but the AI doesn't respond as that role.

#### Possible Causes and Solutions:

1. **Server Not Running**
   - **Symptom**: The Role Mention Server is not running or not accessible.
   - **Check**: Visit http://localhost:3100 in your browser. You should see the Role Mention Server status page.
   - **Solution**: Start the server using `node standalone-server.js` or make sure the Windows service is running.

2. **Incorrect MCP Server Configuration in Cursor**
   - **Symptom**: Cursor is not properly configured to use the Role Mention Server.
   - **Check**: Go to Settings > Features > MCP and verify the server configuration.
   - **Solution**: 
     - Make sure you've added an MCP server with type "SSE" (not HTTP)
     - The URL should be exactly `http://localhost:3100/sse` (with /sse at the end)
     - Try removing and re-adding the server
     - Restart Cursor after making changes

3. **JSON-RPC Format Issues**
   - **Symptom**: The server is not using the correct JSON-RPC 2.0 format that Cursor expects.
   - **Check**: Run the test script to verify the server's response format.
   - **Solution**: Make sure the server is properly implementing the JSON-RPC 2.0 protocol.

4. **SSE Endpoint Implementation Issues**
   - **Symptom**: The SSE endpoint is not properly implemented or not returning data in the correct format.
   - **Check**: Try connecting to the SSE endpoint directly.
   - **Solution**: Make sure the SSE endpoint is properly implemented with the correct headers and message format.

5. **Cursor Needs Restart**
   - **Symptom**: You've configured everything correctly, but @mentions still don't work.
   - **Solution**: Restart Cursor completely and try again.

6. **Protocol Mismatch**
   - **Symptom**: The server is running and Cursor is configured correctly, but @mentions still don't work.
   - **Solution**: There might be a mismatch between our implementation and what Cursor expects. Contact Cursor support for more information about the role mention protocol.

## Testing Role Mention Functionality

### Manual Testing

1. **Start the server**: Run `node standalone-server.js` or make sure the Windows service is running.
2. **Verify the server is running**: Visit http://localhost:3100 in your browser.
3. **Test role mentions directly**: Use the test form on the status page to send a test role mention.
4. **Configure Cursor**: Go to Settings > Features > MCP and add the server with type "SSE" and URL "http://localhost:3100/sse".
5. **Restart Cursor**: Close and reopen Cursor.
6. **Test @mentions**: In a conversation, type `@ES Hello` and see if the AI responds as the Executive Secretary.

### Using the Built-in Test Tool

The server now includes a built-in test tool that can help diagnose issues with role mentions:

1. **Open the status page**: Visit http://localhost:3100 in your browser.
2. **Find the "Test Role Mention" section**: Enter a message with an @mention (e.g., `@ES Hello`).
3. **Click "Test"**: This will send a test role mention event to all connected SSE clients.
4. **Check Cursor**: If Cursor is properly configured and connected, it should receive the role mention event and the AI should respond as the mentioned role.

This test tool helps isolate whether the issue is with the server's role mention detection or with Cursor's connection to the server.

### Automated Testing

We've created automated tests to verify the role mention functionality:

1. **Server Tests**: Run `npm test` to verify the basic server functionality.
2. **Role Mention Tests**: Run `npm run test:role-mention` to specifically test the role mention functionality.

## Debugging Steps

If @mentions still don't work after trying the solutions above, follow these debugging steps:

1. **Check Server Logs**: Look for any errors or warnings in the server logs.
2. **Test API Directly**: Use a tool like Postman or curl to test the `/api/handle-role-mention` API directly.
3. **Verify SSE Connection**: Use a tool like SSE Client to verify the SSE connection is working.
4. **Check Cursor Logs**: Look for any errors or warnings in the Cursor logs.
5. **Contact Cursor Support**: If all else fails, contact Cursor support for more information about the role mention protocol.

## Known Issues

### Issue: "Failed to create client" Error in Cursor

- **Symptom**: When adding the MCP server in Cursor, you get a "Failed to create client" error.
- **Cause**: This is usually due to the server not being accessible or not implementing the correct protocol.
- **Solution**: Make sure the server is running and properly implementing the JSON-RPC 2.0 protocol.

### Issue: Browser Shows "Not Found" at /sse Endpoint

- **Symptom**: When you try to access http://localhost:3100/sse directly in a browser, you see a "Not Found" message.
- **Cause**: This is normal and expected behavior. The /sse endpoint is only for Cursor to use with the SSE protocol, not for direct browser viewing.
- **Solution**: Use http://localhost:3100 (without /sse) to verify the server is running.

## Contact Support

If you continue to experience issues with the Role Mention System, please contact support with the following information:

1. The exact steps you've taken to configure the system
2. Any error messages you've seen
3. The results of the automated tests
4. Screenshots of your Cursor MCP configuration 