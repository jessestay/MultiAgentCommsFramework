# Important Note About the /sse Endpoint

## Expected Behavior

When you try to access `http://localhost:3100/sse` directly in a web browser, you will see a "Not Found" message. **This is normal and expected behavior**.

## Why This Happens

The `/sse` endpoint is specifically designed for Server-Sent Events (SSE) connections used by Cursor IDE, not for direct browser viewing. It's a special protocol endpoint that:

1. Establishes a persistent connection with Cursor
2. Sends events in a specific format that Cursor understands
3. Is not meant to serve HTML content for browsers

## Correct URLs to Use

- **For browser verification**: Use `http://localhost:3100` (without /sse)
  - This will show the Role Mention Server status page
  - Use this to verify the server is running

- **For Cursor configuration**: Use `http://localhost:3100/sse` (with /sse)
  - This is the correct URL to enter in Cursor's MCP settings
  - Cursor knows how to communicate with this endpoint

## Troubleshooting

If Cursor shows "Failed to create client" when you try to add the MCP server:

1. Make sure the server is running (verify at http://localhost:3100)
2. Make sure you've selected "SSE" as the server type, not "HTTP"
3. Make sure you've entered the URL correctly: http://localhost:3100/sse
4. Try restarting Cursor after configuring the MCP server 