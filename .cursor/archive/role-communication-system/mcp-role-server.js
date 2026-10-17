const { createServer } = require('@modelcontextprotocol/sdk');
const http = require('http');
const fs = require('fs');
const path = require('path');

console.log('===================================================');
console.log('MCP Role Mention Server');
console.log('===================================================');
console.log();

// Define valid roles and their full names
const roleMap = {
  'ES': 'Executive Secretary',
  'SET': 'Software Engineering Team',
  'MD': 'Marketing Director',
  'SMM': 'Social Media Manager',
  'CTW': 'Copy/Technical Writer',
  'BIC': 'Business Income Coach',
  'UFL': 'Utah Family Lawyer',
  'DLC': 'Debt/Consumer Law Coach',
  'SE': 'Software Engineering Scrum Master',
  'DRC': 'Dating/Relationship Coach'
};

// Role expertise and responsibilities
const roleExpertise = {
  'ES': 'coordination, scheduling, communication management, task delegation',
  'SET': 'software development, system architecture, technical implementation, coding',
  'MD': 'marketing strategy, campaign planning, brand management, market analysis',
  'SMM': 'social media management, content creation, audience engagement, platform optimization',
  'CTW': 'content writing, technical documentation, copywriting, editing',
  'BIC': 'business strategy, income optimization, revenue growth, financial planning',
  'UFL': 'Utah family law, legal advice, document preparation, case strategy',
  'DLC': 'debt management, consumer law, legal defense, financial protection',
  'SE': 'agile methodology, scrum practices, sprint planning, team coordination',
  'DRC': 'relationship advice, dating strategies, communication improvement, conflict resolution'
};

// Create MCP server with tools
const server = createServer({
  tools: [
    {
      name: 'handle_role_mention',
      description: 'Automatically detect and handle @role mentions in messages',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The user message that may contain @role mentions'
          },
          current_role: {
            type: 'string',
            description: 'The currently active role in the conversation (if known)'
          }
        },
        required: ['message']
      },
      handler: async ({ message, current_role = null }) => {
        // Check if message contains an @mention
        const mentionRegex = /@([A-Z]+)/g;
        const mentions = [...message.matchAll(mentionRegex)].map(match => match[1]);
        
        if (mentions.length === 0) {
          // No mentions found, continue as current role if one is active
          if (current_role && roleMap[current_role]) {
            return {
              mentioned_role: current_role,
              should_respond_as_role: current_role,
              full_name: roleMap[current_role],
              expertise: roleExpertise[current_role],
              instruction: `Continue responding as ${current_role} (${roleMap[current_role]}).`,
              role_prefix: `[${current_role}]: `,
              system_message: `You are now responding as the ${roleMap[current_role]}. Focus on ${roleExpertise[current_role]}.`
            };
          }
          // No current role, respond as normal
          return {
            mentioned_role: null,
            should_respond_as_role: null,
            instruction: "No role mentioned. Respond as the AI assistant.",
            role_prefix: "",
            system_message: "You are an AI assistant. Respond normally without any specific role."
          };
        }
        
        // Get the first valid mentioned role
        const mentionedRole = mentions.find(role => roleMap[role]) || mentions[0];
        
        // Determine if this is an urgent message
        const isUrgent = message.toLowerCase().includes("urgent") || 
                         message.toLowerCase().includes("asap") ||
                         message.toLowerCase().includes("immediately");
        
        // Check if message is addressed to multiple roles
        const multipleRoles = mentions.length > 1;
        const additionalRoles = multipleRoles ? 
          mentions.filter(role => role !== mentionedRole && roleMap[role]) : [];
        
        // Create a detailed system message for the role
        const systemMessage = `You are now responding as the ${roleMap[mentionedRole] || mentionedRole}. 
Focus on ${roleExpertise[mentionedRole] || "general assistance"}.
${isUrgent ? "This is an URGENT request that requires immediate attention." : ""}
${multipleRoles ? `This message also mentions other roles: ${additionalRoles.join(", ")}. You may need to coordinate with them.` : ""}

Always format your responses with the role prefix: [${mentionedRole}]: 
When addressing another role directly, use: [${mentionedRole}]: @TARGET_ROLE: Your message

Example:
[${mentionedRole}]: I'll help you with that request.
[${mentionedRole}]: @ES: Can you please schedule a meeting for this?`;
        
        return {
          mentioned_role: mentionedRole,
          should_respond_as_role: mentionedRole,
          full_name: roleMap[mentionedRole] || mentionedRole,
          expertise: roleExpertise[mentionedRole] || "general assistance",
          is_urgent: isUrgent,
          multiple_roles: multipleRoles,
          additional_roles: additionalRoles,
          instruction: `Respond as ${mentionedRole} (${roleMap[mentionedRole] || "Unknown Role"}). ${isUrgent ? "This is an urgent message that requires immediate attention." : ""} ${multipleRoles ? `The message also mentions other roles: ${additionalRoles.join(", ")}. You may need to coordinate with them.` : ""}`,
          role_prefix: `[${mentionedRole}]: `,
          system_message: systemMessage
        };
      }
    },
    {
      name: 'get_role_info',
      description: 'Get information about available roles',
      parameters: {
        type: 'object',
        properties: {
          role: {
            type: 'string',
            description: 'The role to get information about (optional)'
          }
        }
      },
      handler: async ({ role = null }) => {
        if (role && roleMap[role]) {
          return {
            role,
            full_name: roleMap[role],
            expertise: roleExpertise[role],
            exists: true
          };
        } else if (role) {
          return {
            role,
            exists: false,
            available_roles: Object.keys(roleMap)
          };
        } else {
          return {
            available_roles: Object.keys(roleMap),
            role_info: Object.entries(roleMap).map(([abbr, name]) => ({
              abbreviation: abbr,
              name,
              expertise: roleExpertise[abbr]
            }))
          };
        }
      }
    }
  ],
  resources: [
    {
      name: 'available_roles',
      description: 'List of available roles with their descriptions',
      content: Object.entries(roleMap).map(([abbr, name]) => ({
        abbreviation: abbr,
        name,
        expertise: roleExpertise[abbr]
      }))
    },
    {
      name: 'role_communication_protocol',
      description: 'Protocol for role-based communication',
      content: {
        format: "[ROLE]: Message content",
        direct_format: "[ROLE]: @TARGET_ROLE: Message content",
        examples: [
          "[ES]: I've scheduled the meeting for tomorrow.",
          "[ES]: @MD: Please prepare the marketing materials for the meeting."
        ]
      }
    }
  ]
});

