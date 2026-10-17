@US-MACF-M01 @docs @architecture
Feature: Project Architecture Overview Document Verification
  As a development team member
  I want to ensure the Project Architecture Overview document is correctly structured
  So that it serves as a reliable high-level guide to the MACF project.

  Scenario: Architecture Overview document exists
    Given the file ".cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md"
    Then the file should exist

  Scenario: Architecture Overview document contains correct title
    Given the file ".cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md" exists
    When I read the content of the file ".cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md"
    Then the file content should contain the heading "# MACF Project Architecture Overview"

  Scenario: Architecture Overview document contains Introduction section
    Given the file ".cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md" exists
    When I read the content of the file ".cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md"
    Then the file content should contain the heading "## Introduction"

  Scenario: Architecture Overview document contains Core Components section
    Given the file ".cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md" exists
    When I read the content of the file ".cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md"
    Then the file content should contain the heading "## Core Components"

  Scenario: Architecture Overview document contains Key Services/Modules section
    Given the file ".cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md" exists
    When I read the content of the file ".cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md"
    Then the file content should contain the heading "## Key Services/Modules"

  Scenario: Architecture Overview document contains Data Models section
    Given the file ".cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md" exists
    When I read the content of the file ".cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md"
    Then the file content should contain the heading "## Data Models"

  Scenario: Architecture Overview document contains Communication Flow section
    Given the file ".cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md" exists
    When I read the content of the file ".cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md"
    Then the file content should contain the heading "## Communication Flow between Roles/Components"

  Scenario: Architecture Overview document contains Key Design Principles section
    Given the file ".cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md" exists
    When I read the content of the file ".cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md"
    Then the file content should contain the heading "## Key Design Principles" 