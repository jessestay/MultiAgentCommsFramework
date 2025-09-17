@echo off
echo ===================================================
echo Role Mention MCP Server Installation and Setup
echo ===================================================
echo.

REM Check if Node.js is installed
echo Checking for Node.js installation...
node --version
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed. Please install Node.js before continuing.
    exit /b 1
)
echo Node.js is installed. Proceeding with installation...
echo.

REM Create role-mention-mcp directory if it doesn't exist
if not exist role-mention-mcp (
    echo Creating role-mention-mcp directory...
    mkdir role-mention-mcp
)

REM Change to the role-mention-mcp directory
cd role-mention-mcp

REM Install dependencies
echo Installing dependencies...
call npm install @modelcontextprotocol/server --save
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: There was an issue installing dependencies, but we'll continue...
)
echo.

REM Create the role-mention-server.js file if it doesn't exist
if not exist role-mention-server.js (
    echo Creating role-mention-server.js file...
    (
        echo const { MCPServer } = require('@modelcontextprotocol/server');
        echo.
        echo // Define valid roles and their full names
        echo const roleMap = {
        echo     'ES': 'Executive Secretary',
        echo     'SET': 'Software Engineering Team',
        echo     'MD': 'Marketing Director',
        echo     'SMM': 'Social Media Manager',
        echo     'CTW': 'Copy Technical Writer',
        echo     'BIC': 'Business Income Coach',
        echo     'UFL': 'Utah Family Lawyer',
        echo     'DLC': 'Debt Law Consumer Coach',
        echo     'SE': 'Software Engineer',
        echo     'DRC': 'Dating Relationship Coach'
        echo };
        echo.
        echo // Define role expertise
        echo const roleExpertise = {
        echo     'ES': 'Coordination, scheduling, and administrative support',
        echo     'SET': 'Software development, architecture, and technical leadership',
        echo     'MD': 'Marketing strategy, campaign planning, and brand management',
        echo     'SMM': 'Social media content creation, engagement, and analytics',
        echo     'CTW': 'Technical documentation, copywriting, and content editing',
        echo     'BIC': 'Business financial advice, income strategies, and tax planning',
        echo     'UFL': 'Family law advice specific to Utah state regulations',
        echo     'DLC': 'Consumer debt law, credit repair, and financial recovery',
        echo     'SE': 'Software engineering, coding, and technical implementation',
        echo     'DRC': 'Relationship advice, dating strategies, and interpersonal communication'
        echo };
        echo.
        echo // Create MCP server
        echo const server = new MCPServer({
        echo     port: 3100,
        echo     tools: [
        echo         {
        echo             name: 'handle_role_mention',
        echo             description: 'Handle a message that mentions a role using @role syntax',
        echo             parameters: {
        echo                 type: 'object',
        echo                 properties: {
        echo                     message: {
        echo                         type: 'string',
        echo                         description: 'The message that contains role mentions'
        echo                     }
        echo                 },
        echo                 required: ['message']
        echo             },
        echo             handler: async (params) => {
        echo                 const { message } = params;
        echo                 
        echo                 // Check for @role mentions
        echo                 const mentionRegex = /@(ES|SET|MD|SMM|CTW|BIC|UFL|DLC|SE|DRC)\b/g;
        echo                 const mentions = message.match(mentionRegex);
        echo                 
        echo                 if (!mentions || mentions.length === 0) {
        echo                     return {
        echo                         result: {
        echo                             detected_roles: [],
        echo                             instructions: "No valid role mentions detected. Use @role (e.g., @ES, @SET) to mention a role."
        echo                         }
        echo                     };
        echo                 }
        echo                 
        echo                 // Extract unique roles (without the @ symbol)
        echo                 const uniqueRoles = [...new Set(mentions.map(m => m.substring(1)))];
        echo                 
        echo                 // Generate instructions based on detected roles
        echo                 const roleInstructions = uniqueRoles.map(role => {
        echo                     return `${roleMap[role]} (${role}): ${roleExpertise[role]}`;
        echo                 }).join('\n');
        echo                 
        echo                 return {
        echo                     result: {
        echo                         detected_roles: uniqueRoles,
        echo                         instructions: `The following roles were mentioned:\n${roleInstructions}\n\nPlease respond as these roles according to their expertise.`
        echo                     }
        echo                 };
        echo             }
        echo         },
        echo         {
        echo             name: 'get_role_info',
        echo             description: 'Get information about available roles',
        echo             parameters: {
        echo                 type: 'object',
        echo                 properties: {},
        echo                 required: []
        echo             },
        echo             handler: async () => {
        echo                 const roleInfo = Object.entries(roleMap).map(([abbr, name]) => {
        echo                     return {
        echo                         abbreviation: abbr,
        echo                         name: name,
        echo                         expertise: roleExpertise[abbr]
        echo                     };
        echo                 });
        echo                 
        echo                 return {
        echo                     result: {
        echo                         available_roles: roleInfo,
        echo                         usage: "Mention roles using @role syntax (e.g., @ES, @SET) in your messages."
        echo                     }
        echo                 };
        echo             }
        echo         }
        echo     ]
        echo });
        echo.
        echo // Start the server
        echo server.start().then(() => {
        echo     console.log('Role Mention MCP Server running on port 3100');
        echo     console.log('Available roles:');
        echo     Object.entries(roleMap).forEach(([abbr, name]) => {
        echo         console.log(`  @${abbr} - ${name}: ${roleExpertise[abbr]}`);
        echo     });
        echo     console.log('\nUse Ctrl+C to stop the server');
        echo });
    ) > role-mention-server.js
)

