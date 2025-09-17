# Multi-agent Communications Framework

<div align="center">

![Multi-agent Communications Framework](resources/icons/banner.png)

A comprehensive VSCode/Cursor extension implementing a role-based communication system and Agile framework for AI-assisted development.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-orange.svg)]()
[![Status](https://img.shields.io/badge/status-in%20development-yellow.svg)]()

</div>

---

## 📋 Overview

The Multi-agent Communications Framework enables structured communication with specialized AI personas, each with distinct expertise, responsibilities, and visual identities. By implementing clear role differentiation and an integrated Agile workflow, this extension enhances collaboration between users and AI assistants.

---

## ✨ Features

### 🤝 Role-based Communication System

| Role | Abbreviation | Color | Expertise |
|:----:|:------------:|:-----:|:----------|
| 🔵 Executive Secretary | ES | Blue | Project coordination, Scrum Master |
| 🟠 Software Engineering Team | SET | Orange | Technical implementation, coding |
| 🟢 Copy/Technical Writer | CTW | Green | Documentation, content creation |
| 🟣 Designer | DES | Purple | UI/UX design, visual systems |
| 💕 Dating and Relationship Coach | DRC | Pink | Relationship guidance |

- **Direct Role Addressing**: Use `@ROLE: message` syntax to communicate with specific roles
- **Visual Role Differentiation**: Each role has distinctive styling for clear identification
- **Role Context Awareness**: Roles maintain awareness of project state and history

### 🔄 Agile Framework Integration

- **Sprint Management**: Create, track, and complete development sprints
- **User Story Tracking**: Manage user stories with role assignments
- **Agile Ceremonies**: Templates for planning, reviews, and retrospectives
- **Role-specific Tasks**: Assign tasks to appropriate roles based on expertise

### 🎨 Visual Identity System

- **Role-specific Styling**: Consistent visual language for each role
- **Color Coding**: Distinctive colors for immediate role identification
- **Typography Guidelines**: Consistent text styling for readability
- **Accessibility Focus**: Visual design following WCAG standards

### 🧩 Extension Features

- **Role Selector**: Sidebar for quickly switching between roles
- **Template System**: Role-specific templates for common tasks
- **Command Integration**: Extension commands for role management and Agile workflow
- **Settings Customization**: Configurable role behavior and visual identity

---

## 📥 Installation

> **Note**: This extension is currently in development.

Once released, you'll be able to install it from the VSCode Marketplace:

1. Open VSCode/Cursor
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Multi-agent Communications Framework"
4. Click Install

---

## 🛠️ Development Setup

For developers looking to contribute, please see our [development setup guide](docs/development-setup.md) for detailed instructions.

### Quick Start for Developers

```bash
# Clone the repository
git clone https://github.com/automaticjesse/multiagent-communications-framework.git

# Navigate to project directory
cd multiagent-communications-framework

# Install dependencies
npm install

# Build the extension
npm run compile

# Run tests
npm test
```

Launch with debugging: Press F5 in VSCode

---

## 📁 Project Structure

The project follows a modular architecture with clear separation of concerns:

```
extension-project/
├── src/                    # Source code
│   ├── core/               # Core functionality
│   ├── ui/                 # UI components
│   ├── integration/        # VSCode integration
│   ├── agile/              # Agile workflow implementation
│   └── types/              # TypeScript type definitions
├── docs/                   # Documentation
├── tests/                  # Test files
└── resources/              # Static resources
```

For a detailed breakdown, see [directory structure](docs/directory-structure.md).

---

## 📝 Usage

### Communicating with Roles

To address a specific role, use:

```
@ROLE_ABBREVIATION: Your message
```

Examples:
- `@ES: Please coordinate this project`
- `@SET: Please implement this feature`
- `@CTW: Please document this process`

### Role Capabilities

<details>
<summary><b>🔵 Executive Secretary (ES)</b></summary>
<ul>
  <li>Project coordination and organization</li>
  <li>Sprint planning and tracking</li>
  <li>Task delegation and follow-up</li>
  <li>Meeting facilitation</li>
</ul>
</details>

<details>
<summary><b>🟠 Software Engineering Team (SET)</b></summary>
<ul>
  <li>Code implementation and architecture</li>
  <li>Technical feasibility assessment</li>
  <li>Performance optimization</li>
  <li>Debugging and problem-solving</li>
</ul>
</details>

<details>
<summary><b>🟢 Copy/Technical Writer (CTW)</b></summary>
<ul>
  <li>Documentation creation and maintenance</li>
  <li>Content writing and editing</li>
  <li>Style guide development</li>
  <li>Technical concept translation</li>
</ul>
</details>

<details>
<summary><b>🟣 Designer (DES)</b></summary>
<ul>
  <li>Visual design system development</li>
  <li>User interface design</li>
  <li>User experience optimization</li>
  <li>Accessibility compliance</li>
</ul>
</details>

<details>
<summary><b>💕 Dating and Relationship Coach (DRC)</b></summary>
<ul>
  <li>Relationship guidance</li>
  <li>Communication strategy</li>
  <li>Personal growth support</li>
  <li>Dating profile optimization</li>
</ul>
</details>

---

## 🚀 Release Plan

The extension will be released in phases:

| Version | Focus | Status |
|:-------:|:------|:------:|
| 0.1.0   | Core functionality, basic integration | 🟡 In Development |
| 0.2.0   | Enhanced UI, expanded templates | 🔵 Planned |
| 0.3.0   | Agile workflow integration | 🔵 Planned |
| 1.0.0   | Stability, performance, documentation | 🔵 Planned |
| 1.1.0   | Advanced capabilities, custom roles | 🔵 Planned |

See our [release plan](docs/release-plan.md) for detailed information.

---

## 👥 Contributing

We welcome contributions! Please follow these steps:

1. Check existing [issues](https://github.com/automaticjesse/multiagent-communications-framework/issues) or create a new one to discuss your idea
2. Fork the repository
3. Create a feature branch (`git checkout -b feature/your-feature-name`)
4. Make your changes following our coding standards
5. Write tests for your changes
6. Update documentation as needed
7. Submit a pull request

For more details, see our [contribution guidelines](docs/contributing.md).

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 