# Role Mention MCP for Cursor

A Model Context Protocol (MCP) server for Cursor that enables seamless role-based communication using @mentions.

## Features

- Automatic detection of @role mentions in messages
- Direct role-to-role communication without intermediate steps
- Support for multiple roles in a single conversation
- Recognition of urgent messages
- Role information lookup

## Available Roles

- ES: Executive Secretary
- SET: Software Engineering Team
- MD: Marketing Director
- SMM: Social Media Manager
- CTW: Copy/Technical Writer
- BIC: Business Income Coach
- UFL: Utah Family Lawyer
- DLC: Debt/Consumer Law Coach
- SE: Software Engineering Scrum Master
- DRC: Dating/Relationship Coach

## Quick Start

For the fastest way to get started:

```bash
# Install and run in one step
npm run install-and-run
```

This will:
1. Install dependencies
2. Set up Cursor configuration
3. Run tests
4. Start the server

## Manual Installation

1. Make sure you have Node.js installed (v14+ recommended)
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up Cursor configuration:
   ```bash
   npm run setup-cursor
   ```
4. Run tests:
   ```bash
   npm test
   ```
5. Start the server:
   ```bash
   npm start
   ```

## Usage

Simply use @mentions in your messages to communicate with different roles:

```
Hey @ES, can you coordinate with the team about our fundraising campaign?
```

The AI will automatically respond as the mentioned role:

```
[ES]: Of course! I'll coordinate with the team regarding the fundraising campaign. What specific aspects would you like me to focus on?
```

You can mention multiple roles in a single message:

```
@ES, please coordinate with @MD and @SET on the fundraising campaign.
```

For urgent messages, include words like "urgent", "ASAP", or "immediately":

```
@SET, we urgently need the notification system implemented by tomorrow!
```

## Examples

### Basic Role Communication

```
User: Hey @ES, can you coordinate with the team about our fundraising campaign?

[ES]: Of course! I'll coordinate with the team regarding the fundraising campaign. What specific aspects would you like me to focus on?

User: We need to raise $3,000 by Monday. @SET needs to implement a notification system, and @MD needs to prepare social media materials.

[ES]: I understand we need to raise $3,000 by Monday. I'll coordinate these tasks right away.

@SET, we need a notification system implemented for the fundraising campaign by Monday. Can you provide an implementation plan?

@MD, please prepare social media materials for the fundraising campaign. We need to reach our $3,000 goal by Monday.

Is there anything else you'd like me to coordinate?
```

### Switching Between Roles

```
User: @SET, what's your plan for implementing the notification system?

[SET]: I'll implement the notification system for the fundraising campaign with the following plan:

1. **System Architecture**:
   - WebSocket server for real-time notifications
   - Browser notifications API for desktop alerts
   - SMS gateway integration for mobile notifications

2. **Implementation Timeline**:
   - Setup basic infrastructure (2 hours)
   - Implement notification triggers (3 hours)
   - Create user preference settings (2 hours)
   - Testing and deployment (3 hours)

We can have this completed by Sunday evening, ahead of the Monday deadline.

User: @MD, what social media materials are you preparing?

[MD]: I'm preparing the following social media materials for our fundraising campaign to reach the $3,000 goal by Monday:

1. **Graphics Package**:
   - Campaign header image with countdown timer
   - Progress thermometer showing real-time donation amounts
   - "Share your support" templates for donors

2. **Content Schedule**:
   - 3 daily posts across all platforms (morning, noon, evening)
   - Testimonial videos from previous beneficiaries
   - Live updates highlighting major donations

3. **Call-to-Action Strategy**:
   - Tiered donation incentives ($10, $25, $50, $100+)
   - Limited-time matching donation periods
   - Social sharing rewards
```

## Troubleshooting

- If the server fails to start, make sure port 3000 is available or change the port in the code
- If Cursor doesn't recognize the MCP server, check the URL and make sure the server is running
- If roles aren't responding correctly, make sure you're using the correct role abbreviations (@ES, @SET, etc.)

## Development

### Running Tests

```bash
npm test
```

### Adding New Roles

To add a new role, update the `roleMap` and `roleExpertise` objects in `role-mention-server.js`.

## License

MIT 