# Cursor Cloud Agent Setup

This document explains how the BVital project is configured for Cursor cloud agents.

## Repository Structure

```
BVital/
├── .cursor/                          # Multi-agent Framework (separate git repo)
│   └── [Multi-agent Framework files]
├── .gitignore                        # Excludes .cursor/ from main repo
├── bvital.code-workspace            # VS Code/Cursor workspace config
└── README.md                        # Project documentation
```

## Two Separate Git Repositories

### 1. Main Repository (BVital)
- **Location**: Root directory (`/home/stay/GithubRepos/BVital`)
- **Remote**: `https://github.com/jessestay/BVital.git`
- **Branch**: `main`
- **Contains**: Project-specific files, workspace configuration
- **Excludes**: `.cursor/` directory (via `.gitignore`)

### 2. Framework Repository (Multi-agent Communications Framework)
- **Location**: `.cursor/` directory
- **Remote**: `https://github.com/jessestay/MultiAgentCommsFramework`
- **Branch**: `main`
- **Contains**: Shared multi-agent framework rules, configurations, and tools
- **Purpose**: Shared across multiple projects

## Cursor Cloud Agent Compatibility

This setup is fully compatible with Cursor cloud agents because:

1. **Repository Access**: Both repositories are on GitHub and accessible to cloud agents
2. **Framework Access**: Cloud agents can access the Multi-agent Framework rules in `.cursor/rules/`
3. **Project Isolation**: Main project files remain separate from the framework
4. **Independent Versioning**: Each repository maintains its own version history

## Working with Git

### Main Project Operations
```bash
# Work in the root directory
cd /home/stay/GithubRepos/BVital

# Standard git operations affect only the main repository
git add .
git commit -m "Your message"
git push origin main
```

### Framework Operations
```bash
# Navigate to framework directory
cd /home/stay/GithubRepos/BVital/.cursor

# Git operations here affect the Multi-agent Framework repository
git add .
git commit -m "Framework update"
git push origin main
```

## Cloud Agent Workflow

When Cursor cloud agents access this repository:
1. They clone the main BVital repository
2. The `.cursor/` directory (with its own `.git/`) is present locally
3. Agents can access both:
   - Project-specific code and files
   - Multi-agent Framework rules and configurations from `.cursor/rules/`

This enables cloud agents to leverage the full Multi-agent Communications Framework while working on project-specific tasks.




