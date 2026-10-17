# Cloud Agent Configurations

This directory contains cloud agent configurations for each role in the Multi-agent Communications Framework.

## Overview

Each agent configuration file is designed to be used as a Cursor cloud agent. The agents are specialized for their specific roles while inheriting all MACF framework rules.

## Available Agents

- **ES** - Executive Secretary (Project coordination, Scrum Master)
- **SET** - Software Engineering Team (Technical implementation)
- **MD** - Marketing Director (Marketing strategy, brand development)
- **DES** - Designer (UI/UX design, visual systems)
- **CTW** - Copy/Technical Writer (Documentation, content creation)
- **SMM** - Social Media Manager (Social media strategy)
- **DRC** - Dating and Relationship Coach (Relationship guidance)
- **BIC** - Business Income Coach (Revenue growth, business automation)
- **DCL** - Debt Consumer Law Coach (Debt case management)
- **UFL** - Utah Family Lawyer (Family law representation)
- **EBL** - Elite Business Lawyer (Corporate law, contracts, IP)
- **SM** - Scrum Master (Agile process facilitation)

## How to Use

### For Cursor Cloud Agents

Each agent configuration file (`.cursorrules`) can be:
1. Copied to the project root as `.cursorrules` to set the active agent
2. Used in Cursor's cloud agent settings by referencing the file path
3. Loaded programmatically for automated agent selection

### Agent Configuration Structure

Each agent configuration includes:
- **MACF Framework Rules**: All framework rules from `.cursor/rules/`
- **Role-Specific Rules**: The specific role definition from `.cursor/rules/roles/`
- **Role Boundaries**: Clear boundaries and responsibilities
- **Communication Protocol**: Proper role formatting and communication style

## Framework Rules Included

All agents inherit these MACF framework rules:
- Core protocol and multi-agent framework
- Directory structure standards
- Testing standards (TDD/BDD)
- Code quality standards
- Workflow standards (Agile, Git, etc.)
- Documentation standards
- Tooling standards
- Troubleshooting protocols

## Role-Specific Configuration

Each agent also includes:
- Role-specific responsibilities and expertise
- Role boundaries and limitations
- Role communication format and style
- Role-specific workflows and processes

## Creating a New Agent

To create a new agent configuration:

1. Create a new `.cursorrules` file named after the role (e.g., `agent-es.cursorrules`)
2. Include the MACF framework rules reference
3. Include the role-specific rules reference
4. Document any role-specific configuration

See existing agent files for the template structure.


