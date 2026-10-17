# User Guide

This guide provides detailed instructions for using the Multi-agent Communications Framework extension for Cursor IDE.

## Getting Started

### The Role Selector

The primary interface for the extension is the Role Selector, located in the Cursor IDE sidebar. This panel displays icons for each available role with color coding matching the role's visual identity.

![Role Selector](../assets/images/role-selector.png)

To activate a role:
1. Click on the role icon in the selector
2. The active role will be highlighted
3. The status bar will update to show the current role
4. Role-specific templates will become available

You can also switch roles via keyboard shortcuts:
- Switch to next role: `Ctrl+Alt+]` or `Cmd+Alt+]`
- Switch to previous role: `Ctrl+Alt+[` or `Cmd+Alt+[`
- Show role selector: `Ctrl+Alt+R` or `Cmd+Alt+R`

### Role-Based Communication

#### Addressing Roles

To address a specific role in your code comments or documentation, use the `@ROLE:` syntax:

```
@ES: Let's plan our next sprint
@SET: Please implement the authentication feature
@CTW: Can you document the API endpoints?
@DES: We need a wireframe for the dashboard
```

The extension will automatically format these messages according to each role's visual identity.

#### Inter-Role Communication

Simulate communication between roles by using the following syntax:

```
@ES to @SET: Can you prioritize the authentication feature?
@SET to @ES: I'll complete it by the end of this sprint.
```

This creates a structured conversation between roles that maintains proper formatting and context.

## Role Capabilities

### Executive Secretary (ES)

The Executive Secretary role specializes in:
- Sprint planning and coordination
- Task assignment and tracking
- Meeting facilitation
- Project documentation organization

**Key Templates:**
- Sprint Planning
- Daily Stand-up
- Sprint Review
- Sprint Retrospective
- Project Status Report

### Software Engineering Team (SET)

The Software Engineering Team role focuses on:
- Technical implementation
- Code architecture
- Testing strategies
- Performance optimization

**Key Templates:**
- Technical Specification
- Implementation Plan
- Code Review
- Testing Strategy
- Architecture Decision Record

### Copy/Technical Writer (CTW)

The Copy/Technical Writer role specializes in:
- Documentation creation
- User guides
- API documentation
- Release notes
- Knowledge base articles

**Key Templates:**
- API Documentation
- User Guide Section
- Feature Documentation
- Release Notes
- README Structure

### Designer (DES)

The Designer role focuses on:
- UI/UX design
- Visual system documentation
- Design specifications
- User research findings
- Accessibility guidelines

**Key Templates:**
- Design Specification
- UI Component Documentation
- Style Guide
- User Research Summary
- Accessibility Review

## Template System

### Accessing Templates

Templates can be accessed through multiple methods:

1. **Command Palette:**
   - Press `Ctrl+Shift+P` or `Cmd+Shift+P`
   - Type "Role: Insert Template"
   - Select a template from the filtered list

2. **Context Menu:**
   - Right-click in the editor
   - Select "Insert Template"
   - Choose from the role-specific template list

3. **Quick Template Button:**
   - Click the template icon in the editor toolbar
   - Select from the role-filtered template menu

4. **Keyboard Shortcut:**
   - Press `Ctrl+Alt+T` or `Cmd+Alt+T`
   - Select a template from the popup

### Using Templates

When a template is inserted, it will include:
- Pre-formatted content based on the active role
- Variable placeholders that can be filled in
- Tab stops for quick navigation between fields
- Role-specific styling and formatting

To complete a template:
1. Navigate between placeholders using Tab
2. Fill in the required information
3. Remove any optional sections you don't need

### Creating Custom Templates

To create a custom template:

1. Open the template editor:
   - Command Palette > "Role: Create Template"
   - Right-click in the Templates view > "New Template"

2. Specify template metadata:
   - Name
   - Description
   - Applicable roles
   - Tags for categorization

3. Create the template content using the template language:
   - Use `${1:default}` for tabstops with default text
   - Use `${2}` for tabstops without default text
   - Use `${3:option1|option2|option3}` for selections
   - Use `$CURRENT_YEAR`, `$CURRENT_MONTH`, etc. for automatic values

4. Save the template to make it available

## Agile Framework Integration

### Sprint Management

The extension provides tools for managing Agile sprints:

1. **Create a Sprint:**
   - Command Palette > "Agile: Create Sprint"
   - Set sprint number, start date, and duration
   - Define sprint goals

2. **Manage Sprint Backlog:**
   - Open the Sprint view in the sidebar
   - Drag stories into the sprint backlog
   - Assign stories to roles
   - Set story priorities

3. **Track Sprint Progress:**
   - Use the Sprint Dashboard to view current status
   - Update story status (to-do, in progress, done)
   - View burndown chart and velocity metrics

### User Story Management

To create and manage user stories:

1. **Create a User Story:**
   - Command Palette > "Agile: Create User Story"
   - Select the appropriate template
   - Fill in the user story details:
     - As a [user role]
     - I want [capability]
     - So that [benefit]
   - Add acceptance criteria
   - Assign to appropriate roles

2. **Organize User Stories:**
   - Group stories by feature area or epic
   - Prioritize stories using drag and drop
   - Tag stories for easier filtering

3. **Track User Story Status:**
   - Update status in the Story Board
   - Add comments and notes to stories
   - Link stories to related documentation or code

