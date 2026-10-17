# Installation Guide

This guide walks you through the process of installing and configuring the Multi-agent Communications Framework extension for Cursor IDE.

## System Requirements

- Cursor IDE version 0.9.0 or later
- Windows 10/11, macOS 10.15+, or Linux (Ubuntu 20.04+)
- 4GB RAM minimum (8GB recommended)
- 500MB free disk space

## Installation Methods

### Method 1: Install from Cursor Extension Marketplace

1. Open Cursor IDE
2. Click on the Extensions icon in the sidebar (puzzle piece icon)
3. Search for "Multi-agent Communications Framework"
4. Click the "Install" button
5. Click "Reload" when prompted to activate the extension

### Method 2: Manual Installation

#### For Development/Testing

1. Clone the repository:
   ```bash
   git clone https://github.com/automaticjesse/multiagent-framework.git
   ```

2. Navigate to the extension directory:
   ```bash
   cd multiagent-framework
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Build the extension:
   ```bash
   npm run build
   ```

5. Create a symbolic link to your extensions directory:
   - Windows:
     ```bash
     mklink /D %USERPROFILE%\.cursor\extensions\multiagent-framework path\to\multiagent-framework
     ```
   - macOS/Linux:
     ```bash
     ln -s path/to/multiagent-framework ~/.cursor/extensions/multiagent-framework
     ```

6. Restart Cursor IDE

#### From .vsix Package

1. Download the latest .vsix package from the [releases page](https://github.com/automaticjesse/multiagent-framework/releases)
2. Open Cursor IDE
3. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
4. Type "Extensions: Install from VSIX" and select it
5. Navigate to the downloaded .vsix file and select it
6. Restart Cursor IDE when prompted

## Post-Installation Setup

### First-Time Configuration

1. After installation, the extension will prompt you to complete initial setup
2. Follow the setup wizard to:
   - Choose default roles to enable
   - Configure visual identity preferences
   - Set up keyboard shortcuts
   - Select template directories

2. If the wizard doesn't appear automatically, open it manually:
   - Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
   - Type "Multi-agent: Setup Wizard" and select it

### Verifying Installation

1. Check for the role selector in the sidebar (colored icon showing multiple personas)
2. Open the Command Palette and type "Role:" - you should see multiple role-related commands
3. Try activating a role by clicking on its icon in the role selector

## Configuration

### Extension Settings

Access comprehensive settings through:
1. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
2. Type "Preferences: Open Settings (UI)" and select it
3. Search for "Multi-agent" to see all available settings

Key configuration options:

| Setting | Description | Default |
|---------|-------------|---------|
| `multiagent.roles.enabled` | Roles to enable | All |
| `multiagent.visualIdentity.theme` | Visual theme for roles | "Standard" |
| `multiagent.templates.directory` | Directory for custom templates | `~/.cursor/extensions/multiagent-framework/templates` |
| `multiagent.agile.sprintLength` | Default sprint length in days | 14 |
| `multiagent.communication.format` | Message format style | "Standard" |

### Project-Specific Configuration

To configure the extension for a specific project:

1. Create a `.multiagent` directory in your project root
2. Add a `config.json` file with project-specific settings:
   ```json
   {
     "roles": {
       "enabled": ["ES", "SET", "CTW", "DES"],
       "custom": [
         {
           "id": "PM",
           "name": "Project Manager",
           "color": "#8A2BE2",
           "abbreviation": "PM",
           "responsibilities": [
             "Project planning",
             "Resource allocation",
             "Timeline management"
           ]
         }
       ]
     },
     "templates": {
       "directory": "./.multiagent/templates"
     },
     "agile": {
       "sprintLength": 7
     }
   }
   ```

3. Create a `.multiagent/templates` directory for project-specific templates

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Role selector not appearing | Reload Cursor IDE (Ctrl+R or Cmd+R) |
| Templates not loading | Check template directory path in settings |
| Keyboard shortcuts not working | Check for conflicts in keyboard settings |
| Visual styling issues | Try changing the theme or reloading the window |

### Enabling Logging

To enable detailed logging for troubleshooting:

1. Open settings as described above
2. Set `multiagent.logging.level` to "Debug"
3. Logs will be written to the Output panel
4. To view logs:
   - Open the Output panel (Ctrl+Shift+U or Cmd+Shift+U)
   - Select "Multi-agent Framework" from the dropdown

### Getting Support

If you encounter issues not covered here:

1. Check the [GitHub Issues](https://github.com/automaticjesse/multiagent-framework/issues) for known problems
2. Search the [discussions forum](https://github.com/automaticjesse/multiagent-framework/discussions) for community solutions
3. Submit a new issue with:
   - Extension version
   - Cursor IDE version
   - Operating system
   - Steps to reproduce
   - Any error messages (from the Output panel)
   - Screenshots if applicable

## Updating the Extension

### Automatic Updates

By default, Cursor IDE will automatically check for and install extension updates.

### Manual Updates

To manually check for updates:

1. Open the Extensions panel
2. Click the "..." menu next to the Multi-agent Communications Framework
3. Select "Check for Updates"
4. If an update is available, click "Update" and then "Reload" when prompted

## Uninstalling

To uninstall the extension:

1. Open the Extensions panel
2. Find the Multi-agent Communications Framework
3. Click the gear icon and select "Uninstall"
4. Reload Cursor IDE when prompted

This will remove the extension but preserve your settings. To remove settings as well:

1. Open the Command Palette
2. Type "Preferences: Open Settings (JSON)"
3. Remove any settings that start with `"multiagent."`
4. Save the file

## Next Steps

After installation, consider exploring these features:

1. **Role Switching**: Practice switching between roles using the role selector
2. **Templates**: Explore available templates for each role
3. **User Stories**: Create your first user story using the Agile framework
4. **Documentation**: Review the extension documentation for advanced features

Continue to the [User Guide](./user-guide.md) for detailed usage instructions. 