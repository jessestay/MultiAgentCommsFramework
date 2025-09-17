# Quick Start Guide for @ES

This guide will help you get the Role Mention MCP server up and running quickly.

## Prerequisites

- Node.js installed (v14+ recommended)
- Cursor IDE

## Installation

1. Open a terminal/command prompt
2. Navigate to the directory containing these files
3. Run the installation script:
   ```
   npm run install-server
   ```
   This will:
   - Install required dependencies
   - Create the necessary configuration files
   - Set up the MCP server for Cursor

## Starting the Server

1. In the same terminal, start the server:
   ```
   npm start
   ```
2. You should see output like:
   ```
   Role Mention MCP Server running on port 3000
   Available roles: ES, SET, MD, SMM, CTW, BIC, UFL, DLC, SE, DRC
   Server URL: http://localhost:3000/sse
   ```
3. Keep this terminal window open while using the system

## Using in Cursor

1. Open Cursor IDE
2. Start a new chat or continue an existing one
3. Use @mentions to communicate with different roles:
   ```
   Hey @ES, can you coordinate with the team about our fundraising campaign?
   ```
4. The AI will automatically respond as the mentioned role:
   ```
   [ES]: Of course! I'll coordinate with the team regarding the fundraising campaign. What specific aspects would you like me to focus on?
   ```

## Example Workflow for Fundraising Campaign

1. Start by addressing the Executive Secretary:
   ```
   @ES, we need to coordinate a fundraising campaign to raise $3,000 by Monday.
   ```

2. Have ES coordinate with other roles:
   ```
   @ES, please ask @SET to implement a notification system and @MD to prepare social media materials.
   ```

3. Get implementation details from SET:
   ```
   @SET, what's your plan for implementing the notification system?
   ```

4. Get marketing materials from MD:
   ```
   @MD, what social media materials are you preparing?
   ```

5. Coordinate the final plan:
   ```
   @ES, please review the plans from @SET and @MD and create a coordinated timeline.
   ```

## Available Roles

- **@ES**: Executive Secretary - Coordination, scheduling, communication management
- **@SET**: Software Engineering Team - Software development, system architecture
- **@MD**: Marketing Director - Marketing strategy, campaign planning
- **@SMM**: Social Media Manager - Social media management, content creation
- **@CTW**: Copy/Technical Writer - Content writing, technical documentation
- **@BIC**: Business Income Coach - Business strategy, income optimization
- **@UFL**: Utah Family Lawyer - Utah family law, legal advice
- **@DLC**: Debt/Consumer Law Coach - Debt management, consumer law
- **@SE**: Software Engineering Scrum Master - Agile methodology, scrum practices
- **@DRC**: Dating/Relationship Coach - Relationship advice, dating strategies

## Troubleshooting

- If Cursor doesn't recognize the MCP server, make sure the server is running
- If roles aren't responding correctly, make sure you're using the correct role abbreviations (@ES, @SET, etc.)
- If you need to restart the server, press Ctrl+C in the terminal and run `npm start` again 