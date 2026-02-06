# Multi-Agent Communications Framework (MACF)

**Proprietary & Confidential** - Copyright (c) 2026 Jesse Stay. All Rights Reserved.

The **Multi-Agent Communications Framework (MACF)** is a specialized environment for the Cursor IDE that transforms standard AI interactions into a coordinated, multi-role agile team. It provides a robust structure for roles (like Executive Secretary, Software Engineering Team, Marketing Director), rule enforcement, and standardized workflows.

## 🚀 Installation

You can add this framework to **any** Cursor project to instantly upgrade its AI capabilities. This method replaces the default `.cursor` directory with this framework, ensuring your project's existing codebase and Git history remain clean and unaffected.

### Prerequisites
- A project opened in **Cursor IDE**.
- `git` installed in your terminal.

### Steps to Install (The "Drop-In" Method)

Run the following commands in the **root directory** of your target project:

1.  **Protect your project's git history**:
    Ensure the `.cursor` directory is ignored by your project so the framework doesn't clutter your repository.
    ```bash
    echo ".cursor/" >> .gitignore
    ```

2.  **Remove existing Cursor settings (if any)**:
    *Note: Back up any personal `.cursor/rules` you want to keep before doing this.*
    ```bash
    rm -rf .cursor
    ```

3.  **Install the Framework**:
    Clone this repository directly into the `.cursor` directory.
    ```bash
    git clone https://github.com/jessestay/MultiAgentCommsFramework.git .cursor
    ```

    *Note: By cloning it as a standard git repo inside an ignored folder, you can independently pull updates to the framework (`cd .cursor && git pull`) without affecting your main project's version control.*

## 📂 Default Directory Setup

To fully leverage the MACF, your project should follow a standardized directory structure. This allows the agents to know exactly where to find and place documentation, tests, and code.

### 1. Initialize Structure
You can simply tell the **Executive Secretary (ES)** to "implement the standard MACF file structure," and it will automatically create the necessary folders and files for you. You do not need to instruct it on each individual directory.

The standard structure it will create looks like this:

```text
my-project/
├── .cursor/           # (The framework you just installed)
├── docs/              # Central documentation hub
│   ├── sprint-status.md         # Single Source of Truth for sprint progress
│   ├── technical/               # Tech specs & release plans (RELEASE_PLAN.md)
│   ├── user-stories/            # User stories organized by sprint/area
│   └── logs/                    # Troubleshooting logs
├── tests/             # standardized test directory
│   ├── unit/
│   ├── integration/
│   └── acceptance/
└── scripts/           # (Optional) Helper scripts
```

### 2. Instructing the Agents
Once the `.cursor` folder is in place, the Cursor agents automatically have access to the rules. However, to align them with your specific project context, perform the following **Contextual Initialization** at the start of a session:

1.  Open `Chat`.
2.  Type the following prompt to initialize the team:
    > "Initialize MACF. I am the User. Please read the .cursor/rules/roles to understand your team structure. I want to start by creating a RELEASE_PLAN.md in docs/technical/ if it doesn't exist. Executive Secretary, please take the lead."

The **Executive Secretary (ES)** will then activate, acknowledge the team roles (SET, MD, CTW, etc.), and guide you through the next steps using the installed protocols.

## 💡 Usage & Role Engagement Guide

Once initialized, you engage the team by addressing specific roles using their **@Handle**.

### 1. The Core Team (Most Frequently Used)

| Role | Handle | When to Use | Example Prompt |
| :--- | :--- | :--- | :--- |
| **Executive Secretary** | `@ES` | **Start here.** Project management, coordination, questions about process, or general help. | "@ES: Review our current sprint status and tell me what's next." |
| **Software Engineering Team** | `@SET` | Writing code, debugging, running tests, terminal commands. | "@SET: Implement the login feature for US-AUTH-01 and run tests." |
| **Marketing Director** | `@MD` | Strategy, growth hacking, branding decisions. Leads the Branding Team. | "@MD: Propose a growth strategy for our launch." |
| **Copy/Technical Writer** | `@CTW` | Documentation, READMEs, user guides, editing content. | "@CTW: Update the README to reflect the new features." |
| **Designer** | `@DES` | UI/UX design, visual assets, CSS styling advice. | "@DES: Critique the current homepage layout." |
| **Elite Business Lawyer** | `@EBL` | Legal monitoring, contracts, compliance. | "@EBL: Review this term sheet for risks." |

