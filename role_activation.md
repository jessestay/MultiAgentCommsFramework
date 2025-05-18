# Role Activation Protocol

To activate a specific role during a conversation, use one of these methods:

## Method 1: Direct Role Request
Begin your message with the role name in brackets: `[RoleName]`

## Method 2: Slash Command
Use the slash command with either the full role name or its abbreviation:
- `/role RoleName` - Example: `/role Executive-Secretary`
- `/RoleAbbreviation` - Example: `/ES` or `/es`

# Role Abbreviations
- ES: Executive-Secretary
- BIC: Business-Income-Coach
- MD: Marketing-Director
- SMM: Social-Media-Manager
- CTW: Copy-Technical-Writer
- UFL: Utah-Family-Lawyer
- DLC: Debt-Consumer-Law-Coach
- SE: Software-Engineering-Scrum-Master
- DRC: Dating-Relationship-Coach
- SET: Software-Engineering-Team

# Role Activation Configuration

## Role Nicknames
- bic: Business-Income-Coach
- ctw: Copy-Technical-Writer
- drc: Dating-Relationship-Coach
- dcl: Debt-Consumer-Law-Coach
- es: Executive-Secretary
- md: Marketing-Director
- ufl: Utah-Family-Lawyer

## Language Guidelines

- All roles will communicate in English by default
- Translations to other languages should only be provided when:
  - Explicitly requested with a clear language request (e.g., "Please respond in Spanish")
  - There is a specific need for localization in the project
- The `/from` command is reserved exclusively for indicating message source/username, never for language selection
- When switching languages, use the standard command format 

## Communication Format Standards

All roles MUST follow the standardized communication format defined in `.cursor/rules/role-communication-format.mdc`, which includes:

1. **Role Identification Header**
   ```
   [RoleAbbreviation]: Initial response sentence
   ```

2. **Current Story Information**
   ```
   ## Current Story: ID-XXX - Story Name
   ✅ Completed acceptance criteria
   ❌ Incomplete acceptance criteria
   ```

3. **Sprint Progress** (when applicable)
   ```
   ### Current Sprint Progress
   - X/Y stories completed (Z%)
   - Current story: Story Name (Weight: N)
   - Blockers: Any blocking issues
   ```

4. **Main Response Content**
   - Formatted according to the role's specific communication style

5. **Implementation/Next Steps** (when applicable)
   - Clear action items or implementation steps

// Add language detection and handling
function processRoleCommand(command) {
  // Extract the base command without language prefix
  const languageMatch = command.match(/^\/([a-z]{2})\s+(.+)$/);
  const baseCommand = languageMatch ? languageMatch[2] : command;
  
  // Process the command normally using the base command
  // This ensures language prefixes don't affect command processing
  
  // Language prefixes should only affect response language, not trigger different role behavior
  
  // Return both the processed command and any detected language preference
  return {
    processedCommand: baseCommand,
    languagePreference: languageMatch ? languageMatch[1] : null
  };
}

// When activating a role, use the processed command
function activateRole(command) {
  const { processedCommand, languagePreference } = processRoleCommand(command);
  const parsedCommand = parseCommand(processedCommand);
  
  // Check for standard commands first (help, example, etc.)
  const standardResponse = handleStandardCommands(processedCommand, parsedCommand.role);
  if (standardResponse) {
    return enforceGlobalStandards(standardResponse, parsedCommand.role);
  }
  
  // Get role response
  let roleResponse = getRoleResponse(parsedCommand.role, parsedCommand.remainingText);
  
  // Apply global standards
  roleResponse = enforceGlobalStandards(roleResponse, parsedCommand.role);
  
  // Verify format compliance
  const formatVerification = require('./format_verification');
  roleResponse = formatVerification.enforceFormat(roleResponse, getRoleAcronym(parsedCommand.role));
  
  // Add suggested next steps if not present
  if (!roleResponse.toLowerCase().includes("next step") && 
      !roleResponse.toLowerCase().includes("follow up")) {
    roleResponse += "\n\n**Suggested next steps:**\n- `Ask for clarification on any points`\n- `Request examples of implementation`";
  }
  
  return roleResponse;
}

// Improve command parsing to properly handle role nicknames
function parseCommand(command) {
  // First check if this is a role nickname command
  if (command.startsWith('/')) {
    const parts = command.split(' ');
    const potentialNickname = parts[0].substring(1); // Remove the leading '/'
    
    // Check if this is a valid role nickname
    const roleNicknames = {
      'bic': 'Business-Income-Coach',
      'ctw': 'Copy-Technical-Writer',
      'drc': 'Dating-Relationship-Coach',
      'dcl': 'Debt-Consumer-Law-Coach',
      'es': 'Executive-Secretary',
      'md': 'Marketing-Director',
      'ufl': 'Utah-Family-Lawyer'
    };
    
    if (roleNicknames[potentialNickname]) {
      // This is a role nickname command
      return {
        role: roleNicknames[potentialNickname],
        remainingText: parts.slice(1).join(' ')
      };
    }
    
    // If not a role nickname, then process as a potential language prefix
    return processRoleCommand(command);
  }
  
  // Handle other command formats...
}

// Update getRoleColor function to use colored square Unicode symbols
function getRoleColor(roleName) {
  // Colored square mapping for each role
  const roleColors = {
    'Marketing-Director': '🟥', // Red square
    'Executive-Secretary': '🟧', // Orange square
    'Business-Income-Coach': '🟩', // Green square
    'Dating-Relationship-Coach': '🟪', // Purple square
    'Debt-Consumer-Law-Coach': '🟦', // Blue square
    'Copy-Technical-Writer': '🟨', // Yellow square
    'Utah-Family-Lawyer': '⬜' // White square
  };
  
  // Keep the emoji identifiers too for additional context
  const roleEmojis = {
    'Business-Income-Coach': '💰', // Money bag
    'Copy-Technical-Writer': '📝', // Memo
    'Dating-Relationship-Coach': '❤️', // Heart
    'Debt-Consumer-Law-Coach': '⚖️', // Scales
    'Executive-Secretary': '📊', // Chart
    'Marketing-Director': '📢', // Megaphone
    'Utah-Family-Lawyer': '👨‍⚖️' // Judge
  };
  
  const colorSquare = roleColors[roleName] || '⬛'; // Default black square
  const emoji = roleEmojis[roleName] || '🔷'; // Default blue diamond
  
  return { colorSquare, emoji };
}

// Update enforceGlobalStandards to use the exact format: 🟧ES📊🟧
function enforceGlobalStandards(roleResponse, roleName) {
  const roleAcronym = getRoleAcronym(roleName);
  const { colorSquare, emoji } = getRoleColor(roleName);
  
  // Create a prompt with the exact format: 🟧ES📊🟧
  if (!roleResponse.startsWith(`${colorSquare}${roleAcronym}${emoji}${colorSquare}`)) {
    // Replace [ACRONYM]$ with the new format
    if (roleResponse.includes(`[${roleAcronym}]$`)) {
      roleResponse = roleResponse.replace(`[${roleAcronym}]$`, `${colorSquare}${roleAcronym}${emoji}${colorSquare}:`);
    } else {
      roleResponse = `${colorSquare}${roleAcronym}${emoji}${colorSquare}: ${roleResponse}`;
    }
  }
  
  return roleResponse;
}

// Get standardized acronym for role
function getRoleAcronym(roleName) {
  // Extract acronym from role name (e.g., "Marketing-Director" → "MD")
  return roleName.split('-')
    .map(word => word[0].toUpperCase())
    .join('');
} 