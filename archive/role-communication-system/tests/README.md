# Role Mention Server Tests

This directory contains automated tests for the Role Mention Server. These tests verify that the server is functioning correctly and that it properly implements the MCP protocol.

## Test Coverage

The tests cover the following aspects of the server:

1. **Basic Server Functionality**: Verifies that the server is running and responding to requests.
2. **SSE Endpoint Implementation**: Checks that the SSE endpoint is properly implemented and returns data in the correct JSON-RPC format.
3. **Handle Role Mention API**: Tests the API that handles role mentions in messages.
4. **Get Role Info API**: Tests the API that provides information about available roles.

## Running the Tests

### Option 1: Using the Batch File

The easiest way to run the tests is to use the provided batch file:

```
run-tests.bat
```

This will automatically install any required dependencies and run all the tests.

### Option 2: Using npm

You can also run the tests using npm:

```
npm test
```

### Option 3: Running Directly

You can run the tests directly using Node.js:

```
node tests/server-tests.js
```

## Test Results

The tests will output detailed results to the console, including:

- Whether each test passed or failed
- Detailed error messages for any failed tests
- A summary of all test results

## Adding New Tests

To add new tests:

1. Add your test function to `server-tests.js`
2. Update the `runTests()` function to include your new test
3. Update the results summary to include your new test

## Troubleshooting

If the tests fail, check the following:

1. Make sure the Role Mention Server is running on port 3100
2. Check that the server is properly implementing the JSON-RPC 2.0 format
3. Verify that all required dependencies are installed

## Required Dependencies

- Node.js
- eventsource package (installed automatically by the test runner) 