### 2. Specialized Coaches & Experts

| Role | Handle | When to Use | Example Prompt |
| :--- | :--- | :--- | :--- |
| **Social Media Manager** | `@SMM` | Content calendars, social posts, engagement strategy. | "@SMM: Draft 5 Tweets for the product launch." |
| **Business Income Coach** | `@BIC` | Revenue optimization, business models, credit repair. | "@BIC: Analyze our pricing model for maximum revenue." |
| **Dating & Relationship Coach** | `@DRC` | Interpersonal dynamics, relationship advice. | "@DRC: Advice on handling a difficult partner situation." |
| **Debt Consumer Law Coach** | `@DCL` | Debt defense, consumer law, credit disputes. | "@DCL: Draft a debt validation letter." |
| **Utah Family Lawyer** | `@UFL` | Specific Utah family law code, custody strategy. | "@UFL: What is the Utah code regarding parent-time?" |

### 3. Workflow Examples

**Scenario A: Starting a New Feature**
> **User**: "@ES: I want to build a 'Dark Mode' toggle. Please start a new user story."
> **ES**: Creates the story file in `docs/user-stories/` and assigns tasks.
> **ES**: "@MD: Please have @DES provide design requirements."
> **MD**: Coordinates with DES.
> **ES**: "@SET: Once requirements are ready, please implement."

**Scenario B: Troubleshooting a Bug**
> **User**: "I'm seeing a 500 error on the login page."
> **ES**: "@SET: Please investigate. Check logs and fix."
> **SET**: Runs diagnostics, fixes code, runs tests.
> **ES**: "@CTW: Please log this incident in `docs/logs/`."

## ✨ Features

By implementing the MACF in your project, you gain access to:

*   ** specialized AI Personas**:
    *   🔵 **Executive Secretary (ES)**: Project management, agile coordination, and prompt engineering.
    *   🟠 **Software Engineering Team (SET)**: Technical implementation, TDD/BDD, and debugging.
    *   📊 **Marketing Director (MD)**: Branding, strategy, and growth hacking.
    *   🟢 **Copy/Technical Writer (CTW)**: Documentation, content, and knowledge management.
    *   🟣 **Designer (DES)**: UI/UX and visual design.
    *   ⚖️ **Elite Business Lawyer (EBL)**: Legal monitoring and business protection.
    *   And more (SMM, UFL, DCL, etc.).

*   **Standardized Agile Workflows**:
    *   Built-in templates for User Stories (`docs/user-stories`).
    *   Sprint tracking protocols (`docs/sprint-status.md`).
    *   Troubleshooting logging standards (`docs/logs`).

*   **Robust Rule Enforcement**:
    *   Automatic validation of tool usage.
    *   Strict "No Broken Code" and TDD/BDD testing mandates.
    *   Project file locators to prevent "lost" files.

*   **Growth Hacking Mindset**:
    *   All roles operate with a "Ryan Holiday" growth-hacker persona override for maximum impact and efficiency.

## 📄 License & Contribution

**This software is PROPRIETARY. It is NOT Open Source.**

**Copyright (c) 2026 Jesse Stay. All Rights Reserved.**

### Usage & Contribution Policy
*   **Authorized Use**: You may use this framework in your own projects if you have been granted access to this repository by the Copyright Holder.
*   **Contribution**: We welcome contributions! If you have access, please feel free to submit Pull Requests to improve the framework. By contributing, you agree that your contributions become part of the proprietary software owned by Jesse Stay.
*   **Restrictions**: You may **NOT** copy, redistribute, or use this framework to build a competing product or service without explicit written permission.

See the `LICENSE` file for full legal details.
