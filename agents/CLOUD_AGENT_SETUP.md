# Cloud Agent Setup Guide

This guide explains how to set up and use cloud agents for each role in the Multi-agent Communications Framework.

## Overview

The BVital project includes cloud agent configurations for each role in the MACF. Each agent is specialized for its role while inheriting all framework rules and standards.

## Available Agents

The following cloud agents are available:

| Agent File | Role | Abbreviation | Primary Function |
|-----------|------|--------------|------------------|
| `agent-es.cursorrules` | Executive Secretary | ES | Project coordination, Scrum Master |
| `agent-set.cursorrules` | Software Engineering Team | SET | Technical implementation |
| `agent-md.cursorrules` | Marketing Director | MD | Marketing strategy, brand development |
| `agent-des.cursorrules` | Designer | DES | UI/UX design, visual systems |
| `agent-ctw.cursorrules` | Copy/Technical Writer | CTW | Documentation, content creation |
| `agent-smm.cursorrules` | Social Media Manager | SMM | Social media strategy |
| `agent-drc.cursorrules` | Dating and Relationship Coach | DRC | Relationship guidance |
| `agent-bic.cursorrules` | Business Income Coach | BIC | Revenue growth, business automation |
| `agent-dcl.cursorrules` | Debt Consumer Law Coach | DCL | Debt case management |
| `agent-ufl.cursorrules` | Utah Family Lawyer | UFL | Family law representation |
| `agent-ebl.cursorrules` | Elite Business Lawyer | EBL | Corporate law, contracts, IP |
| `agent-sm.cursorrules` | Scrum Master | SM | Agile process facilitation |

## Agent Configuration Structure

Each agent configuration file includes:

1. **MACF Framework Rules**: All 62+ framework rules from `.cursor/rules/`
2. **Role-Specific Rules**: The specific role definition from `.cursor/rules/roles/`
3. **Role Boundaries**: Clear boundaries and responsibilities
4. **Communication Protocol**: Proper role formatting and communication style
5. **Project Context**: BVital project-specific information

## How to Use Cloud Agents

### Option 1: Copy to Project Root (Temporary Agent Selection)

To use a specific agent for a session:

```bash
# Copy the desired agent configuration to project root
cp .cursor/agents/agent-es.cursorrules .cursorrules

# Use Cursor normally - it will use the ES agent
```

### Option 2: Use in Cursor Cloud Agent Settings

1. Open Cursor Settings
2. Navigate to Cloud Agents or Agent Configuration
3. Reference the agent file path: `.cursor/agents/agent-{role}.cursorrules`
4. Cursor will load the agent configuration

### Option 3: Programmatic Agent Selection

For automated workflows, you can:
- Switch agents by copying different agent files to `.cursorrules`
- Reference agent files directly in API calls
- Use agent selection based on task type

## Agent Capabilities

### Framework Inheritance

All agents inherit:
- **Core Protocol**: Multi-agent framework protocols
- **Directory Standards**: Project structure standards
- **Testing Standards**: TDD/BDD requirements
- **Code Quality**: Coding standards and quality requirements
- **Workflow Standards**: Agile, Git, and process workflows
- **Documentation Standards**: Documentation requirements
- **Tooling Standards**: Tool usage and troubleshooting protocols

### Role-Specific Expertise

Each agent also includes:
- **Role Responsibilities**: Primary and secondary responsibilities
- **Role Boundaries**: What the agent can and cannot do
- **Role Communication**: Proper formatting and style
- **Role Workflows**: Role-specific processes and procedures

## Agent Selection Guidelines

Choose the appropriate agent based on task type:

| Task Type | Recommended Agent |
|-----------|------------------|
| Project coordination, planning | ES (Executive Secretary) |
| Code implementation, debugging | SET (Software Engineering Team) |
| Marketing strategy, branding | MD (Marketing Director) |
| UI/UX design, visual work | DES (Designer) |
| Documentation, content | CTW (Copy/Technical Writer) |
| Social media content | SMM (Social Media Manager) |
| Relationship advice | DRC (Dating and Relationship Coach) |
| Business revenue optimization | BIC (Business Income Coach) |
| Debt legal matters | DCL (Debt Consumer Law Coach) |
| Family law matters | UFL (Utah Family Lawyer) |
| Business law, contracts | EBL (Elite Business Lawyer) |
| Agile process facilitation | SM (Scrum Master) |

## Multi-Agent Collaboration

When working with multiple agents:

1. **Default to ES**: ES coordinates multi-agent work
2. **Clear Handoffs**: Use `@ROLE:` format for inter-agent communication
3. **Role Boundaries**: Respect each agent's boundaries
4. **Framework Compliance**: All agents follow the same framework rules

Example workflow:
```
1. ES receives task and coordinates
2. ES delegates to appropriate agent (@SET:, @MD:, etc.)
3. Agent performs specialized work
4. Agent reports back to ES or user
```

## Updating Agent Configurations

Agent configurations are auto-generated from:
- Framework rules in `.cursor/rules/`
- Role definitions in `.cursor/rules/roles/`

To regenerate agent configurations:

```bash
cd .cursor/agents
python3 generate_agent_configs.py
```

This will update all agent files with the latest framework and role rules.

## Framework Rules Location

All MACF framework rules are in:
- **Framework Rules**: `.cursor/rules/*.mdc` (62+ rules)
- **Role Definitions**: `.cursor/rules/roles/*.mdc` (14 role files)
- **System Rules**: `.cursor/rules/system/*.mdc` (if exists)

## Repository Structure

```
BVital/
├── .cursor/
│   ├── agents/              # Cloud agent configurations
│   │   ├── agent-*.cursorrules  # Individual agent configs
│   │   ├── generate_agent_configs.py  # Generator script
│   │   └── README.md        # Agent overview
│   └── rules/               # MACF framework rules
│       ├── *.mdc            # Framework rules
│       └── roles/           # Role definitions
└── .cursorrules             # Active agent (when copied)
```

## Troubleshooting

### Agent Not Loading Rules

If an agent doesn't seem to have framework rules:
1. Verify `.cursor/rules/` directory exists
2. Check agent configuration file references
3. Regenerate agent configs: `python3 generate_agent_configs.py`

### Role Not Responding Correctly

If an agent isn't following role boundaries:
1. Verify the role file exists: `.cursor/rules/roles/012-ROLES-{role}.mdc`
2. Check agent configuration includes the role file reference
3. Ensure framework rules are properly inherited

### Framework Rules Not Applied

If framework standards aren't being followed:
1. Verify all framework rule files exist in `.cursor/rules/`
2. Check agent configuration lists all framework rules
3. Ensure the agent can access the `.cursor/` directory

## Next Steps

1. **Choose an Agent**: Select the appropriate agent for your task
2. **Load Agent Config**: Copy to `.cursorrules` or reference in settings
3. **Start Working**: The agent will operate with full MACF framework access
4. **Switch Agents**: Change agents as needed for different tasks

---

*All agents are configured to work independently while maintaining full access to the Multi-agent Communications Framework rules and standards.*


