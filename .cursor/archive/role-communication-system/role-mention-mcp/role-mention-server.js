const { createServer } = require('@modelcontextprotocol/server');

// Valid roles and their full names
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
              instruction: `Continue responding as ${current_role} (${roleMap[current_role]}).`
            };
          }
          // No current role, respond as normal
          return {
            mentioned_role: null,
            should_respond_as_role: null,
            instruction: "No role mentioned. Respond as the AI assistant."
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
        
        return {
          mentioned_role: mentionedRole,
          should_respond_as_role: mentionedRole,
          full_name: roleMap[mentionedRole] || mentionedRole,
          expertise: roleExpertise[mentionedRole] || "general assistance",
          is_urgent: isUrgent,
          multiple_roles: multipleRoles,
          additional_roles: additionalRoles,
          instruction: `Respond as ${mentionedRole} (${roleMap[mentionedRole] || "Unknown Role"}). ${isUrgent ? "This is an urgent message that requires immediate attention." : ""} ${multipleRoles ? `The message also mentions other roles: ${additionalRoles.join(", ")}. You may need to coordinate with them.` : ""}`
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
  ]
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Role Mention MCP Server running on port ${PORT}`);
  console.log(`Available roles: ${Object.keys(roleMap).join(', ')}`);
  console.log(`Server URL: http://localhost:${PORT}/sse`);
}); 