### Agile Ceremonies

The extension provides templates and tools for Agile ceremonies:

1. **Sprint Planning:**
   - Use the Sprint Planning template
   - Link user stories to the sprint
   - Estimate story points
   - Assign stories to roles

2. **Daily Stand-up:**
   - Use the Stand-up template
   - Record updates by role
   - Track impediments and follow-ups

3. **Sprint Review:**
   - Use the Sprint Review template
   - Document completed stories
   - Record demo notes
   - Capture feedback

4. **Sprint Retrospective:**
   - Use the Retrospective template
   - Record what went well
   - Identify areas for improvement
   - Create action items for next sprint

## Advanced Features

### Role Context Awareness

The extension can suggest appropriate roles based on:
- File type (code, documentation, design assets)
- Current content and context
- Recent role usage patterns

To use context-aware suggestions:
1. Enable in settings: `multiagent.contextAwareness.enabled`
2. Set suggestion frequency: `multiagent.contextAwareness.suggestionFrequency`
3. Accept suggestions from the notification or ignore them

### Knowledge Base Integration

Access role-specific knowledge directly from the IDE:

1. Open the Knowledge Base:
   - Command Palette > "Role: Open Knowledge Base"
   - Sidebar Knowledge Base icon

2. Browse by:
   - Role
   - Topic
   - Recently viewed
   - Favorites

3. Add new knowledge items:
   - Command Palette > "Role: Add Knowledge Item"
   - Fill in the knowledge template
   - Tag with appropriate roles and topics

### Template Variables

Advanced template variables available:

| Variable | Description | Example |
|----------|-------------|---------|
| `$USERNAME` | Current user name | John Doe |
| `$CURRENT_YEAR` | Current year | 2023 |
| `$CURRENT_MONTH` | Current month name | April |
| `$CURRENT_DATE` | Current date (YYYY-MM-DD) | 2023-04-15 |
| `$CURRENT_ROLE` | Active role name | Executive Secretary |
| `$CURRENT_ROLE_ABBR` | Active role abbreviation | ES |
| `$WORKSPACE_NAME` | Current workspace name | MyProject |
| `$SELECTED_TEXT` | Currently selected text | (selection) |
| `$RANDOM_UUID` | Random UUID | 550e8400-e29b-41d4-a716-446655440000 |

### AI Integration

The extension enhances Cursor's built-in AI with role context:

1. **Role-Based Completions:**
   - Completions are filtered by current role context
   - Technical completions for SET role
   - Documentation-focused completions for CTW role

2. **Template Suggestions:**
   - AI suggests relevant templates based on current content
   - Accept suggestions with a single click

3. **Role Suggestions:**
   - AI recommends role switching based on current task
   - Explains why a specific role might be more appropriate

## Customization

### Visual Identity Customization

Customize the visual appearance of roles:

1. Open settings:
   - Command Palette > "Preferences: Open Settings (UI)"
   - Search for "multiagent.visualIdentity"

2. Customize:
   - Role colors
   - Icon style
   - Message formatting
   - Status bar indicators

### Custom Roles

Create custom roles for specific project needs:

1. Create a new role:
   - Command Palette > "Role: Create Custom Role"
   - Fill in the role definition template

2. Define role properties:
   - Name and abbreviation
   - Color and icon
   - Responsibilities
   - Communication style
   - Associated templates

3. Enable the new role in settings:
   - Add to `multiagent.roles.enabled`

### Keyboard Shortcuts

Customize keyboard shortcuts:

1. Open keyboard settings:
   - Command Palette > "Preferences: Open Keyboard Shortcuts"

2. Search for "multiagent" or "role"

3. Customize the shortcuts for:
   - Role switching
   - Template insertion
   - Agile commands
   - Knowledge base access

## Best Practices

### Effective Role Switching

For optimal workflow:
- Switch to ES role for planning and coordination
- Switch to SET role when writing code
- Switch to CTW role when creating documentation
- Switch to DES role when working on UI/UX

### Documentation Organization

Best practices for documentation:
- Use role-specific templates for consistency
- Maintain clear role attribution in multi-role documents
- Use the @ROLE syntax to indicate role perspective
- Organize documentation by role responsibility

### Team Collaboration

When working in teams:
- Share role configurations via version control
- Establish consistent role usage patterns
- Use role-based comments for code review
- Document which roles are responsible for which components

### Agile Implementation

Effective Agile practices:
- Assign primary and secondary roles to each story
- Use role-specific sections in sprint ceremonies
- Balance work across roles to maintain productivity
- Use role metrics to track contribution distribution

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Role-specific formatting not applying | Check if correct role is active |
| Templates not available | Verify role has templates assigned |
| Keyboard shortcuts conflicting | Check for conflicts in keyboard settings |
| Role suggestions not appearing | Check context awareness settings |

### Reporting Problems

If you encounter issues:
1. Enable logging as described in the installation guide
2. Reproduce the issue
3. Check the logs in the Output panel
4. Submit a detailed bug report including logs

## Additional Resources

- [GitHub Repository](https://github.com/automaticjesse/multiagent-framework)
- [Extension Changelog](./changelog.md)
- [API Documentation](./api.md)
- [Video Tutorials](https://automaticjesse.com/tutorials)
- [Community Forums](https://github.com/automaticjesse/multiagent-framework/discussions) 