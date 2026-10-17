# Directory Structure

The Multi-agent Communications Framework extension uses the following directory structure:

```
extension-project/
├── .vscode/                # VSCode-specific configurations
├── src/                    # Source code
│   ├── core/               # Core functionality
│   │   ├── roleManager.ts  # Role management system
│   │   ├── communicationSystem.ts # Communication protocol
│   │   ├── templateSystem.ts # Template management
│   │   └── visualIdentity.ts # Visual styling system
│   ├── ui/                 # UI components
│   │   ├── roleSelector.ts # Role selection interface
│   │   ├── messageView.ts  # Message viewing interface
│   │   └── templateView.ts # Template interface
│   ├── integration/        # VSCode integration
│   │   ├── commands.ts     # Extension command definitions
│   │   ├── storageProvider.ts # Storage integration
│   │   └── configuration.ts # Settings management
│   ├── agile/              # Agile workflow implementation
│   │   ├── sprintManager.ts # Sprint management
│   │   ├── userStoryManager.ts # User story management
│   │   └── templates/      # Agile templates
│   ├── types/              # TypeScript type definitions
│   │   ├── roleTypes.ts    # Role-related types
│   │   ├── messageTypes.ts # Message-related types
│   │   └── agileTypes.ts   # Agile-related types
│   └── extension.ts        # Extension entry point
├── docs/                   # Documentation
│   ├── architecture-overview.md # High-level architecture
│   ├── sprint-1-planning.md # Sprint 1 planning doc
│   ├── release-plan.md     # Release planning
│   └── development-setup.md # Development setup instructions
├── tests/                  # Test files
│   ├── core/               # Core tests
│   ├── integration/        # Integration tests
│   └── e2e/                # End-to-end tests
├── resources/              # Static resources
│   ├── icons/              # Icons for the extension
│   └── templates/          # Default templates
├── .eslintrc.json         # ESLint configuration
├── tsconfig.json          # TypeScript configuration
├── webpack.config.js      # Webpack configuration
├── jest.config.js         # Jest configuration
├── package.json           # NPM package definition
└── README.md              # Project README
```

## Key Directories

### `src/core/`
Contains the core functionality of the extension, including role management, communication, templates, and visual identity systems.

### `src/ui/`
Contains UI components for the extension, including role selector, message viewing, and template interfaces.

### `src/integration/`
Contains code that integrates with the VSCode/Cursor extension API, including command definitions, storage, and configuration.

### `src/agile/`
Contains implementation of the Agile workflow, including sprint management, user story tracking, and templates.

### `src/types/`
Contains TypeScript type definitions for the extension, ensuring strong typing throughout the codebase.

### `docs/`
Contains documentation for the extension, including architecture overview, sprint planning, and development setup.

### `tests/`
Contains test files for the extension, organized by test type (unit, integration, end-to-end).

### `resources/`
Contains static resources for the extension, including icons and default templates.

## Implementation Notes

1. The extension follows a modular architecture with clear separation of concerns
2. Core systems are implemented as singletons accessible throughout the codebase
3. Integration with VSCode API is isolated to the integration directory
4. Type definitions ensure strong typing throughout the codebase
5. Tests are organized to match the source code structure 