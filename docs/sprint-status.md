# MACF Project - Sprint Status

**Current Sprint**: Sprint 2
**Previous Sprint**: Sprint 1 (Completed - Structural setup and initial documentation for the MACF Project established as per US-CRS-T01. Test execution pending test runner setup for MACF Project.)

## Sprint 2: Foundational Behat Components & Core Procedures

**Goal:** Establish core reusable Behat step definitions for UI interactions and common file/directory operations, and define key MACF project procedures.

**User Stories:**

1.  **`US-MACF-M01`: Implement Enhanced Pre-Task Contextual Briefing and Project Architecture Overview Document**
    *   **Status:** DONE (Rule metadata additions for 056 and 067 are pending due to `edit_file` tool issues. `CursorProjectContext.php` update assumed successful.)
    *   **Summary:** This story defined the "Contextual Briefing Package" procedure (Rule 067) and the `PROJECT_ARCHITECTURE_OVERVIEW.md` document, along with its maintenance rule (Rule 056). Behat tests for these rules and documents were created, and the `CursorProjectContext.php` was updated with necessary step definitions.
    *   **Key Files:**
        *   `.cursor/rules/067-WORKFLOW-contextual-briefing.mdc`
        *   `.cursor/rules/056-DOCS-architecture-overview-maintenance.mdc`
        *   `.cursor/docs/technical/PROJECT_ARCHITECTURE_OVERVIEW.md`
        *   `.cursor/tests/features/US-MACF-M01/` (and its contents)
        *   `.cursor/tests/features/bootstrap/CursorProjectContext.php`

2.  **`US-MACF-F01`: Create Reusable Behat Steps for Common File and Directory Operations**
    *   **Status:** To Do
    *   **Summary:** (To be detailed)

3.  **`US-MACF-F02`: Develop Reusable Behat Steps for Basic UI Interactions**
    *   **Status:** To Do
    *   **Summary:** (To be detailed)

4.  **`US-MACF-F03`: Establish a Base Behat Test Context with Mink Integration**
    *   **Status:** To Do
    *   **Summary:** (To be detailed)

5.  **`US-MACF-P01`: Formalize and Test Teach Back Context Confirmation Procedure**
    *   **Status:** To Do
    *   **Summary:** This story will codify the "Teach Back Context Confirmation" procedure into a formal, testable rule within the MACF to improve clarity and shared understanding for task delegation.
    *   **Key Files (Expected):**
        *   `.cursor/rules/068-WORKFLOW-teach-back-confirmation.mdc`
        *   `.cursor/docs/user-stories/sprint-2/US-MACF-P01/`
        *   `.cursor/tests/features/US-MACF-P01/`

## User Stories in Sprint 2

| ID        | Title                                                              | Status    | Notes |
|-----------|--------------------------------------------------------------------|-----------|-------|
| US-CRS-F01 | Create Reusable Behat Steps for Common WordPress Admin Actions     | To Do     |       |
| US-CRS-F02 | Develop Reusable Behat Steps for Basic UI Interactions             | To Do     |       |
| US-CRS-F03 | Establish a Base Behat Test Context with Mink Integration          | To Do     |       |
| US-MACF-P01 | Formalize and Test Teach Back Context Confirmation Procedure       | To Do     |       |

## User Stories in Sprint 1 (Completed)

| ID        | Title                                                              | Status    | Notes                                      |
|-----------|--------------------------------------------------------------------|-----------|--------------------------------------------|
| US-CRS-T01 | Establish Core Reusable Testing Framework Structure and Documentation for MACF Project | Completed | Structural files & step definitions created. |

## Links
- **Sprint 1 User Stories**: [./user-stories/sprint-1/](./user-stories/sprint-1/)
- **Sprint 2 User Stories**: [./user-stories/sprint-2/](./user-stories/sprint-2/) 