# US-MACF-INFRA-01: Implement Project Bootstrap Script for MACF Standards

As a Developer starting a new project with MACF / Project Lead
I want an executable script that initializes a new project directory with the standard MACF folder structure, essential configuration file placeholders, and the latest `.cursor/rules`
So that I can rapidly set up new projects that adhere to MACF standards from the outset, ensuring consistency, saving setup time, and addressing foundational structural needs like the `src/` directory.

## Business Value
Reduces manual setup time for new projects, ensures immediate compliance with MACF standards (directory structure, rules, basic configs), and promotes a consistent development environment. Addresses the common question of initial project layout, including the `src/` directory.

## Acceptance Criteria
1.  **AC1: Script Executability & Core Structure:**
    *   **Given** the bootstrap script is available.
    *   **When** the script is executed with a new project name.
    *   **Then** a new directory for the project is created.
    *   **And** the standard MACF directory structure (as defined in `020-PROJECT-directory-structure.mdc`) is created within the project, including `src/`, `docs/` (with subdirectories like `user-stories/backlog`, `technical`, `logs`), `tests/` (with `unit`, `integration`, `acceptance`), `backups/`, and `.cursor/`.

2.  **AC2: Rules Integration:**
    *   **Given** the script has created the project structure.
    *   **When** the `.cursor/` directory is inspected.
    *   **Then** it MUST contain a copy (or symlink, if appropriate for the system) of the latest master `.cursor/rules/` for the MACF.

3.  **AC3: Placeholder READMEs & .gitignore:**
    *   **Given** the script has created the project structure.
    *   **When** key directories are inspected.
    *   **Then** placeholder `README.md` files (explaining directory purpose) MUST exist in key directories (e.g., `docs/`, `src/`, `tests/`) as per `020-PROJECT-directory-structure.mdc`.
    *   **And** a basic `.gitignore` file MUST be created at the project root, including common ignores (e.g., `backups/`, `node_modules/`, `vendor/`, OS-specific files, IDE files like `.vscode/`).

4.  **AC4: Basic Configuration Placeholders (Language Agnostic):**
    *   **Given** the script has run.
    *   **When** the project root is inspected.
    *   **Then** placeholder or example configuration files for common project types MAY be included (e.g., a generic `config.example.json`, `Makefile.example`), or instructions on how to add language-specific setups. (Detailed language-specific setup is for US-MACF-INFRA-02).

5.  **AC5: Script Output & Idempotency:**
    *   **Given** the script is run.
    *   **When** it executes.
    *   **Then** it MUST provide clear output of actions taken (e.g., "Created directory: src/", "Copied .cursor/rules").
    *   **And** the script SHOULD be idempotent (i.e., running it multiple times on an already set up directory doesn't cause errors or unintended changes, perhaps by checking for existing structures).

## Tasks
1.  Design script logic and choose implementation language (e.g., Bash, Python).
2.  Implement directory creation logic based on `020-PROJECT-directory-structure.mdc`.
3.  Implement `.cursor/rules` copying/symlinking mechanism.
4.  Implement `README.md` and `.gitignore` generation.
5.  Add basic language-agnostic configuration file placeholders or guidance.
6.  Implement script output and idempotency checks.
7.  Write usage instructions and documentation for the script.

## Definition of Done
1.  All ACs are met and verified.
2.  The bootstrap script is executable and successfully creates the standard MACF project structure.
3.  `.cursor/rules` are correctly integrated.
4.  Placeholder `README.md` files and a `.gitignore` are present.
5.  The script provides clear operational feedback.
6.  Documentation for using the script is created. 