REM Create the setup-cursor.js file if it doesn't exist
if not exist setup-cursor.js (
    echo Creating setup-cursor.js file...
    (
        echo const fs = require('fs');
        echo const path = require('path');
        echo const os = require('os');
        echo.
        echo // Define paths
        echo const homeDir = os.homedir();
        echo const cursorDir = path.join(homeDir, '.cursor');
        echo.
        echo // Create .cursor directory if it doesn't exist
        echo if (!fs.existsSync(cursorDir)) {
        echo     fs.mkdirSync(cursorDir, { recursive: true });
        echo     console.log('Created .cursor directory');
        echo }
        echo.
        echo // Define MCP configuration
        echo const mcpConfig = {
        echo     "servers": [
        echo         {
        echo             "name": "Role Mention Server",
        echo             "url": "http://localhost:3100"
        echo         }
        echo     ]
        echo };
        echo.
        echo // Write MCP configuration to file
        echo const mcpConfigPath = path.join(cursorDir, 'mcp.json');
        echo fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
        echo console.log(`MCP configuration written to ${mcpConfigPath}`);
    ) > setup-cursor.js
)

REM Create package.json if it doesn't exist
if not exist package.json (
    echo Creating package.json file...
    (
        echo {
        echo   "name": "role-mention-mcp",
        echo   "version": "1.0.0",
        echo   "description": "MCP server for role mentions in Cursor",
        echo   "main": "role-mention-server.js",
        echo   "scripts": {
        echo     "start": "node role-mention-server.js",
        echo     "setup": "node setup-cursor.js",
        echo     "test": "echo \"No tests configured\""
        echo   },
        echo   "keywords": [
        echo     "mcp",
        echo     "cursor",
        echo     "roles"
        echo   ],
        echo   "author": "",
        echo   "license": "MIT",
        echo   "dependencies": {
        echo     "@modelcontextprotocol/server": "^0.1.0"
        echo   }
        echo }
    ) > package.json
)

REM Setup Cursor MCP configuration
echo Setting up Cursor MCP configuration...
node setup-cursor.js
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: There was an issue setting up the Cursor configuration, but we'll continue...
)
echo.

REM Start the MCP server
echo Starting the MCP server...
echo Use Ctrl+C to stop the server when you're done.
echo.
node role-mention-server.js 