// Create a simple HTTP server for the status page
const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  
  // Serve a simple status page
  if (pathname === '/' || pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>MCP Role Mention Server</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #333; }
            .role { margin-bottom: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
            .role-name { font-weight: bold; }
            .role-expertise { color: #666; }
            .status { padding: 10px; background-color: #e6f7e6; border-radius: 4px; margin-bottom: 20px; }
            .note { padding: 10px; background-color: #fff3cd; border-radius: 4px; margin-bottom: 20px; }
            pre { white-space: pre-wrap; word-wrap: break-word; }
          </style>
        </head>
        <body>
          <h1>MCP Role Mention Server</h1>
          <div class="status">
            <p>✅ Server is running on port 3100</p>
            <p>Available endpoints:</p>
            <ul>
              <li><code>/sse</code> - SSE - Server-Sent Events endpoint for Cursor</li>
            </ul>
          </div>
          <div class="note">
            <p><strong>Important:</strong> This server implements the Model Context Protocol (MCP) for role mentions.</p>
            <p>To use this server with Cursor:</p>
            <ol>
              <li>Configure Cursor to use <code>http://localhost:3100/sse</code> as an SSE MCP server</li>
              <li>Use @mentions in your conversations (e.g., <code>@ES Hello</code>)</li>
            </ol>
          </div>
          <h2>Available Roles</h2>
          ${Object.entries(roleMap).map(([abbr, name]) => `
            <div class="role">
              <div class="role-name">@${abbr} - ${name}</div>
              <div class="role-expertise">${roleExpertise[abbr]}</div>
            </div>
          `).join('')}
        </body>
      </html>
    `);
    return;
  }
  
  // For all other routes, let the MCP server handle it
  server.handleRequest(req, res);
});

// Start the server
const PORT = 3100;
httpServer.listen(PORT, () => {
  console.log(`MCP Role Mention Server running on port ${PORT}`);
  console.log(`Server URL: http://localhost:${PORT}`);
  console.log(`SSE Endpoint: http://localhost:${PORT}/sse`);
  console.log('\nAvailable roles:');
  Object.entries(roleMap).forEach(([abbr, name]) => {
    console.log(`  @${abbr} - ${name}: ${roleExpertise[abbr]}`);
  });
  console.log('\nUse Ctrl+C to stop the server');
}); 