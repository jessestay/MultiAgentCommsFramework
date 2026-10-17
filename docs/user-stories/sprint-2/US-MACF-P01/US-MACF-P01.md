# User Story: US-MACF-P01 - Formalize and Test Teach Back Context Confirmation Procedure

**User Story ID:** `US-MACF-P01`
**Title:** Formalize and Test Teach Back Context Confirmation Procedure

**As a:** MACF Project Maintainer
**I want:** The "Teach Back Context Confirmation" procedure to be a formally defined and testable rule within the MACF.
**So that:** We ensure consistent understanding and reduce misinterpretations when tasks are delegated between AI roles, particularly for complex changes.

## Description

This user story focuses on codifying the "Teach Back Context Confirmation" procedure into a formal rule within the Multi-Agent Communications Framework (MACF). This procedure is intended to improve clarity and shared understanding when tasks, especially complex ones, are assigned or delegated. The AI role receiving the task (e.g., SET) will briefly summarize their understanding of the task, the key components involved, and potential impacts. This allows the delegating role (e.g., ES) to catch any immediate misunderstandings before significant work begins.

The implementation will involve creating a new rule file, a Behat feature file to test the scenarios governed by this rule, and the necessary step definitions in the `CursorProjectContext.php`.

## Acceptance Criteria

1.  A new rule file (e.g., `.cursor/rules/068-WORKFLOW-teach-back-confirmation.mdc`) is created that clearly defines:
    *   When the Teach Back procedure is required (e.g., for complex tasks, after receiving a Contextual Briefing Package).
    *   What the AI role performing the "teach back" (e.g., SET) must summarize (understanding of the task, key components, potential impacts).
    *   The purpose (allowing the delegating role, e.g., ES, to catch misunderstandings).
2.  A Behat feature file (e.g., `.cursor/tests/features/US-MACF-P01/teach_back_confirmation_procedure.feature`) is created with scenarios to test:
    *   A scenario where the rule is correctly identified as applicable based on task complexity (mocked).
    *   A scenario demonstrating a "teach back" occurring (simulated via step definitions checking for specific log patterns or placeholder actions).
    *   A scenario where the absence of a "teach back" for a complex task would (hypothetically, via rule logic) be flagged.
3.  The corresponding step definitions are implemented in `CursorProjectContext.php`.
4.  All Behat tests for this feature pass.
5.  The `sprint-status.md` for Sprint 2 is updated to include this user story and its tasks. 